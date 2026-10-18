"""API server for the web app, and in deployments the web app itself.

- /api/songs: upload a recording + lyrics, align them in the background, edit and export cues.
- /ws/show: the position hub. Whatever drives the show (the editor's audio player today,
  LiveFollow later) sends positions; every prompter and LED screen receives them.
- Everything else: the built React app from STATIC_DIR, when it exists (Docker image).

Configuration (environment variables):
  SYNCOPATE_ENV      local | staging | production   (shown as a badge in the UI)
  SYNCOPATE_VERSION  build identifier, e.g. the git commit
  DATA_DIR           where uploaded songs are stored
  STATIC_DIR         built web app to serve
  MAX_UPLOAD_MB      largest accepted audio file (default 40)
  MAX_AUDIO_MINUTES  longest accepted recording (default 10)
"""

from __future__ import annotations

import json
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

from . import export
from .lyrics import Line, Word

_REPO = Path(__file__).resolve().parents[3]
ENV = os.environ.get("SYNCOPATE_ENV", "local")
VERSION = os.environ.get("SYNCOPATE_VERSION", "dev")
DATA = Path(os.environ.get("DATA_DIR", _REPO / "data")) / "songs"
DATA.mkdir(parents=True, exist_ok=True)
STATIC = Path(os.environ.get("STATIC_DIR", _REPO / "app" / "dist"))
MAX_UPLOAD_BYTES = int(float(os.environ.get("MAX_UPLOAD_MB", 40)) * 1024 * 1024)
MAX_AUDIO_SECONDS = float(os.environ.get("MAX_AUDIO_MINUTES", 10)) * 60
MAX_LYRICS_CHARS = 20_000
AUDIO_SUFFIXES = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif"}
_SONG_ID = re.compile(r"^[0-9a-f]{10}$")

app = FastAPI(title="Syncopate")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_align_lock = threading.Lock()  # one alignment at a time; the model is large


def _dir(song_id: str) -> Path:
    # IDs come from the URL: only accept the exact shape we generate, so ".." can't escape DATA.
    if not _SONG_ID.match(song_id):
        raise HTTPException(404, "No such song")
    d = DATA / song_id
    if not d.is_dir():
        raise HTTPException(404, "No such song")
    return d


def _meta(song_id: str) -> dict:
    return json.loads((_dir(song_id) / "meta.json").read_text())


def _save_meta(song_id: str, meta: dict) -> None:
    (_dir(song_id) / "meta.json").write_text(json.dumps(meta, indent=2))


def _run_alignment(song_id: str) -> None:
    import soundfile as sf

    from .align import SAMPLE_RATE, align

    d = DATA / song_id
    meta = _meta(song_id)
    try:
        with _align_lock:
            meta["status"] = "aligning"
            _save_meta(song_id, meta)
            result = align(d / meta["audio_file"], (d / "lyrics.txt").read_text())
        cues = export.to_json(result.lines, result.duration)
        (d / "cues.json").write_text(json.dumps(cues, indent=2))
        # The isolated vocal is the reference LiveFollow will track the live singer against.
        sf.write(d / "vocals.wav", result.audio, SAMPLE_RATE)
        meta.update(status="ready", seconds_taken=result.seconds_taken, duration=result.duration)
    except Exception as exc:  # surface the failure in the UI instead of a silent hang
        meta.update(status="error", error=str(exc))
    _save_meta(song_id, meta)


@app.get("/api/config")
def config() -> dict:
    return {
        "env": ENV,
        "version": VERSION,
        "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
        "max_audio_minutes": MAX_AUDIO_SECONDS / 60,
    }


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "env": ENV, "version": VERSION}


@app.get("/api/songs")
def list_songs() -> list[dict]:
    songs = [json.loads(p.read_text()) for p in DATA.glob("*/meta.json")]
    return sorted(songs, key=lambda m: m["created"], reverse=True)


