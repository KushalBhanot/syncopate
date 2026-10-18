/**
 * Cue file formats, done in the browser so exports include unsaved edits and work without a server.
 * Output matches core/src/syncopate/export.py.
 */
import type { CueLine, CueWord, Cues } from './api'

function lrcTime(t: number) {
  const a = Math.max(t, 0)
  const m = Math.floor(a / 60)
  return `${String(m).padStart(2, '0')}:${(a - m * 60).toFixed(2).padStart(5, '0')}`
}

function srtTime(t: number) {
  let ms = Math.round(Math.max(t, 0) * 1000)
  const h = Math.floor(ms / 3_600_000)
  ms -= h * 3_600_000
  const m = Math.floor(ms / 60_000)
  ms -= m * 60_000
  const s = Math.floor(ms / 1000)
  ms -= s * 1000
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toLrc(cues: Cues, title?: string, artist?: string) {
  const head = [title && `[ti:${title}]`, artist && `[ar:${artist}]`].filter(Boolean)
  return [...head, ...cues.lines.map((l) => `[${lrcTime(l.start)}]${l.text}`)].join('\n') + '\n'
}

export function toSrt(cues: Cues) {
  return cues.lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join('\n')
}

export function toCsv(cues: Cues) {
  const rows = cues.lines.map((l, i) =>
    [String(i + 1), l.start.toFixed(3), l.end.toFixed(3), l.section ?? '', l.text].map(csvCell).join(','),
  )
  return ['cue,start_seconds,end_seconds,section,text', ...rows].join('\r\n') + '\r\n'
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Read a cue file: Syncopate JSON (from `syncopate align -o song.json`, with word timings) or
 * LRC (line timings only; words are spread evenly across each line so highlighting still moves).
 */
export function parseCueFile(name: string, text: string, duration: number): Cues {
  if (name.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text) as Cues
    if (!Array.isArray(data.lines)) throw new Error('This JSON file has no "lines"')
    return data
  }
  const stamped: { start: number; text: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const lyric = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) if (lyric) stamped.push({ start: Number(s[1]) * 60 + Number(s[2]), text: lyric })
  }
  if (!stamped.length) throw new Error('No timed lines found. Use a Syncopate .json or an .lrc file.')
  stamped.sort((a, b) => a.start - b.start)
  const lines: CueLine[] = stamped.map((l, i) => {
    const end = Math.min(stamped[i + 1]?.start ?? duration, l.start + 8)
    const parts = l.text.split(/\s+/)
    const step = (end - l.start) / parts.length
    const words: CueWord[] = parts.map((w, k) => ({
      text: w,
      start: l.start + k * step,
      end: l.start + (k + 1) * step,
      score: null,
    }))
    return { text: l.text, section: null, start: l.start, end, words }
  })
  return { duration, lines }
}
