/**
 * Cue schema v2, mirrored from core/src/syncopate/domain/cues.py: stable IDs, integer ms,
 * original text, per-line review state and revisions. The editor works in seconds (Cues);
 * these converters keep IDs and review state across the round trip.
 */
import type { Cues, CueLine } from '../api'

export type ReviewState = 'unchecked' | 'approved'
export type WordV2 = {
  id: string
  text: string
  start_ms: number
  end_ms: number
  score: number | null
  score_kind?: string
  inferred?: boolean
}
export type LineV2 = {
  id: string
  text: string
  section: string | null
  start_ms: number
  end_ms: number
  review: ReviewState
  words: WordV2[]
}
export type Revision = { id: string; parent: string | null; author: string; created_at: string; cue_hash?: string }
export type CueDocV2 = {
  schema: 2
  duration_ms: number
  provenance: Record<string, unknown>
  lines: LineV2[]
  revision?: Revision
}

const ms = (s: number) => Math.max(0, Math.round((s || 0) * 1000))
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

export function isV2(x: unknown): x is CueDocV2 {
  return !!x && typeof x === 'object' && (x as { schema?: number }).schema === 2
}

export function fromV2(doc: CueDocV2): Cues {
  return {
    duration: doc.duration_ms / 1000,
    provenance: doc.provenance,
    revisionId: doc.revision?.id,
    lines: doc.lines.map((l) => ({
      id: l.id,
      text: l.text,
      section: l.section,
      review: l.review,
      start: l.start_ms / 1000,
      end: l.end_ms / 1000,
      words: l.words.map((w) => ({
        id: w.id,
        text: w.text,
        start: w.start_ms / 1000,
        end: w.end_ms / 1000,
        score: w.score,
        inferred: w.inferred,
      })),
    })),
  }
}

/** Seconds-based cues to a v2 document. IDs are kept; missing ones (v1 data) are minted. */
export function toV2(cues: Cues): CueDocV2 {
  const scoreKind = String(cues.provenance?.score_kind ?? 'legacy-unknown')
  return {
    schema: 2,
    duration_ms: ms(cues.duration),
    provenance: cues.provenance ?? { provider: 'legacy-unknown' },
    lines: cues.lines.map((l: CueLine) => ({
      id: l.id ?? newId('l'),
      text: l.text,
      section: l.section ?? null,
      review: l.review ?? 'unchecked',
      start_ms: ms(l.start),
      end_ms: ms(l.end),
      words: l.words.map((w) => ({
        id: w.id ?? newId('w'),
        text: w.text,
        start_ms: ms(w.start),
        end_ms: ms(w.end),
        score: w.score,
        score_kind: scoreKind,
        inferred: !!w.inferred,
      })),
    })),
  }
}

/** Gives v1 cues (no IDs) stable IDs once, so later edits can refer to them. */
export function withIds(cues: Cues): Cues {
  return fromV2({ ...toV2(cues), revision: cues.revisionId ? ({ id: cues.revisionId } as Revision) : undefined })
}

/** Same invariants as the server. Returns readable problems; empty means valid. */
export function validateCues(cues: Cues): string[] {
  const problems: string[] = []
  let prevStart = -1
  cues.lines.forEach((l, i) => {
    const where = `Line ${i + 1}`
    const s = ms(l.start)
    const e = ms(l.end)
    if (!Number.isFinite(l.start) || !Number.isFinite(l.end) || l.start < 0) problems.push(`${where}: invalid time`)
    else if (s > e) problems.push(`${where} starts after it ends`)
    else if (s < prevStart) problems.push(`${where} starts before the line above it`)
    prevStart = Math.max(prevStart, s)
    let prevWord = -1
    l.words.forEach((w, k) => {
      const ws = ms(w.start)
      if (!Number.isFinite(w.start) || w.start < 0 || ws > ms(w.end)) problems.push(`${where}, word ${k + 1}: invalid time`)
      else if (ws < prevWord) problems.push(`${where}, word ${k + 1}: out of order`)
      else prevWord = ws
    })
  })
  return problems
}
