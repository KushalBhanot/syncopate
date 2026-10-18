"""JamendoLyrics MultiLang (79 songs, word-level timings) from Hugging Face.

Files are fetched one song at a time into data/jamendolyrics/ so a quick test does not
download the whole dataset.
"""

from __future__ import annotations

import csv
import io
import math
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BASE = "https://huggingface.co/datasets/jamendolyrics/jamendolyrics/resolve/main"
DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "jamendolyrics"
LANG_CODES = {"English": "en", "French": "fr", "German": "de", "Spanish": "es"}


@dataclass
class Song:
    name: str  # file stem, e.g. "HILA_-_Give_Me_the_Same"
    artist: str
    title: str
    language: str
    audio: Path
    lyrics: Path
    lines_csv: Path
    words_csv: Path

    def gt_lines(self) -> list[tuple[float, float, str]]:
        with self.lines_csv.open() as f:
            return [(float(r["start_time"]), float(r["end_time"]), r["lyrics_line"]) for r in csv.DictReader(f)]

    def gt_word_starts(self) -> list[float]:
        with self.words_csv.open() as f:
            return [float(r["word_start"]) for r in csv.DictReader(f)]


def _fetch(rel: str, dest: Path) -> Path:
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        url = f"{BASE}/{urllib.request.quote(rel)}"
        tmp = dest.with_suffix(dest.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(dest)
    return dest


def catalog() -> list[dict[str, str]]:
    path = _fetch("JamendoLyrics.csv", DATA_DIR / "JamendoLyrics.csv")
    with path.open() as f:
        return list(csv.DictReader(f))


def songs(language: str | None = "English", limit: int | None = None) -> list[Song]:
    out: list[Song] = []
    for row in catalog():
        if language and row["Language"] != language:
            continue
        stem = row["Filepath"].removesuffix(".mp3")
        out.append(
            Song(
                name=stem,
                artist=row["Artist"],
                title=row["Title"],
                language=row["Language"],
                audio=_fetch(
                    f"subsets/{LANG_CODES[row['Language']]}/mp3/{stem}.mp3", DATA_DIR / "mp3" / f"{stem}.mp3"
                ),
                lyrics=_fetch(f"lyrics/{stem}.txt", DATA_DIR / "lyrics" / f"{stem}.txt"),
                lines_csv=_fetch(f"annotations/lines/{stem}.csv", DATA_DIR / "lines" / f"{stem}.csv"),
                words_csv=_fetch(f"annotations/words/{stem}.csv", DATA_DIR / "words" / f"{stem}.csv"),
            )
        )
        if limit and len(out) >= limit:
            break
    return out


def is_number(x: float) -> bool:
    return not math.isnan(x)
