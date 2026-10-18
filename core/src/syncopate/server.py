"""Local API for the web app.

- /api/songs: upload a recording + lyrics, align them in the background, edit and export cues.
- /ws/show: the position hub. Whatever drives the show (the editor's audio player today,
  LiveFollow later) sends positions; every prompter and LED screen receives them.
"""

from __future__ import annotations

import json
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

DATA = Path(__file__).resolve().parents[3] / "data" / "songs"
DATA.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Syncopate")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_align_lock = threading.Lock()  # one alignment at a time; the model is large


def _dir(song_id: str) -> Path:
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
    song_id = uuid.uuid4().hex[:10]
    d = DATA / song_id
    d.mkdir(parents=True)
    suffix = Path(audio.filename or "audio.mp3").suffix or ".mp3"
    with (d / f"audio{suffix}").open("wb") as f:
        shutil.copyfileobj(audio.file, f)
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
    filename = f"{meta['title'] or song_id}.{fmt}"
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
