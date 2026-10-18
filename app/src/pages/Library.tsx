import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Song } from '../api'
import { formatTime } from '../cues'
import EnvBadge, { useConfig } from '../EnvBadge'

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
            {showForm ? 'Cancel' : 'New song'}
          </button>
        </nav>
      </header>

      <main className="library">
        {showForm && <NewSongForm onCreated={() => (setShowForm(false), refresh())} />}

        {songs.length === 0 && !showForm ? (
          <div className="empty">
            <h2>No songs yet</h2>
            <p>Upload a rehearsal recording and paste the lyrics. Syncopate times every line and word for you.</p>
            <button className="btn primary" onClick={() => setShowForm(true)}>
              Add your first song
            </button>
          </div>
        ) : (
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
                  {s.status === 'error' && <div className="error-text">{s.error}</div>}
                </div>
                <div className="row-right">
                  <span className={`chip ${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  {s.status === 'ready' && s.seconds_taken && (
                    <span className="muted small">aligned in {Math.round(s.seconds_taken)}s</span>
                  )}
                  <button
                    className="btn ghost small"
                    onClick={() => confirm(`Delete "${s.title}"?`) && api.remove(s.id).then(refresh)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

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
      <label
        className={`dropzone ${file ? 'has-file' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) {
            setFile(f)
            if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }
        }}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''))
          }}
        />
        {file ? file.name : 'Drop a rehearsal recording here, or click to choose (MP3, WAV, M4A)'}
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
