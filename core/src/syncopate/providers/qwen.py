"""Qwen3-ForcedAligner-0.6B (Apache-2.0), the commercial-path candidate. Dependency group "qwen".

The model is documented for speech, not singing, so it is qualified on our own singing benchmark
before any paid use (see compliance/model-manifest.json and results/). It returns word units with
start/end seconds and no confidence score, so the editor's MMS-calibrated "check" flags do not apply.
"""

from __future__ import annotations

import difflib
import time
from functools import lru_cache

import numpy as np
import torch

from ..lyrics import Line, normalize_word
from .base import Capabilities, ProviderResult, UnsupportedInput

MODEL_ID = "Qwen/Qwen3-ForcedAligner-0.6B"
MODEL_REVISION = "c7cbfc2048c462b0d63a45797104fc9db3ad62b7"  # pinned; changing it reopens review
MAX_AUDIO_MS = 300_000  # model card: up to about 5 minutes per input
LANGUAGES = (
    "Chinese", "English", "Cantonese", "French", "German", "Italian",
    "Japanese", "Korean", "Portuguese", "Russian", "Spanish",
)  # fmt: skip


def _device() -> tuple[str, torch.dtype]:
    if torch.cuda.is_available():
        return "cuda:0", torch.bfloat16
    if torch.backends.mps.is_available():
        return "mps", torch.float32
    return "cpu", torch.float32


@lru_cache(maxsize=1)
def _model():
    from qwen_asr import Qwen3ForcedAligner

    device, dtype = _device()
    return Qwen3ForcedAligner.from_pretrained(MODEL_ID, revision=MODEL_REVISION, dtype=dtype, device_map=device)


def map_units_to_words(unit_texts: list[str], lines: list[Line]) -> list[tuple[int, int]]:
    """Match the model's word units back to our words by normalized text, in order.

    Returns (unit_index, word_index) pairs. Words the model skipped or split differently stay
    unmatched and are filled from their neighbours later, never guessed.
    """
    words = [w for line in lines for w in line.words]
    ours = [w.norm for w in words]
    theirs = [normalize_word(t) for t in unit_texts]
    pairs: list[tuple[int, int]] = []
    matcher = difflib.SequenceMatcher(a=theirs, b=ours, autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            pairs.append((block.a + k, block.b + k))
    return pairs


class QwenProvider:
    def capabilities(self) -> Capabilities:
        return Capabilities(
            provider_id="qwen3_fa",
            model_id=MODEL_ID,
            model_revision=MODEL_REVISION,
            weights_license="Apache-2.0",
            commercial_use=True,  # license permits it; singing qualification is tracked separately
            languages=LANGUAGES,
            max_audio_ms=MAX_AUDIO_MS,
            score_kind="none",
            devices=("cpu", "mps", "cuda"),
        )

    def align(self, audio: np.ndarray, sample_rate: int, lines: list[Line], language: str) -> ProviderResult:
        if language not in LANGUAGES:
            raise UnsupportedInput(f"Qwen3-ForcedAligner does not support {language!r}")
        duration_ms = int(len(audio) / sample_rate * 1000)
        if duration_ms > MAX_AUDIO_MS:
            raise UnsupportedInput(
                f"Recording is {duration_ms / 1000:.0f} s; this provider handles up to {MAX_AUDIO_MS // 1000} s per job"
            )
        words = [w for line in lines for w in line.words]
        t0 = time.perf_counter()
        model = _model()
        t1 = time.perf_counter()
        text = " ".join(w.text for w in words)
        units = list(model.align(audio=(audio, sample_rate), text=text, language=language)[0])
        t2 = time.perf_counter()

        pairs = map_units_to_words([u.text for u in units], lines)
        for ui, wi in pairs:
            words[wi].start = float(units[ui].start_time)
            words[wi].end = float(units[ui].end_time)
            words[wi].score = None
        warnings = []
        unmatched = len(words) - len(pairs)
        if unmatched:
            warnings.append(f"{unmatched} of {len(words)} words had no matching model unit; filled from neighbours")
        return ProviderResult(warnings=warnings, timings_s={"load": t1 - t0, "align": t2 - t1})
