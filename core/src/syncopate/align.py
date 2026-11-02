"""CueBuilder orchestration: audio in, timed lyrics out, through a replaceable alignment provider.

Model-specific work lives in providers/. This module loads audio, optionally isolates the vocal,
parses the lyrics, asks the chosen provider to place the words, fills words no provider can read
(numbers, symbols) and records provenance so every cue file says which model and weights made it.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np
import torch

from .lyrics import Line, parse_lyrics
from .providers import get_provider
from .providers.mms import pick_device

SAMPLE_RATE = 16_000  # every provider and the live reference work at 16 kHz mono

# Re-exported for older imports and experiments.
from .providers.mms import align_lines, emissions  # noqa: E402,F401


@dataclass
class AlignResult:
    lines: list[Line]
    duration: float
    seconds_taken: float
    audio: np.ndarray  # what was aligned: the isolated vocal stem, or the mix (16 kHz mono)
    provenance: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def load_audio(path: str | Path) -> np.ndarray:
    """Mono float32 at 16 kHz."""
    audio, _ = librosa.load(str(path), sr=SAMPLE_RATE, mono=True)
    return audio.astype(np.float32)


@lru_cache(maxsize=1)
def _separator(device_name: str):
    from demucs.pretrained import get_model

    return get_model("htdemucs").to(device_name).eval()


@torch.inference_mode()
def isolate_vocals(path: str | Path, device: torch.device | None = None) -> np.ndarray:
    """Demucs HT vocal stem, as mono float32 at 16 kHz.

    The HT Demucs checkpoint's commercial permission is unresolved (see compliance/), so this is
    off in commercial builds; paid jobs align the full mix or a customer-supplied clean stem.
    """
    from demucs.apply import apply_model

    device = device or pick_device()
    model = _separator(str(device))
    mix, _ = librosa.load(str(path), sr=model.samplerate, mono=False)
    if mix.ndim == 1:
        mix = np.stack([mix, mix])
    wav = torch.from_numpy(mix).float()
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / (ref.std() + 1e-8)
    stems = apply_model(model, wav[None], device=device, split=True, overlap=0.1, progress=False)[0]
    vocals = stems[model.sources.index("vocals")] * (ref.std() + 1e-8) + ref.mean()
    vocals = vocals.mean(0).cpu().numpy()
    return librosa.resample(vocals, orig_sr=model.samplerate, target_sr=SAMPLE_RATE).astype(np.float32)


def _fill_unaligned(lines: list[Line]) -> None:
    """Words with no alignable letters (numbers, symbols) get the gap next to their neighbours."""
    words = [w for line in lines for w in line.words]
    for k, w in enumerate(words):
        if w.start is not None:
            continue
        prev_end = next((x.end for x in reversed(words[:k]) if x.end is not None), 0.0)
        next_start = next((x.start for x in words[k + 1 :] if x.start is not None), prev_end)
        w.start, w.end = prev_end, max(prev_end, next_start)


def align(
    audio_path: str | Path,
    lyrics_text: str,
    separate: bool = True,
    provider: str | None = None,
    language: str = "English",
) -> AlignResult:
    t0 = time.perf_counter()
    chosen = get_provider(provider)
    caps = chosen.capabilities()
    audio = isolate_vocals(audio_path) if separate else load_audio(audio_path)
    lines = parse_lyrics(lyrics_text)
    result = chosen.align(audio, SAMPLE_RATE, lines, language)
    _fill_unaligned(lines)
    return AlignResult(
        lines=lines,
        duration=len(audio) / SAMPLE_RATE,
        seconds_taken=time.perf_counter() - t0,
        audio=audio,
        warnings=result.warnings,
        provenance={
            "provider": caps.provider_id,
            "model": caps.model_id,
            "model_revision": caps.model_revision,
            "weights_license": caps.weights_license,
            "commercial_use": caps.commercial_use,
            "score_kind": caps.score_kind,
            "separator": "htdemucs" if separate else None,
            "language": language,
            "timings_s": {k: round(v, 3) for k, v in result.timings_s.items()},
        },
    )
