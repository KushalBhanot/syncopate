export type CueWord = { text: string; start: number; end: number; score: number | null }
export type CueLine = { text: string; section: string | null; start: number; end: number; words: CueWord[] }
export type Cues = { duration: number; lines: CueLine[] }

export type SongStatus = 'queued' | 'aligning' | 'ready' | 'error'
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
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text()) || res.statusText)
  return res.json() as Promise<T>
}

export const api = {
  list: () => fetch('/api/songs').then((r) => json<Song[]>(r)),
  get: (id: string) => fetch(`/api/songs/${id}`).then((r) => json<Song>(r)),
  create: (form: FormData) => fetch('/api/songs', { method: 'POST', body: form }).then((r) => json<Song>(r)),
  remove: (id: string) => fetch(`/api/songs/${id}`, { method: 'DELETE' }).then((r) => json(r)),
  saveCues: (id: string, cues: Cues) =>
    fetch(`/api/songs/${id}/cues`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cues),
    }).then((r) => json(r)),
  audioUrl: (id: string) => `/api/songs/${id}/audio`,
  exportUrl: (id: string, fmt: 'lrc' | 'srt' | 'csv') => `/api/songs/${id}/export.${fmt}`,
}
