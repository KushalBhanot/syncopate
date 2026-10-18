"""Cue exports: JSON (our format), LRC (karaoke/lyric apps), SRT (video, captions), CSV (cue lists)."""

from __future__ import annotations

import csv
import io

from .lyrics import Line


def to_json(lines: list[Line], duration: float) -> dict:
    return {
        "duration": duration,
        "lines": [
            {
                "text": line.text,
                "section": line.section,
                "start": line.start,
                "end": line.end,
                "words": [
                    {"text": w.text, "start": w.start, "end": w.end, "score": w.score} for w in line.words
                ],
            }
            for line in lines
        ],
    }


def _lrc_time(t: float) -> str:
    m, s = divmod(max(t, 0.0), 60)
    return f"{int(m):02d}:{s:05.2f}"


def to_lrc(lines: list[Line], title: str | None = None, artist: str | None = None) -> str:
    out = []
    if title:
        out.append(f"[ti:{title}]")
    if artist:
        out.append(f"[ar:{artist}]")
    out += [f"[{_lrc_time(line.start or 0)}]{line.text}" for line in lines]
    return "\n".join(out) + "\n"


def _srt_time(t: float) -> str:
    ms = int(round(max(t, 0.0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(lines: list[Line]) -> str:
    blocks = []
    for i, line in enumerate(lines, 1):
        blocks.append(f"{i}\n{_srt_time(line.start or 0)} --> {_srt_time(line.end or 0)}\n{line.text}\n")
    return "\n".join(blocks)


def to_csv(lines: list[Line]) -> str:
    """One row per line: a cue list a playback tech can paste into a show-control sheet."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["cue", "start_seconds", "end_seconds", "section", "text"])
    for i, line in enumerate(lines, 1):
        w.writerow([i, f"{line.start:.3f}", f"{line.end:.3f}", line.section or "", line.text])
    return buf.getvalue()
