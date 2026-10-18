import { lineAt } from '../cues'
import { useLivePosition } from '../show'
import { useSongCues } from '../useSongCues'

/**
 * Audience / LED wall view: kinetic typography. Each word rises in as it is sung,
 * and the line clears after it ends. Capture this window into the media server (NDI/OBS).
 */
export default function Led() {
  const { song: songId, t } = useLivePosition()
  const song = useSongCues(songId)
  const lines = song?.cues?.lines ?? []
  const idx = lineAt(lines, t)
  const line = lines[idx]
  const visible = line && t < line.end + 1.5

  return (
    <div className="led">
      {visible && (
        <div className="led-line" key={idx}>
          {line.words.map((w, k) => {
            const shown = w.start <= t
            const active = shown && t < w.end + 0.15
            return (
              <span
                key={k}
                className={`led-word ${shown ? 'shown' : ''} ${active ? 'active' : ''}`}
                style={{ transitionDelay: shown ? '0ms' : undefined }}
              >
                {w.text}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
