import pytest

from syncopate.providers import PROVIDER_IDS, ProviderNotAllowed, get_provider


def test_default_provider_reports_its_license(monkeypatch):
    monkeypatch.delenv("SYNCOPATE_COMMERCIAL", raising=False)
    caps = get_provider("mms_fa").capabilities()
    assert caps.weights_license == "CC-BY-NC-4.0"
    assert caps.commercial_use is False
    assert caps.score_kind == "mms_token_prob"


def test_commercial_build_refuses_noncommercial_weights(monkeypatch):
    monkeypatch.setenv("SYNCOPATE_COMMERCIAL", "1")
    with pytest.raises(ProviderNotAllowed):
        get_provider("mms_fa")


def test_unknown_provider_is_an_error():
    with pytest.raises(KeyError):
        get_provider("does_not_exist")


def test_known_provider_ids():
    assert set(PROVIDER_IDS) == {"mms_fa", "qwen3_fa"}


def test_qwen_units_map_back_to_original_words():
    from syncopate.lyrics import parse_lyrics
    from syncopate.providers.qwen import map_units_to_words

    lines = parse_lyrics("Don't stop, 2 believin'\nHold on")
    # Model drops the number and lowercases; mapping must follow our words, not its tokens.
    pairs = map_units_to_words(["don't", "stop", "believin'", "hold", "on"], lines)
    words = [w.text for line in lines for w in line.words]
    assert [(u, words[w]) for u, w in pairs] == [
        (0, "Don't"), (1, "stop,"), (2, "believin'"), (3, "Hold"), (4, "on"),
    ]


def test_commercial_build_refuses_vocal_separation(monkeypatch):
    from syncopate.align import align

    monkeypatch.setenv("SYNCOPATE_PROFILE", "commercial")
    with pytest.raises(ProviderNotAllowed):
        align("missing.mp3", "la la", separate=True, provider="qwen3_fa")


def test_commercial_build_defaults_to_commercially_licensed_provider(monkeypatch):
    from syncopate.providers.registry import default_provider_id

    monkeypatch.delenv("SYNCOPATE_PROVIDER", raising=False)
    monkeypatch.setenv("SYNCOPATE_PROFILE", "commercial")
    assert default_provider_id() == "qwen3_fa"
