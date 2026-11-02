#!/usr/bin/env python3
"""Release gate for shipped artifacts (models, codecs, demo media). Standard library only.

  python scripts/check_artifacts.py                     # dev: manifests valid, demo hashes match
  python scripts/check_artifacts.py --profile commercial  # also: everything shipped is approved
  python scripts/check_artifacts.py --verify-cache        # also hash cached model weights

Exit code 0 = pass, 1 = fail. Reasons are printed one per line.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STATES = {"approved", "pending", "blocked"}
FLOATING = {"", "main", "master", "latest", "head"}
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REQUIRED = ("id", "kind", "profiles", "upstream_url", "revision", "files", "weights_license", "commercial_use", "reviewer")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_models(manifest: dict) -> list[str]:
    errors = []
    for a in manifest.get("artifacts", []):
        aid = a.get("id", "?")
        for key in REQUIRED:
            if key not in a:
                errors.append(f"{aid}: missing field {key}")
        if a.get("commercial_use") not in STATES:
            errors.append(f"{aid}: commercial_use must be one of {sorted(STATES)}")
        if a.get("commercial_use") == "approved" and not a.get("reviewer"):
            errors.append(f"{aid}: approved without a named reviewer")
        if a.get("kind", "").endswith("weights"):
            if str(a.get("revision", "")).strip().lower() in FLOATING:
                errors.append(f"{aid}: floating revision {a.get('revision')!r}; pin an exact revision")
            if not a.get("files"):
                errors.append(f"{aid}: weights listed without file hashes")
        for f in a.get("files", []):
            if not HEX64.match(f.get("sha256", "")):
                errors.append(f"{aid}: {f.get('path')} has no valid sha256")
    return errors


def validate_demos(demos: dict, repo: Path) -> list[str]:
    errors = []
    for asset in demos.get("assets", []):
        aid = asset.get("id", "?")
        if asset.get("commercial_use") not in STATES:
            errors.append(f"demo {aid}: commercial_use must be one of {sorted(STATES)}")
        if not asset.get("license") or not asset.get("attribution"):
            errors.append(f"demo {aid}: license and attribution are required")
        for f in asset.get("files", []):
            path = repo / f["path"]
            if not path.exists():
                errors.append(f"demo {aid}: {f['path']} is listed but missing")
            elif sha256(path) != f.get("sha256"):
                errors.append(f"demo {aid}: {f['path']} hash mismatch (file changed; re-review it)")
    listed = {f["path"] for a in demos.get("assets", []) for f in a.get("files", [])}
    for path in sorted((repo / "app/public/demo").glob("*")):
        rel = path.relative_to(repo).as_posix()
        if path.suffix in {".mp3", ".wav", ".m4a", ".png", ".jpg"} or (path.suffix == ".json" and path.name != "index.json"):
            if rel not in listed:
                errors.append(f"demo file {rel} ships without a manifest entry")
    return errors


def check_provider_pins(manifest: dict, repo: Path) -> list[str]:
    """The revision pinned in code must be the one that was reviewed."""
    errors = []
    pins = {"qwen3-forcedaligner-0.6b": repo / "core/src/syncopate/providers/qwen.py"}
    by_id = {a["id"]: a for a in manifest.get("artifacts", [])}
    for aid, source in pins.items():
        m = re.search(r'MODEL_REVISION\s*=\s*"([^"]+)"', source.read_text()) if source.exists() else None
        if not m:
            errors.append(f"{aid}: no MODEL_REVISION pin found in {source.relative_to(repo)}")
        elif aid in by_id and m.group(1) != by_id[aid]["revision"]:
            errors.append(f"{aid}: code pins {m.group(1)[:12]} but manifest reviewed {by_id[aid]['revision'][:12]}")
    return errors


def commercial_blockers(manifest: dict, demos: dict) -> list[str]:
    blockers = []
    for a in manifest.get("artifacts", []):
        if "commercial" in a.get("profiles", []) and a.get("commercial_use") != "approved":
            blockers.append(f"{a['id']}: commercial_use is {a.get('commercial_use')} (needs approved + reviewer)")
        qual = a.get("accuracy_qualification") or {}
        if "commercial" in a.get("profiles", []) and a.get("kind") == "model_weights" and qual.get("status") != "passed":
            blockers.append(f"{a['id']}: singing qualification is {qual.get('status', 'missing')}")
    for d in demos.get("assets", []):
        if d.get("commercial_use") != "approved":
            blockers.append(f"demo {d['id']}: {d.get('license')} is {d.get('commercial_use')}; remove or replace for a commercial build")
    return blockers


def verify_cache(manifest: dict) -> list[str]:
    """Hash weights found in local model caches; report mismatches, skip what is not downloaded."""
    errors = []
    roots = [Path.home() / ".cache/huggingface/hub", Path.home() / ".cache/torch/hub/checkpoints"]
    for a in manifest.get("artifacts", []):
        for f in a.get("files", []):
            hits = [p for root in roots if root.exists() for p in root.rglob(f["path"])]
            if hits and all(sha256(p.resolve()) != f["sha256"] for p in hits):
                errors.append(f"{a['id']}: cached {f['path']} does not match the reviewed hash")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", choices=["dev", "commercial"], default="dev")
    parser.add_argument("--verify-cache", action="store_true")
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument(
        "--manifests-only",
        action="store_true",
        help="Skip file and code-pin checks (inside a built image, where CI has already verified them)",
    )
    args = parser.parse_args(argv)

    manifest = json.loads((args.repo / "compliance/model-manifest.json").read_text())
    demos = json.loads((args.repo / "compliance/demo-assets.json").read_text())
    problems = validate_models(manifest)
    if not args.manifests_only:
        problems += validate_demos(demos, args.repo) + check_provider_pins(manifest, args.repo)
    if args.verify_cache:
        problems += verify_cache(manifest)
    if args.profile == "commercial":
        problems += commercial_blockers(manifest, demos)

    for p in problems:
        print(f"FAIL  {p}")
    print(f"{'PASS' if not problems else 'FAIL'}: {args.profile} profile, {len(problems)} problem(s)")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
