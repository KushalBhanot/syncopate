import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, localSongs, type Song } from '../api'
import { formatTime } from '../cues'
import EnvBadge, { useConfig } from '../EnvBadge'
import { parseCueFile } from '../exportCues'
import { STATIC } from '../mode'

const STATUS_LABEL: Record<Song['status'], string> = {
  queued: 'Queued',
  aligning: 'Aligning…',
  ready: 'Ready',
  error: 'Failed',
}

export default function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [showForm, setShowForm] = useState(false)

  const refresh = () => api.list().then(setSongs).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])
  // Poll while anything is still aligning.
  useEffect(() => {
    if (!songs.some((s) => s.status === 'queued' || s.status === 'aligning')) return
    const id = window.setInterval(refresh, 2000)
    return () => window.clearInterval(id)
  }, [songs])

  const mine = songs.filter((s) => s.source !== 'demo')
  const demos = songs.filter((s) => s.source === 'demo')

  return (
    <div className="page">
      <header className="topbar">
        <div className="crumbs">
          <div className="brand">Syncopate</div>
          <EnvBadge />
        </div>
        <nav className="topbar-actions">
          <a className="btn ghost" href="/prompter" target="_blank">
            Artist prompter
          </a>
          <a className="btn ghost" href="/led" target="_blank">
            LED view
          </a>
          <button className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : STATIC ? 'Open a song' : 'New song'}
          </button>
        </nav>
      </header>

      <main className="library">
        {STATIC && (
          <p className="notice">
            Try a demo song: open it, press play, then open the <b>Artist prompter</b> or <b>LED view</b> in another
            window. They follow along. This online version doesn't run the AI timing step; to use your own song, open
            the recording with a cue file Syncopate made for it. Everything stays in your browser.
          </p>
        )}

        {showForm &&
          (STATIC ? (
            <OpenSongForm onCreated={() => (setShowForm(false), refresh())} />
          ) : (
            <NewSongForm onCreated={() => (setShowForm(false), refresh())} />
          ))}

        {!STATIC && songs.length === 0 && !showForm && (
          <div className="empty">
            <h2>No songs yet</h2>
            <p>Upload a rehearsal recording and paste the lyrics. Syncopate times every line and word for you.</p>
            <button className="btn primary" onClick={() => setShowForm(true)}>
              Add your first song
            </button>
          </div>
        )}

        {mine.length > 0 && (
          <section>
            {STATIC && <h3 className="list-heading">Your songs (this browser)</h3>}
            <SongList songs={mine} onChange={refresh} />
          </section>
        )}

        {demos.length > 0 && (
          <section>
            <h3 className="list-heading">Demo songs</h3>
            <SongList songs={demos} onChange={refresh} />
          </section>
        )}
      </main>
    </div>
  )
}

