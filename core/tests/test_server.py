import importlib
import io
import wave

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SYNCOPATE_ENV", "staging")
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    monkeypatch.setenv("MAX_AUDIO_MINUTES", "0.05")  # 3 seconds
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "no-static"))
    from syncopate import server

    importlib.reload(server)
    monkeypatch.setattr(server, "_run_alignment", lambda song_id: None)  # no model in unit tests
    return TestClient(server.app)


def _wav(seconds: float) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\0\0" * int(8000 * seconds))
    return buf.getvalue()


def test_config_reports_environment(client):
    assert client.get("/api/config").json()["env"] == "staging"
    assert client.get("/api/health").json()["ok"] is True


@pytest.mark.parametrize("bad_id", ["..", "...", "abc", "ABCDEF1234", "0123456789a"])
def test_song_ids_cannot_escape_data_dir(client, bad_id):
    assert client.delete(f"/api/songs/{bad_id}").status_code == 404
    assert client.get(f"/api/songs/{bad_id}").status_code == 404


def test_upload_accepts_short_audio(client):
    r = client.post("/api/songs", files={"audio": ("a.wav", _wav(1), "audio/wav")}, data={"lyrics": "hello"})
    assert r.status_code == 200, r.text
    assert client.get(f"/api/songs/{r.json()['id']}").status_code == 200


def test_upload_rejects_long_audio(client):
    r = client.post("/api/songs", files={"audio": ("a.wav", _wav(5), "audio/wav")}, data={"lyrics": "hello"})
    assert r.status_code == 400
    assert client.get("/api/songs").json() == []  # nothing left behind


def test_upload_rejects_big_files_and_odd_types(client):
    big = client.post("/api/songs", files={"audio": ("a.wav", b"\0" * (2 * 1024 * 1024), "audio/wav")}, data={"lyrics": "x"})
    assert big.status_code == 413
    odd = client.post("/api/songs", files={"audio": ("a.exe", b"MZ", "application/octet-stream")}, data={"lyrics": "x"})
    assert odd.status_code == 400


def _seed_v1_song(server, song_id="abcdef0123"):
    import json as _json

    d = server.DATA / song_id
    d.mkdir(parents=True)
    (d / "meta.json").write_text(_json.dumps({"id": song_id, "title": "T", "artist": "", "audio_file": "audio.wav", "status": "ready", "created": 1}))
    (d / "cues.json").write_text(_json.dumps({"duration": 4.0, "lines": [{"text": "la la", "section": None, "start": 1.0, "end": 2.0,
        "words": [{"text": "la", "start": 1.0, "end": 1.5, "score": 0.5}, {"text": "la", "start": 1.5, "end": 2.0, "score": 0.5}]}]}))
    return song_id, d


def test_legacy_song_migrates_with_backup_and_saves_create_revisions(client):
    from syncopate import server

    song_id, d = _seed_v1_song(server)
    doc = client.get(f"/api/songs/{song_id}").json()["cues"]
    assert doc["schema"] == 2 and (d / "cues.v1.backup.json").exists()
    base = doc["revision"]["id"]

    doc["lines"][0]["start_ms"] += 50
    doc["lines"][0]["words"][0]["start_ms"] += 50
    r = client.put(f"/api/songs/{song_id}/cues", json=doc, headers={"If-Match": base})
    assert r.status_code == 200 and r.json()["revision"]["parent"] == base

    # Saving again from the old base is a conflict, not a silent overwrite.
    stale = client.put(f"/api/songs/{song_id}/cues", json=doc, headers={"If-Match": base})
    assert stale.status_code == 409
    assert len(client.get(f"/api/songs/{song_id}/revisions").json()) == 2


def test_invalid_cues_are_rejected_with_reasons(client):
    from syncopate import server

    song_id, _ = _seed_v1_song(server, "0123456789")
    doc = client.get(f"/api/songs/{song_id}").json()["cues"]
    doc["lines"][0]["start_ms"], doc["lines"][0]["end_ms"] = 3000, 1000
    r = client.put(f"/api/songs/{song_id}/cues", json=doc, headers={"If-Match": doc["revision"]["id"]})
    assert r.status_code == 422 and "starts after it ends" in str(r.json())
