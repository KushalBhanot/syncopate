import { fromV2, isV2, newId, toV2, withIds, type CueDocV2, type ReviewState } from './domain/cues'
import { localdb } from './localdb'
import { STATIC } from './mode'

// Editor-side view of cues (seconds). IDs and review state come from schema v2 (domain/cues.ts).
export type CueWord = { id?: string; text: string; start: number; end: number; score: number | null; inferred?: boolean }
export type CueLine = {
  id?: string
  text: string
  section: string | null
  review?: ReviewState
  start: number
  end: number
  words: CueWord[]
}
export type Cues = {
  duration: number
  lines: CueLine[]
  provenance?: Record<string, unknown>
  /** Revision these cues were loaded from; saves must name it so stale edits are caught. */
  revisionId?: string
}

/** Someone else saved these cues after you opened them. */
export class SaveConflict extends Error {}
/** The server rejected the timing; problems explain why. */
export class SaveInvalid extends Error {
  problems: string[]
  constructor(problems: string[]) {
    super(problems.join('; '))
    this.problems = problems
  }
}
export type SaveResult = { revisionId: string }

/** Any stored or fetched cue payload (v1 seconds or v2 document) as editor cues with IDs. */
export function readCues(raw: unknown): Cues {
  return isV2(raw) ? fromV2(raw) : withIds(raw as Cues)
}

export type SongStatus = 'queued' | 'aligning' | 'ready' | 'error'
export type Credit = { license: string; license_url: string; source: string; note: string }
export type Song = {
  id: string
  title: string
  artist: string
  status: SongStatus
  created: number
  duration?: number
  seconds_taken?: number
  error?: string
  cues?: Cues | null
  /** Where the editor loads audio from. */
  audioUrl?: string
  /** server: uploaded to the API. demo: ships with the site. local: opened from this browser. */
  source?: 'server' | 'demo' | 'local'
  /** Demo songs: license attribution. */
  credit?: Credit
  /** Demo songs: the visitor has edited the timings in this browser. */
  edited?: boolean
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
  return res.json() as Promise<T>
}

// ---- Python API ------------------------------------------------------------------------

