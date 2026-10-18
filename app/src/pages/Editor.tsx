import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type Cues, type Song } from '../api'
import { formatTime, lineAt, shiftLine, wordsSung } from '../cues'
import { useShowSocket } from '../show'
import EnvBadge from '../EnvBadge'
import { download, toCsv, toLrc, toSrt } from '../exportCues'
import { STATIC } from '../mode'

const NUDGE = 0.05 // seconds per [ or ] press
// Calibrated on JamendoLyrics (results/jamendo_demucs.json): lines below 0.10 are off by >300 ms
// 57% of the time, and this flag catches 68% of all late lines.
const LOW_CONFIDENCE = 0.1

export default function Editor() {
  const { id = '' } = useParams()
  const [song, setSong] = useState<Song | null>(null)
  const [cues, setCues] = useState<Cues | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(0)
  const audio = useRef<HTMLAudioElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [follow, setFollow] = useState(true)
  const { connected, send } = useShowSocket()

  useEffect(() => {
    api.get(id).then((s) => {
      setSong(s)
      setCues(s.cues ?? null)
    })
  }, [id])

  const broadcast = useCallback(() => {
    const a = audio.current
    if (a) send({ song: id, t: a.currentTime, playing: !a.paused })
  }, [id, send])

  // Drive the clock from the audio element and keep every screen in step.
  useEffect(() => {
    let raf = 0
    let lastSent = 0
    const tick = (now: number) => {
      const a = audio.current
      if (a) {
        setT(a.currentTime)
        if (!a.paused && now - lastSent > 250) {
          broadcast()
          lastSent = now
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [broadcast])

  const current = cues ? lineAt(cues.lines, t) : -1

  useEffect(() => {
    if (follow && playing && current >= 0) setSelected(current)
  }, [current, follow, playing])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const seek = useCallback(
    (time: number) => {
      const a = audio.current
      if (!a) return
      a.currentTime = Math.max(0, time)
      setT(a.currentTime)
      broadcast()
    },
    [broadcast],
  )

  const toggle = useCallback(() => {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play()
    else a.pause()
  }, [])

  const nudge = useCallback(
    (delta: number) => {
      if (!cues) return
      setCues(shiftLine(cues, selected, delta))
      setDirty(true)
    },
    [cues, selected],
  )

  const tapToNow = useCallback(() => {
    if (!cues || !audio.current) return
    nudge(audio.current.currentTime - cues.lines[selected].start)
  }, [cues, nudge, selected])

  const save = useCallback(async () => {
    if (!cues) return
    setSaving(true)
    await api.saveCues(id, cues)
    setSaving(false)
    setDirty(false)
  }, [cues, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (!cues) return
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        save()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return // leave browser shortcuts alone
      switch (e.key) {
        case ' ':
          e.preventDefault() // also stops a focused button from toggling a second time
          toggle()
          break
        case 'ArrowDown':
          e.preventDefault()
          setFollow(false)
          setSelected((i) => Math.min(i + 1, cues.lines.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFollow(false)
          setSelected((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          seek(cues.lines[selected].start - 1)
          break
        case '[':
          nudge(-NUDGE)
          break
        case ']':
          nudge(NUDGE)
          break
        case 't':
        case 'T':
          tapToNow()
          break
        case 'f':
        case 'F':
          setFollow((v) => !v)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cues, nudge, save, seek, selected, tapToNow, toggle])

  const duration = cues?.duration ?? song?.duration ?? 0
  const lowConfidence = useMemo(
    () =>
      new Set(
        (cues?.lines ?? [])
          .map((l, i) => {
            const scores = l.words.map((w) => w.score).filter((s): s is number => s != null)
            const mean = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)
            return scores.length && mean < LOW_CONFIDENCE ? i : -1
          })
          .filter((i) => i >= 0),
      ),
    [cues],
  )

  if (!song) return <div className="page center muted">Loading…</div>
  if (!cues) return <div className="page center muted">This song has no cues yet ({song.status}).</div>

  return (
    <div className="page editor">
      <header className="topbar">
        <div className="crumbs">
          <Link to="/" className="brand">
            Syncopate
          </Link>
          <span className="muted">/</span>
          <span>{song.title}</span>
          <EnvBadge />
          {song.artist && <span className="muted">{song.artist}</span>}
        </div>
        <nav className="topbar-actions">
          <span
            className={`live-dot ${connected ? 'on' : ''}`}
            title={
              STATIC
                ? 'Prompter and LED windows in this browser follow along'
                : connected
                  ? 'Screens connected'
                  : 'API offline'
            }
          >
            {connected ? 'Live' : 'Offline'}
          </span>
          <a className="btn ghost" href="/prompter" target="_blank">
            Prompter
          </a>
          <a className="btn ghost" href="/led" target="_blank">
            LED
          </a>
          <div className="export">
            {(['lrc', 'srt', 'csv'] as const).map((f) => (
              <button
                key={f}
                className="btn ghost small"
                title={`Download a .${f} file (includes unsaved edits)`}
                onClick={() => {
                  const text = f === 'lrc' ? toLrc(cues, song.title, song.artist) : f === 'srt' ? toSrt(cues) : toCsv(cues)
                  download(`${song.title.replace(/[^A-Za-z0-9_\- ]/g, '').trim() || 'song'}.${f}`, text)
                }}
              >
                .{f}
              </button>
            ))}
          </div>
          <button
            className="btn primary"
            disabled={!dirty || saving}
            onClick={save}
            title={STATIC ? 'Saved in this browser only' : undefined}
          >
            {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </nav>
      </header>

      <section className="transport">
        <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="clock">
          {formatTime(t)} <span className="muted">/ {formatTime(duration)}</span>
        </div>
        <Timeline cues={cues} t={t} duration={duration} current={current} selected={selected} onSeek={seek} onSelect={setSelected} />
        <audio
          ref={audio}
          src={song.audioUrl}
          preload="auto"
          onPlay={() => (setPlaying(true), broadcast())}
          onPause={() => (setPlaying(false), broadcast())}
          onSeeked={broadcast}
        />
      </section>

      <div className="editor-body">
        <ol className="lines" ref={listRef}>
          {cues.lines.map((line, i) => {
            const showSection = line.section && line.section !== cues.lines[i - 1]?.section
            const sung = i === current ? wordsSung(line, t) : i < current ? line.words.length : 0
            return (
              <li key={i} data-index={i}>
                {showSection && <div className="section-label">{line.section}</div>}
                <div
                  className={`line ${i === current ? 'current' : ''} ${i === selected ? 'selected' : ''}`}
                  onClick={() => (setSelected(i), setFollow(false))}
                  onDoubleClick={() => seek(line.start - 1)}
                >
                  <span className="stamp">{formatTime(line.start)}</span>
                  <span className="text">
                    {line.words.map((w, k) => (
                      <span key={k} className={k < sung ? 'sung' : ''}>
                        {w.text}{' '}
                      </span>
                    ))}
                  </span>
                  {lowConfidence.has(i) && (
                    <span className="flag" title="Low alignment confidence: give this line a listen">
                      check
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        <aside className="help card">
          <h3>Fix a line</h3>
          <p className="muted small">Select a line, then:</p>
          <dl className="keys">
            <dt>Space</dt>
            <dd>Play / pause</dd>
            <dt>↑ ↓</dt>
            <dd>Select line</dd>
            <dt>Enter</dt>
            <dd>Play from 1 s before the line</dd>
            <dt>[ ]</dt>
            <dd>Nudge line ∓50 ms</dd>
            <dt>T</dt>
            <dd>Tap: line starts now</dd>
            <dt>F</dt>
            <dd>Follow playback {follow ? '(on)' : '(off)'}</dd>
            <dt>⌘S</dt>
            <dd>Save</dd>
          </dl>
          <div className="selected-info">
            <div className="muted small">Line {selected + 1} of {cues.lines.length}</div>
            <div className="mono">
              {formatTime(cues.lines[selected].start)} → {formatTime(cues.lines[selected].end)}
            </div>
            <div className="nudge-row">
              <button className="btn ghost small" onClick={() => nudge(-NUDGE)}>
                −50 ms
              </button>
              <button className="btn ghost small" onClick={tapToNow}>
                Starts now
              </button>
              <button className="btn ghost small" onClick={() => nudge(NUDGE)}>
                +50 ms
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Timeline(props: {
  cues: Cues
  t: number
  duration: number
  current: number
  selected: number
  onSeek: (t: number) => void
  onSelect: (i: number) => void
}) {
  const { cues, t, duration, current, selected, onSeek, onSelect } = props
  const pct = (x: number) => `${(100 * x) / Math.max(duration, 1)}%`
  return (
    <div
      className="timeline"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onSeek(((e.clientX - r.left) / r.width) * duration)
      }}
    >
      {cues.lines.map((l, i) => (
        <div
          key={i}
          className={`block ${i === current ? 'current' : ''} ${i === selected ? 'selected' : ''}`}
          style={{ left: pct(l.start), width: pct(Math.max(l.end - l.start, 0.2)) }}
          title={l.text}
          onClick={(e) => (e.stopPropagation(), onSelect(i), onSeek(l.start))}
        />
      ))}
      <div className="playhead" style={{ left: pct(t) }} />
    </div>
  )
}
