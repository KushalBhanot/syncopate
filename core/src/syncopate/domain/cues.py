"""Cue document schema v2: stable IDs, integer milliseconds, original text, review state, revisions.

v1 (the original cues.json) stored float seconds with no IDs, so a correction could not say which
cue it touched and two saves could silently overwrite each other. v2 fixes that. v1 files are read
through migrate_v1() and kept as a backup; to_v1() is an explicit, lossy export for older clients.
"""

from __future__ import annotations

import copy
import hashlib
import json
import time
import uuid

SCHEMA = 2
REVIEW_STATES = ("unchecked", "approved")


class InvalidCues(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems[:5]) + (f" (+{len(problems) - 5} more)" if len(problems) > 5 else ""))
        self.problems = problems


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _ms(seconds: float | None) -> int:
    return max(0, int(round((seconds or 0.0) * 1000)))


def cue_hash(doc: dict) -> str:
    """Hash of the timing content only, so identical cues hash the same across revisions."""
    content = {"duration_ms": doc["duration_ms"], "lines": doc["lines"]}
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def migrate_v1(v1: dict, author: str = "migration") -> dict:
    """Convert a v1 cues dict (float seconds, no IDs) to a v2 document. Provenance becomes legacy if unknown."""
    if v1.get("schema") == SCHEMA:
        return copy.deepcopy(v1)
    provenance = v1.get("provenance") or {"provider": "legacy-unknown"}
    score_kind = provenance.get("score_kind", "legacy-unknown")
    lines = []
    for line in v1.get("lines", []):
        words = [
            {
                "id": new_id("w"),
                "text": w["text"],
                "start_ms": _ms(w.get("start")),
                "end_ms": _ms(w.get("end")),
                "score": w.get("score"),
                "score_kind": score_kind,
                "inferred": bool(w.get("inferred", False)),
            }
            for w in line.get("words", [])
        ]
        lines.append(
            {
                "id": new_id("l"),
                "text": line["text"],
                "section": line.get("section"),
                "start_ms": _ms(line.get("start")),
                "end_ms": _ms(line.get("end")),
                "review": "unchecked",
                "words": words,
            }
        )
    doc = {
        "schema": SCHEMA,
        "duration_ms": _ms(v1.get("duration")),
        "provenance": provenance,
        "lines": lines,
    }
    doc["revision"] = new_revision(doc, parent=None, author=author)
    return doc


def new_revision(doc: dict, parent: str | None, author: str) -> dict:
    return {
        "id": new_id("rev"),
        "parent": parent,
        "author": author,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cue_hash": cue_hash(doc),
    }


def to_v1(doc: dict) -> dict:
    """Lossy export for v1 readers: drops IDs, review state and revision history."""
    return {
        "duration": doc["duration_ms"] / 1000,
        "provenance": doc.get("provenance", {}),
        "lines": [
            {
                "text": line["text"],
                "section": line.get("section"),
                "start": line["start_ms"] / 1000,
                "end": line["end_ms"] / 1000,
                "words": [
                    {"text": w["text"], "start": w["start_ms"] / 1000, "end": w["end_ms"] / 1000, "score": w.get("score")}
                    for w in line["words"]
                ],
            }
            for line in doc["lines"]
        ],
    }


def validate(doc: dict) -> list[str]:
    """Timing and identity invariants. Returns a list of problems (empty = valid)."""
    problems: list[str] = []
    if doc.get("schema") != SCHEMA:
        problems.append(f"schema must be {SCHEMA}")
    duration = doc.get("duration_ms")
    if not isinstance(duration, int) or duration < 0:
        problems.append("duration_ms must be a non-negative integer")
    seen: set[str] = set()
    prev_start = -1
    for i, line in enumerate(doc.get("lines", [])):
        where = f"line {i + 1}"
        for key in ("id", "text", "start_ms", "end_ms", "words"):
            if key not in line:
                problems.append(f"{where}: missing {key}")
        if line.get("id") in seen:
            problems.append(f"{where}: duplicate id {line.get('id')}")
        seen.add(line.get("id"))
        s, e = line.get("start_ms"), line.get("end_ms")
        if not (isinstance(s, int) and isinstance(e, int)) or s < 0 or e < 0:
            problems.append(f"{where}: times must be non-negative integer ms")
            continue
        if s > e:
            problems.append(f"{where}: starts after it ends ({s} > {e} ms)")
        if s < prev_start:
            problems.append(f"{where}: starts before the previous line")
        prev_start = s
        if line.get("review", "unchecked") not in REVIEW_STATES:
            problems.append(f"{where}: unknown review state {line.get('review')!r}")
        prev_word = -1
        for k, w in enumerate(line.get("words", [])):
            if w.get("id") in seen:
                problems.append(f"{where} word {k + 1}: duplicate id")
            seen.add(w.get("id"))
            ws, we = w.get("start_ms"), w.get("end_ms")
            if not (isinstance(ws, int) and isinstance(we, int)) or ws < 0 or ws > we:
                problems.append(f"{where} word {k + 1}: invalid times")
            elif ws < prev_word:
                problems.append(f"{where} word {k + 1}: out of order")
            else:
                prev_word = ws
    return problems


def check(doc: dict) -> dict:
    problems = validate(doc)
    if problems:
        raise InvalidCues(problems)
    return doc