const serverBackend = {
  list: () => fetch('/api/songs').then((r) => json<Song[]>(r)),
  get: (id: string) =>
    fetch(`/api/songs/${id}`)
      .then((r) => json<Song>(r))
      .then((s): Song => ({
        ...s,
        cues: s.cues ? readCues(s.cues) : null,
        source: 'server',
        audioUrl: `/api/songs/${id}/audio`,
      })),
  create: (form: FormData) => fetch('/api/songs', { method: 'POST', body: form }).then((r) => json<Song>(r)),
  remove: (id: string) => fetch(`/api/songs/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  async saveCues(id: string, cues: Cues): Promise<SaveResult> {
    const res = await fetch(`/api/songs/${id}/cues`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(cues.revisionId ? { 'If-Match': cues.revisionId } : {}) },
      body: JSON.stringify(toV2(cues)),
    })
    if (res.status === 409) throw new SaveConflict('These cues were changed elsewhere after you opened them.')
    if (res.status === 422) {
      const body = await res.json().catch(() => ({}))
      throw new SaveInvalid(body?.detail?.problems ?? ['Invalid cue timing'])
    }
    const body = await json<{ revision: { id: string } }>(res)
    return { revisionId: body.revision.id }
  },
}

// ---- Static site: demo songs + songs opened in this browser ------------------------------

type DemoEntry = { id: string; title: string; artist: string; duration: number; audio: string; cues: string; credit: Credit }
/** Stored cues are a v2 document; records written before schema v2 hold v1 cues and migrate on read. */
type LocalSong = { meta: Song; cues: CueDocV2 | Cues; audio: Blob }

const LOCAL = 'song:' // IndexedDB key prefix for songs opened in this browser
const EDITS = 'edits:' // IndexedDB key prefix for edited demo cues
const BACKUP = 'backup:v1:' // untouched copy of any v1 record, written before its first migration

/** Converts a stored v1 record to v2 in place, keeping the original under BACKUP first. */
async function migrateStored(key: string, raw: CueDocV2 | Cues, rewrite: (doc: CueDocV2) => Promise<unknown>): Promise<Cues> {
  if (isV2(raw)) return fromV2(raw)
  if ((await localdb.get(BACKUP + key)) === undefined) await localdb.set(BACKUP + key, raw)
  const doc = { ...toV2(raw), revision: { id: newId('rev'), parent: null, author: 'migration', created_at: new Date().toISOString() } }
  await rewrite(doc)
  return fromV2(doc)
}

function nextRevision(cues: Cues): CueDocV2 {
  return {
    ...toV2(cues),
    revision: { id: newId('rev'), parent: cues.revisionId ?? null, author: 'this browser', created_at: new Date().toISOString() },
  }
}

let demoCatalog: Promise<DemoEntry[]> | null = null
const demos = () => (demoCatalog ??= fetch('/demo/index.json').then((r) => json<DemoEntry[]>(r)))

const blobUrls = new Map<string, string>()
function audioUrlFor(id: string, blob: Blob) {
  if (!blobUrls.has(id)) blobUrls.set(id, URL.createObjectURL(blob))
  return blobUrls.get(id)!
}

const demoSong = (d: DemoEntry): Song => ({
  id: d.id,
  title: d.title,
  artist: d.artist,
  status: 'ready',
  created: 0,
  duration: d.duration,
  source: 'demo',
  credit: d.credit,
  audioUrl: d.audio,
})

const staticBackend = {
  async list(): Promise<Song[]> {
    const keys = await localdb.keys()
    const local = await Promise.all(
      keys.filter((k) => k.startsWith(LOCAL)).map((k) => localdb.get<LocalSong>(k).then((s) => s!.meta)),
    )
    const edited = new Set(keys.filter((k) => k.startsWith(EDITS)).map((k) => k.slice(EDITS.length)))
    const demo = (await demos()).map((d) => ({ ...demoSong(d), edited: edited.has(d.id) }))
    return [...local.sort((a, b) => b.created - a.created), ...demo]
  },

  async get(id: string): Promise<Song> {
    const local = await localdb.get<LocalSong>(LOCAL + id)
    if (local) {
      const cues = await migrateStored(LOCAL + id, local.cues, (doc) => localdb.set(LOCAL + id, { ...local, cues: doc }))
      return { ...local.meta, cues, audioUrl: audioUrlFor(id, local.audio) }
    }
    const d = (await demos()).find((x) => x.id === id)
    if (!d) throw new Error('No such song')
    const edits = await localdb.get<CueDocV2 | Cues>(EDITS + id)
    const cues = edits
      ? await migrateStored(EDITS + id, edits, (doc) => localdb.set(EDITS + id, doc))
      : readCues(await fetch(d.cues).then((r) => r.json()))
    return { ...demoSong(d), cues, edited: !!edits }
  },

  async addLocal(audio: File, cues: Cues, title: string, artist: string): Promise<Song> {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    const meta: Song = {
      id,
      title,
      artist,
      status: 'ready',
      created: Date.now() / 1000,
      duration: cues.duration,
      source: 'local',
    }
    await localdb.set(LOCAL + id, { meta, cues: nextRevision(withIds(cues)), audio } satisfies LocalSong)
    return meta
  },

  async saveCues(id: string, cues: Cues): Promise<SaveResult> {
    const doc = nextRevision(cues)
    const local = await localdb.get<LocalSong>(LOCAL + id)
    if (local) await localdb.set(LOCAL + id, { ...local, cues: doc })
    else await localdb.set(EDITS + id, doc)
    return { revisionId: doc.revision!.id }
  },

  /** Local songs are deleted; demo songs go back to their original timings. */
  async remove(id: string) {
    await localdb.remove(LOCAL + id)
    await localdb.remove(EDITS + id)
    return { ok: true }
  },

  create: async (_form: FormData): Promise<Song> => {
    throw new Error('Automatic alignment needs the Syncopate server')
  },
}

export const api = STATIC ? staticBackend : serverBackend
export const localSongs = staticBackend
