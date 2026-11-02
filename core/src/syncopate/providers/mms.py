"""Meta MMS_FA (torchaudio) CTC forced alignment. Weights are CC-BY-NC 4.0: research and demos only.

The model runs over the song in overlapping chunks; CTC forced alignment then places every word.
A "star" token between lines lets the aligner skip ad-libs, backing vocals and instrumental gaps.
"""

from __future__ import annotations

import time
from functools import lru_cache

import numpy as np
import torch
import torchaudio.functional as F
from torchaudio.pipelines import MMS_FA

from ..lyrics import Line, Word
from .base import Capabilities, ProviderResult

SAMPLE_RATE = MMS_FA.sample_rate  # 16 kHz
CHUNK_SECONDS = 30.0
CONTEXT_SECONDS = 1.0
STAR = "*"


def pick_device() -> torch.device:
    return torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")


@lru_cache(maxsize=1)
def _model(device_name: str):
    return MMS_FA.get_model(with_star=True).to(device_name).eval()


@torch.inference_mode()
def emissions(audio: np.ndarray, device: torch.device | None = None) -> tuple[torch.Tensor, float]:
    """Log-probabilities per 20 ms frame, shape (frames, tokens). Returns (emission, seconds_per_frame)."""
    device = device or pick_device()
    model = _model(str(device))
    wave = torch.from_numpy(audio)
    chunk = int(CHUNK_SECONDS * SAMPLE_RATE)
    ctx = int(CONTEXT_SECONDS * SAMPLE_RATE)
    hop = 320  # wav2vec2 downsampling factor: one frame per 20 ms
    parts: list[torch.Tensor] = []
    for start in range(0, len(wave), chunk):
        lo = max(0, start - ctx)
        hi = min(len(wave), start + chunk + ctx)
        piece = wave[lo:hi].unsqueeze(0).to(device)
        if piece.shape[1] < 400:  # too short for the conv front end
            continue
        em, _ = model(piece)
        em = em[0].float().cpu()
        drop_front = (start - lo) // hop
        keep = (min(start + chunk, len(wave)) - start) // hop
        parts.append(em[drop_front : drop_front + keep])
    emission = torch.cat(parts)
    return emission, len(audio) / SAMPLE_RATE / emission.shape[0]


def _token_ids(word: str) -> list[int]:
    d = MMS_FA.get_dict()
    return [d[c] for c in word]


def align_lines(emission: torch.Tensor, frame_sec: float, lines: list[Line], star_every_word: bool = False) -> list[Line]:
    """Fill start/end/score on every word in place."""
    # Transcript: * line1 words * line2 words * ... *  (or a * after every word)
    units: list[tuple[Word | None, list[int]]] = [(None, _token_ids(STAR))]
    for line in lines:
        for w in line.words:
            if w.norm:
                units.append((w, _token_ids(w.norm)))
                if star_every_word:
                    units.append((None, _token_ids(STAR)))
        if not star_every_word:
            units.append((None, _token_ids(STAR)))

    tokens = [t for _, ids in units for t in ids]
    if len(tokens) > emission.shape[0]:
        raise ValueError("Lyrics are longer than the audio can hold; check the lyrics file.")

    aligned, scores = F.forced_align(
        emission.unsqueeze(0), torch.tensor([tokens], dtype=torch.int32), blank=0
    )
    spans = F.merge_tokens(aligned[0], scores[0].exp())
    assert len(spans) == len(tokens)

    i = 0
    for word, ids in units:
        word_spans = spans[i : i + len(ids)]
        i += len(ids)
        if word is None:
            continue
        word.start = word_spans[0].start * frame_sec
        word.end = word_spans[-1].end * frame_sec
        word.score = float(np.mean([s.score for s in word_spans]))
    return lines


class MmsProvider:
    def capabilities(self) -> Capabilities:
        return Capabilities(
            provider_id="mms_fa",
            model_id="torchaudio.pipelines.MMS_FA",
            model_revision="ctc_alignment_mling_uroman/model.pt",
            weights_license="CC-BY-NC-4.0",
            commercial_use=False,
            languages=("*latin-romanized*",),
            max_audio_ms=None,
            score_kind="mms_token_prob",
            devices=("cpu", "mps", "cuda"),
        )

    def align(self, audio: np.ndarray, sample_rate: int, lines: list[Line], language: str) -> ProviderResult:
        if sample_rate != SAMPLE_RATE:
            raise ValueError(f"MMS_FA needs {SAMPLE_RATE} Hz audio")
        t0 = time.perf_counter()
        emission, frame_sec = emissions(audio)
        t1 = time.perf_counter()
        align_lines(emission, frame_sec, lines)
        return ProviderResult(timings_s={"emissions": t1 - t0, "forced_align": time.perf_counter() - t1})
