"""Benchmark CueBuilder against JamendoLyrics ground truth.

Line metrics are what a prompter cares about: did each line show up on time?
Word metrics match the published ALA benchmark (AAE = average absolute error of word
onsets, PCO = share of word onsets within 0.3 s), so results compare to the literature.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from .align import align
from .datasets import jamendo

TOLERANCES = (0.3, 0.5, 1.0)


@dataclass
class SongScore:
    song: str
    lines: int
    line_mean: float
    line_median: float
    line_within: dict[str, float]
    word_aae: float | None
    word_pco: float | None
    audio_seconds: float
    seconds_taken: float
    line_errors: list[float]
    line_confidence: list[float]


def score_song(song: jamendo.Song, separate: bool = True) -> SongScore:
    result = align(song.audio, song.lyrics.read_text(), separate=separate)
    gt = song.gt_lines()
    if len(gt) != len(result.lines):
        raise ValueError(f"{song.name}: {len(result.lines)} lines vs {len(gt)} in ground truth")
    line_err = np.array([abs(line.start - g[0]) for line, g in zip(result.lines, gt)])

    pred_words = [w.start for line in result.lines for w in line.words]
    gt_words = song.gt_word_starts()
    aae = pco = None
    if len(pred_words) == len(gt_words):
        word_err = np.abs(np.array(pred_words) - np.array(gt_words))
        aae, pco = float(word_err.mean()), float((word_err < 0.3).mean())

    return SongScore(
        song=song.name,
        lines=len(gt),
        line_mean=float(line_err.mean()),
        line_median=float(np.median(line_err)),
        line_within={f"{t:.1f}s": float((line_err < t).mean()) for t in TOLERANCES},
        word_aae=aae,
        word_pco=pco,
        audio_seconds=result.duration,
        seconds_taken=result.seconds_taken,
        line_errors=[float(e) for e in line_err],
        line_confidence=[
            float(np.mean([w.score for w in line.words if w.score is not None] or [0.0])) for line in result.lines
        ],
    )


def run(
    language: str = "English", limit: int | None = None, out: Path | None = None, separate: bool = True
) -> dict:
    scores: list[SongScore] = []
    for song in jamendo.songs(language, limit):
        s = score_song(song, separate)
        scores.append(s)
        print(
            f"{s.song[:40]:40s} lines {s.lines:3d}  median {s.line_median * 1000:5.0f} ms  "
            f"<300ms {s.line_within['0.3s']:6.1%}  AAE {s.word_aae if s.word_aae is None else round(s.word_aae, 3)}  "
            f"({s.seconds_taken:.0f}s for {s.audio_seconds:.0f}s audio)",
            flush=True,
        )

    total_lines = sum(s.lines for s in scores)
    weighted = lambda key: sum(s.line_within[key] * s.lines for s in scores) / total_lines  # noqa: E731
    word_scores = [s for s in scores if s.word_aae is not None]
    summary = {
        "dataset": f"JamendoLyrics MultiLang ({language})",
        "vocal_separation": separate,
        "songs": len(scores),
        "lines": total_lines,
        "line_within": {k: weighted(k) for k in scores[0].line_within} if scores else {},
        "line_median_of_medians": float(np.median([s.line_median for s in scores])) if scores else None,
        "word_aae_mean": float(np.mean([s.word_aae for s in word_scores])) if word_scores else None,
        "word_pco_mean": float(np.mean([s.word_pco for s in word_scores])) if word_scores else None,
        "realtime_factor": sum(s.seconds_taken for s in scores) / sum(s.audio_seconds for s in scores),
        "date": time.strftime("%Y-%m-%d"),
        "per_song": [asdict(s) for s in scores],
    }
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(summary, indent=2))
    print(
        f"\n{summary['songs']} songs, {total_lines} lines: "
        + ", ".join(f"{v:.1%} of lines within {k}" for k, v in summary["line_within"].items())
        + f"; word AAE {summary['word_aae_mean']:.3f}s, PCO {summary['word_pco_mean']:.1%}"
        + f"; {summary['realtime_factor']:.2f}x realtime"
    )
    return summary
