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
        from .qwen import QwenProvider  # dependency group 'qwen' (installed by default in dev)

        return QwenProvider()
    raise KeyError(f"Unknown provider {provider_id!r}; choose one of {', '.join(PROVIDER_IDS)}")


def commercial_build() -> bool:
    """True in the commercial Docker profile (SYNCOPATE_PROFILE=commercial) or when forced for tests."""
    return os.environ.get("SYNCOPATE_PROFILE") == "commercial" or os.environ.get("SYNCOPATE_COMMERCIAL") == "1"


def default_provider_id() -> str:
    """SYNCOPATE_PROVIDER wins; otherwise commercial builds default to the commercially licensed model."""
    return os.environ.get("SYNCOPATE_PROVIDER") or ("qwen3_fa" if commercial_build() else DEFAULT_PROVIDER)


def get_provider(provider_id: str | None = None) -> AlignmentProvider:
    provider = _load(provider_id or default_provider_id())
    caps = provider.capabilities()
    if commercial_build() and not caps.commercial_use:
        raise ProviderNotAllowed(
            f"{caps.provider_id} weights are {caps.weights_license}; not allowed in a commercial build"
        )
    return provider