@app.post("/api/songs")
async def create_song(
    audio: UploadFile = File(...),
    lyrics: str = Form(...),
    title: str = Form(""),
    artist: str = Form(""),
) -> dict:
    if not lyrics.strip():
        raise HTTPException(400, "Lyrics are empty")
    if len(lyrics) > MAX_LYRICS_CHARS:
        raise HTTPException(400, "Lyrics are too long")
    suffix = Path(audio.filename or "audio.mp3").suffix.lower() or ".mp3"
    if suffix not in AUDIO_SUFFIXES:
        raise HTTPException(400, f"Unsupported audio type {suffix}")
    song_id = uuid.uuid4().hex[:10]
    d = DATA / song_id
    d.mkdir(parents=True)
    audio_path = d / f"audio{suffix}"
    try:
        _save_upload(audio, audio_path)
        _check_duration(audio_path)
    except HTTPException:
        shutil.rmtree(d)
        raise
    (d / "lyrics.txt").write_text(lyrics)
    meta = {
        "id": song_id,
        "title": title or Path(audio.filename or "Untitled").stem,
        "artist": artist,
        "audio_file": f"audio{suffix}",
        "status": "queued",
        "created": time.time(),
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=2))
    threading.Thread(target=_run_alignment, args=(song_id,), daemon=True).start()
    return meta


def _save_upload(upload: UploadFile, dest: Path) -> None:
    size = 0
    with dest.open("wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(413, f"Audio file is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
            f.write(chunk)


def _check_duration(path: Path) -> None:
    import librosa

    try:
        seconds = librosa.get_duration(path=str(path))
    except Exception:
        raise HTTPException(400, "Could not read that audio file")
    if seconds > MAX_AUDIO_SECONDS:
        raise HTTPException(400, f"Recording is longer than {MAX_AUDIO_SECONDS / 60:.0f} minutes")


@app.get("/api/songs/{song_id}")
def get_song(song_id: str) -> dict:
    meta = _meta(song_id)
    cues_path = _dir(song_id) / "cues.json"
    meta["cues"] = json.loads(cues_path.read_text()) if cues_path.exists() else None
    return meta


@app.put("/api/songs/{song_id}/cues")
def save_cues(song_id: str, cues: dict) -> dict:
    (_dir(song_id) / "cues.json").write_text(json.dumps(cues, indent=2))
    return {"ok": True}


@app.delete("/api/songs/{song_id}")
def delete_song(song_id: str) -> dict:
    shutil.rmtree(_dir(song_id))
    return {"ok": True}


@app.get("/api/songs/{song_id}/audio")
def get_audio(song_id: str) -> FileResponse:
    return FileResponse(_dir(song_id) / _meta(song_id)["audio_file"])


def _lines(song_id: str) -> list[Line]:
    cues = json.loads((_dir(song_id) / "cues.json").read_text())
    return [
        Line(
            text=line["text"],
            section=line.get("section"),
            words=[Word(text=w["text"], norm="", start=w["start"], end=w["end"]) for w in line["words"]],
        )
        for line in cues["lines"]
    ]


@app.get("/api/songs/{song_id}/export.{fmt}")
def export_cues(song_id: str, fmt: str) -> PlainTextResponse:
    meta = _meta(song_id)
    lines = _lines(song_id)
    body = {
        "lrc": lambda: export.to_lrc(lines, meta["title"], meta["artist"]),
        "srt": lambda: export.to_srt(lines),
        "csv": lambda: export.to_csv(lines),
    }.get(fmt)
    if body is None:
        raise HTTPException(400, "Format must be lrc, srt or csv")
    safe_title = re.sub(r"[^A-Za-z0-9_\- ]", "", meta["title"]).strip() or song_id
    filename = f"{safe_title}.{fmt}"
    return PlainTextResponse(body(), headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# --- Position hub -----------------------------------------------------------------------

_clients: set[WebSocket] = set()
_last: dict | None = None


@app.websocket("/ws/show")
async def show_socket(ws: WebSocket) -> None:
    """Every message from any client is relayed to all other clients.

    Message shape: {"type": "position", "song": id, "t": seconds, "playing": bool, "sent": epoch_ms}
    """
    global _last
    await ws.accept()
    _clients.add(ws)
    if _last:
        await ws.send_text(json.dumps(_last))
    try:
        while True:
            msg = await ws.receive_text()
            _last = json.loads(msg)
            for client in list(_clients):
                if client is not ws:
                    try:
                        await client.send_text(msg)
                    except Exception:
                        _clients.discard(client)
    except WebSocketDisconnect:
        pass
    finally:
        _clients.discard(ws)


# --- Web app (deployments) ---------------------------------------------------------------
# Registered last so /api and /ws routes win. Unknown paths return index.html for client routing.
if (STATIC / "index.html").exists():

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str) -> FileResponse:
        file = (STATIC / path).resolve()
        if path and file.is_file() and STATIC.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(STATIC / "index.html")
