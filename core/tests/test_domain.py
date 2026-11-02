import copy

import pytest

from syncopate.domain import InvalidCues, check, migrate_v1, to_v1, validate

V1 = {
    "duration": 12.3456,
    "lines": [
        {"text": "Héllo wörld", "section": "Verse", "start": 1.0004, "end": 2.5,
         "words": [{"text": "Héllo", "start": 1.0004, "end": 1.6, "score": 0.9},
                   {"text": "wörld", "start": 1.6, "end": 2.5, "score": 0.4}]},
        {"text": "مرحبا 你好", "section": None, "start": 3.0, "end": 4.0,
         "words": [{"text": "مرحبا", "start": 3.0, "end": 3.5, "score": None},
                   {"text": "你好", "start": 3.5, "end": 4.0, "score": None}]},
    ],
}


def test_migration_uses_integer_ms_ids_and_keeps_original_text():
    doc = migrate_v1(V1)
    assert doc["schema"] == 2 and doc["duration_ms"] == 12346
    assert doc["lines"][0]["start_ms"] == 1000 and doc["lines"][0]["text"] == "Héllo wörld"
    assert doc["lines"][1]["words"][0]["text"] == "مرحبا"  # RTL and CJK survive untouched
    ids = [l["id"] for l in doc["lines"]] + [w["id"] for l in doc["lines"] for w in l["words"]]
    assert len(ids) == len(set(ids))
    assert doc["provenance"] == {"provider": "legacy-unknown"}
    assert doc["revision"]["parent"] is None and len(doc["revision"]["cue_hash"]) == 64
    assert validate(doc) == []


def test_v1_export_round_trips_timing():
    back = to_v1(migrate_v1(V1))
    assert back["lines"][0]["words"][1]["start"] == 1.6
    assert back["lines"][1]["text"] == "مرحبا 你好"


@pytest.mark.parametrize("mutate,message", [
    (lambda d: d["lines"][0].update(start_ms=3000, end_ms=2000), "starts after it ends"),
    (lambda d: d["lines"][1].update(start_ms=500), "starts before the previous line"),
    (lambda d: d["lines"][0]["words"][0].update(start_ms=-5), "invalid times"),
    (lambda d: d["lines"][1].update(id=d["lines"][0]["id"]), "duplicate id"),
    (lambda d: d["lines"][0].update(review="maybe"), "unknown review state"),
])
def test_invalid_timing_is_rejected(mutate, message):
    doc = migrate_v1(V1)
    mutate(doc)
    with pytest.raises(InvalidCues) as err:
        check(doc)
    assert any(message in p for p in err.value.problems)
