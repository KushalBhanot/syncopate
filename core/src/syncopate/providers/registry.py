"""Provider lookup. SYNCOPATE_PROVIDER picks the default; commercial builds refuse uncleared weights."""

from __future__ import annotations

import os
from functools import lru_cache

from .base import AlignmentProvider

PROVIDER_IDS = ("mms_fa", "qwen3_fa")
DEFAULT_PROVIDER = "mms_fa"


class ProviderNotAllowed(RuntimeError):
    pass


@lru_cache(maxsize=None)
def _load(provider_id: str) -> AlignmentProvider:
    if provider_id == "mms_fa":
        from .mms import MmsProvider

        return MmsProvider()
    if provider_id == "qwen3_fa":
        from .qwen import QwenProvider  # optional dependency: uv sync --extra qwen

        return QwenProvider()
    raise KeyError(f"Unknown provider {provider_id!r}; choose one of {', '.join(PROVIDER_IDS)}")


def commercial_build() -> bool:
    return os.environ.get("SYNCOPATE_COMMERCIAL") == "1"


def get_provider(provider_id: str | None = None) -> AlignmentProvider:
    provider = _load(provider_id or os.environ.get("SYNCOPATE_PROVIDER", DEFAULT_PROVIDER))
    caps = provider.capabilities()
    if commercial_build() and not caps.commercial_use:
        raise ProviderNotAllowed(
            f"{caps.provider_id} weights are {caps.weights_license}; not allowed in a commercial build"
        )
    return provider