function SongList({ songs, onChange }: { songs: Song[]; onChange: () => void }) {
  return (
    <ul className="song-list">
      {songs.map((s) => (
        <li key={s.id} className="song-row">
          <div>
            {s.status === 'ready' ? (
              <Link to={`/songs/${s.id}`} className="song-title">
                {s.title}
              </Link>
            ) : (
              <span className="song-title">{s.title}</span>
            )}
            <div className="muted">
              {[s.artist, s.duration ? formatTime(s.duration).split('.')[0] : null].filter(Boolean).join(' · ')}
            </div>
            {s.credit && (
              <div className="muted small credit">
                <a href={s.credit.source} target="_blank" rel="noreferrer">
                  Jamendo
                </a>{' '}
                ·{' '}
                <a href={s.credit.license_url} target="_blank" rel="noreferrer">
                  {s.credit.license}
                </a>{' '}
                · {s.credit.note}
              </div>
            )}
            {s.status === 'error' && <div className="error-text">{s.error}</div>}
          </div>
          <div className="row-right">
            {s.source === 'server' || !s.source ? (
              <>
                <span className={`chip ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                {s.status === 'ready' && s.seconds_taken && (
                  <span className="muted small">aligned in {Math.round(s.seconds_taken)}s</span>
                )}
              </>
            ) : null}
            {s.source === 'demo' ? (
              s.edited && (
                <button
                  className="btn ghost small"
                  onClick={() => confirm(`Undo your edits to "${s.title}"?`) && api.remove(s.id).then(onChange)}
                >
                  Reset edits
                </button>
              )
            ) : (
              <button
                className="btn ghost small"
                onClick={() => confirm(`Delete "${s.title}"?`) && api.remove(s.id).then(onChange)}
              >
                Delete
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function AudioDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label
      className={`dropzone ${file ? 'has-file' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onFile(e.dataTransfer.files[0] ?? null)
      }}
    >
      <input type="file" accept="audio/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? file.name : 'Drop a recording here, or click to choose (MP3, WAV, M4A)'}
    </label>
  )
}

const stem = (name: string) => name.replace(/\.[^.]+$/, '')

/** Static site: pair a recording with a cue file Syncopate made, kept in this browser. */
function OpenSongForm({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate()
  const [audio, setAudio] = useState<File | null>(null)
  const [cueFile, setCueFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!audio || !cueFile) return
    setBusy(true)
    setError(null)
    try {
      const duration = await audioDuration(audio)
      const cues = parseCueFile(cueFile.name, await cueFile.text(), duration)
      const song = await localSongs.addLocal(audio, { ...cues, duration }, title || stem(audio.name), artist)
      onCreated()
      navigate(`/songs/${song.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card new-song" onSubmit={submit}>
      <h2>Open a song</h2>
      <AudioDrop
        file={audio}
        onFile={(f) => {
          setAudio(f)
          if (f && !title) setTitle(stem(f.name))
        }}
      />
      <label>
        Cue file (.json from Syncopate, or .lrc)
        <input type="file" accept=".json,.lrc,application/json,text/plain" onChange={(e) => setCueFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="two-col">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Artist
          <input value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !audio || !cueFile}>
          {busy ? 'Opening…' : 'Open song'}
        </button>
        <span className="muted small">Nothing is uploaded. The song is saved in this browser only.</span>
      </div>
    </form>
  )
}

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = new Audio()
    el.preload = 'metadata'
    el.onloadedmetadata = () => (resolve(el.duration), URL.revokeObjectURL(url))
    el.onerror = () => (reject(new Error('This browser cannot play that audio file')), URL.revokeObjectURL(url))
    el.src = url
  })
}

/** Server mode: upload a recording and lyrics for AI alignment. */
function NewSongForm({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const config = useConfig()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return setError('Choose an audio file')
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('audio', file)
    form.append('lyrics', lyrics)
    form.append('title', title)
    form.append('artist', artist)
    try {
      await api.create(form)
      onCreated()
      navigate('/')
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card new-song" onSubmit={submit}>
      <h2>New song</h2>
      <AudioDrop
        file={file}
        onFile={(f) => {
          setFile(f)
          if (f && !title) setTitle(stem(f.name))
        }}
      />
      <div className="two-col">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Artist
          <input value={artist} onChange={(e) => setArtist(e.target.value)} />
        </label>
      </div>
      <label>
        Lyrics
        <textarea
          rows={12}
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={'One sung line per line.\n[Chorus] style markers become section labels.'}
        />
      </label>
      {error && <div className="error-text">{error}</div>}
      <div className="form-actions">
        <button className="btn primary" disabled={busy || !file || !lyrics.trim()}>
          {busy ? 'Uploading…' : 'Align lyrics'}
        </button>
        <span className="muted small">
          {config && config.env !== 'local'
            ? `Up to ${config.max_upload_mb} MB and ${config.max_audio_minutes} minutes. Takes a few minutes on the shared server.`
            : 'Takes about 20–30 seconds per song on an M1 laptop.'}
        </span>
      </div>
    </form>
  )
}
