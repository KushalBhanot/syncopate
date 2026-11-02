"""The contract every alignment backend implements, so models can be swapped and audited.

A provider fills start/end (and score, when it has one) on the words it is given and reports
what it is: which weights, under which license, with which limits. Callers never assume a
score means the same thing across providers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from ..lyrics import Line


class UnsupportedInput(ValueError):
    """The provider cannot align this input (too long, unsupported language). Never truncate silently."""


@dataclass(frozen=True)
class Capabilities:
    provider_id: str
    model_id: str  # upstream model identifier, e.g. a Hugging Face repo
    model_revision: str  # pinned revision or checkpoint hash
    weights_license: str
    commercial_use: bool  # cleared for paid use according to compliance/model-manifest.json
    languages: tuple[str, ...]  # language names accepted by align()
    max_audio_ms: int | None  # None: provider chunks internally
    score_kind: str  # "mms_token_prob" | "none"; scores are only comparable within one kind
    devices: tuple[str, ...]


@dataclass
class ProviderResult:
    warnings: list[str] = field(default_factory=list)
    timings_s: dict[str, float] = field(default_factory=dict)


class AlignmentProvider(Protocol):
    def capabilities(self) -> Capabilities: ...

    def align(self, audio: np.ndarray, sample_rate: int, lines: list[Line], language: str) -> ProviderResult:
        """Fill Word.start/end (seconds) and Word.score in place for every word it can place."""
        ...
