"""Lyrics parsing: raw text -> lines and words, plus the normalised tokens the aligner needs."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Characters the MMS_FA model knows (lowercase latin + apostrophe).
_ALLOWED = set("abcdefghijklmnopqrstuvwxyz'")

# Section markers such as [Chorus], (x2), {Verse 1} carry no sung words.
_SECTION_RE = re.compile(r"^\s*[\[\({].*[\]\)}]\s*$")


def normalize_word(word: str) -> str:
    """Lowercase, strip accents and drop anything outside the model's alphabet."""
    decomposed = unicodedata.normalize("NFKD", word.lower())
    return "".join(c for c in decomposed if c in _ALLOWED)


@dataclass
class Word:
    text: str
    norm: str
    start: float | None = None
    end: float | None = None
    score: float | None = None


@dataclass
class Line:
    text: str
    words: list[Word] = field(default_factory=list)
    section: str | None = None

    @property
    def start(self) -> float | None:
        return next((w.start for w in self.words if w.start is not None), None)

    @property
    def end(self) -> float | None:
        return next((w.end for w in reversed(self.words) if w.end is not None), None)


def parse_lyrics(text: str) -> list[Line]:
    """Split lyrics into sung lines. Blank lines and section markers are not sung."""
    lines: list[Line] = []
    section: str | None = None
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw:
            continue
        if _SECTION_RE.match(raw):
            section = raw.strip("[](){} ")
            continue
        words = [Word(text=w, norm=normalize_word(w)) for w in raw.split()]
        lines.append(Line(text=raw, words=words, section=section))
    return lines
