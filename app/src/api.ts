import { localdb } from './localdb'
import { STATIC } from './mode'

export type CueWord = { text: string; start: number; end: number; score: number | null }
export type CueLine = { text: string; section: string | null; start: number; end: number; words: CueWord[] }
export type Cues = { duration: number; lines: CueLine[] }

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
      .then((s): Song => ({ ...s, source: 'server', audioUrl: `/api/songs/${id}/audio` })),
  create: (form: FormData) => fetch('/api/songs', { method: 'POST', body: form }).then((r) => json<Song>(r)),
  remove: (id: string) => fetch(`/api/songs/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  saveCues: (id: string, cues: Cues) =>
    fetch(`/api/songs/${id}/cues`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cues),
    }).then((r) => json(r)),
}

// ---- Static site: demo songs + songs opened in this browser ------------------------------

type DemoEntry = { id: string; title: string; artist: string; duration: number; audio: string; cues: string; credit: Credit }
type LocalSong = { meta: Song; cues: Cues; audio: Blob }

const LOCAL = 'song:' // IndexedDB key prefix for songs opened in this browser
const EDITS = 'edits:' // IndexedDB key prefix for edited demo cues

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
    if (local) return { ...local.meta, cues: local.cues, audioUrl: audioUrlFor(id, local.audio) }
    const d = (await demos()).find((x) => x.id === id)
    if (!d) throw new Error('No such song')
    const edits = await localdb.get<Cues>(EDITS + id)
    const cues = edits ?? (await fetch(d.cues).then((r) => json<Cues>(r)))
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
    await localdb.set(LOCAL + id, { meta, cues, audio } satisfies LocalSong)
    return meta
  },

  async saveCues(id: string, cues: Cues) {
    const local = await localdb.get<LocalSong>(LOCAL + id)
    if (local) await localdb.set(LOCAL + id, { ...local, cues })
    else await localdb.set(EDITS + id, cues)
    return { ok: true }
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
