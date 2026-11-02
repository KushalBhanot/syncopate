import copy
import importlib.util
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("check_artifacts", REPO / "scripts/check_artifacts.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

MANIFEST = json.loads((REPO / "compliance/model-manifest.json").read_text())
DEMOS = json.loads((REPO / "compliance/demo-assets.json").read_text())


def _qwen(manifest):
    return next(a for a in manifest["artifacts"] if a["id"] == "qwen3-forcedaligner-0.6b")


def test_repository_manifests_pass_dev_profile():
    assert check.main(["--repo", str(REPO)]) == 0


def test_floating_revision_is_rejected():
    m = copy.deepcopy(MANIFEST)
    _qwen(m)["revision"] = "main"
    assert any("floating revision" in e for e in check.validate_models(m))


def test_missing_hash_is_rejected():
    m = copy.deepcopy(MANIFEST)
    _qwen(m)["files"][0]["sha256"] = "abc"
    assert any("no valid sha256" in e for e in check.validate_models(m))


def test_approval_needs_a_named_reviewer():
    m = copy.deepcopy(MANIFEST)
    _qwen(m)["commercial_use"] = "approved"
    assert any("without a named reviewer" in e for e in check.validate_models(m))


def test_pending_or_blocked_artifacts_block_commercial_release():
    blockers = check.commercial_blockers(MANIFEST, DEMOS)
    assert any("qwen3-forcedaligner-0.6b" in b for b in blockers)
    assert any("lunablind-vision" in b for b in blockers)


def test_fully_cleared_profile_passes_commercial_gate():
    m = copy.deepcopy(MANIFEST)
    for a in m["artifacts"]:
        a["commercial_use"], a["reviewer"] = "approved", "Test Reviewer"
        if a["kind"] == "model_weights":
            a["accuracy_qualification"] = {"status": "passed"}
    d = copy.deepcopy(DEMOS)
    for asset in d["assets"]:
        asset["commercial_use"] = "approved"
    assert check.commercial_blockers(m, d) == []


def test_changed_demo_file_fails_hash_check(tmp_path):
    (tmp_path / "app/public/demo").mkdir(parents=True)
    (tmp_path / "app/public/demo/song.mp3").write_bytes(b"edited")
    demos = {"assets": [{"id": "song", "license": "CC BY", "attribution": "x", "commercial_use": "pending",
                         "files": [{"path": "app/public/demo/song.mp3", "sha256": "0" * 64}]}]}
    assert any("hash mismatch" in e for e in check.validate_demos(demos, tmp_path))


def test_unlisted_demo_file_is_rejected(tmp_path):
    (tmp_path / "app/public/demo").mkdir(parents=True)
    (tmp_path / "app/public/demo/new.mp3").write_bytes(b"x")
    assert any("without a manifest entry" in e for e in check.validate_demos({"assets": []}, tmp_path))
