import { useMemo } from 'react'
import { formatTime, lineAt, wordsSung } from '../cues'
import { useLivePosition } from '../show'
import { useSongCues } from '../useSongCues'

/**
 * Artist prompter for a floor wedge. High contrast, huge type, the next line visible early.
 * URL options: ?lead=0.5 (seconds a line appears before it is sung), ?mirror=1 (beam-splitter glass).
 */
export default function Prompter() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const lead = Number(params.get('lead') ?? 0.5)
  const mirror = params.get('mirror') === '1'
  const { connected, song: songId, t } = useLivePosition()
  const song = useSongCues(songId)
  const lines = song?.cues?.lines ?? []

  const idx = lineAt(lines, t + lead)
  const line = lines[idx]
  const next = lines[idx + 1]
  const prev = lines[idx - 1]
  const sung = line ? wordsSung(line, t) : 0
  const untilNext = next ? next.start - t : null

  return (
    <div className={`prompter ${mirror ? 'mirror' : ''}`}>
      <div className="prompter-bar">
        <span>{line?.section ?? ''}</span>
        <span>{song ? song.title : 'Waiting for a song…'}</span>
        <span className={`live-dot ${connected ? 'on' : ''}`}>{connected ? formatTime(t) : 'Offline'}</span>
      </div>

      {!song && (
        <div className="prompter-idle">
          Open a song in the editor and press play.
          <br />
          This screen follows along.
        </div>
      )}

      {song && (
        <div className="prompter-stage">
          <div className="p-prev">{prev?.text ?? ''}</div>
          <div className="p-current" key={idx}>
            {idx < 0 ? (
              <span className="p-countin">{lines[0] ? `First line in ${Math.max(0, lines[0].start - t).toFixed(0)}s` : ''}</span>
            ) : (
              line.words.map((w, k) => (
                <span key={k} className={k < sung ? 'w sung' : k === sung ? 'w next-word' : 'w'}>
                  {w.text}{' '}
                </span>
              ))
            )}
          </div>
          <div className="p-next">
            {next?.section && next.section !== line?.section && <span className="p-section">{next.section}</span>}
            {next?.text ?? ''}
          </div>
          {untilNext != null && untilNext > 4 && idx >= 0 && line && t > line.end + 1 && (
            <div className="p-gap">Next line in {Math.ceil(untilNext)}s</div>
          )}
        </div>
      )}
    </div>
  )
}
