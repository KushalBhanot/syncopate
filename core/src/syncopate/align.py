"""CueBuilder core: forced alignment of known lyrics to a song recording.

Uses torchaudio's MMS_FA (wav2vec2 CTC, trained on 1,100+ languages). The model is run over
the song in overlapping chunks, then CTC forced alignment places every word. A "star" token
between lines lets the aligner skip ad-libs, backing vocals and instrumental gaps.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import librosa
import numpy as np
import torch
import torchaudio.functional as F
from torchaudio.pipelines import MMS_FA

from .lyrics import Line, Word, parse_lyrics

SAMPLE_RATE = MMS_FA.sample_rate  # 16 kHz
CHUNK_SECONDS = 30.0
CONTEXT_SECONDS = 1.0
STAR = "*"


@dataclass
class AlignResult:
    lines: list[Line]
    duration: float
    seconds_taken: float
    audio: np.ndarray  # what was aligned: the isolated vocal stem, or the mix (16 kHz mono)


def pick_device() -> torch.device:
    return torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")


@lru_cache(maxsize=1)
def _model(device_name: str):
    model = MMS_FA.get_model(with_star=True).to(device_name).eval()
    return model


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
    """Demucs HT vocal stem, as mono float32 at 16 kHz. Drums and guitars confuse a speech model."""
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

    _fill_unaligned(lines)
    return lines


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
    audio_path: str | Path, lyrics_text: str, separate: bool = True, device: torch.device | None = None
) -> AlignResult:
    t0 = time.perf_counter()
    audio = isolate_vocals(audio_path, device) if separate else load_audio(audio_path)
    lines = parse_lyrics(lyrics_text)
    emission, frame_sec = emissions(audio, device)
    align_lines(emission, frame_sec, lines)
    return AlignResult(
        lines=lines, duration=len(audio) / SAMPLE_RATE, seconds_taken=time.perf_counter() - t0, audio=audio
    )
