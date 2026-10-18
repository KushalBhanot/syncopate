import type { CueLine, Cues } from './api'

/** Index of the last line whose start is <= t (or -1 before the first line). */
export function lineAt(lines: CueLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].start <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/** Number of words in a line already started at time t. */
export function wordsSung(line: CueLine, t: number): number {
  let n = 0
  for (const w of line.words) if (w.start <= t) n++
  return n
}

/** Shift a whole line (and its words) by delta seconds. */
export function shiftLine(cues: Cues, index: number, delta: number): Cues {
  const lines = cues.lines.map((line, i) =>
    i !== index
      ? line
      : {
          ...line,
          start: line.start + delta,
          end: line.end + delta,
          words: line.words.map((w) => ({ ...w, start: w.start + delta, end: w.end + delta })),
        },
  )
  return { ...cues, lines }
}

export function formatTime(t: number): string {
  const sign = t < 0 ? '-' : ''
  const a = Math.abs(t)
  const m = Math.floor(a / 60)
  const s = a - m * 60
  return `${sign}${m}:${s.toFixed(2).padStart(5, '0')}`
}
