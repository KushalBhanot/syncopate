#!/usr/bin/env python3
"""Write an SBOM and THIRD_PARTY_NOTICES from what is actually installed. Run inside the final image.

  python scripts/generate_sbom.py --npm-lock app/package-lock.json --out compliance-out/

Python packages come from the running environment's metadata; JavaScript packages from the npm
lockfile (production dependencies only). Packages with no declared license are listed as UNKNOWN
so a reviewer sees them instead of assuming they are fine.
"""

from __future__ import annotations

import argparse
import importlib.metadata as md
import json
from pathlib import Path


def python_packages() -> list[dict]:
    out = []
    for dist in md.distributions():
        meta = dist.metadata
        lic = meta.get("License-Expression") or meta.get("License") or ""
        if not lic or len(lic) > 80:  # some packages paste the full license text here
            classifiers = [c.split("::")[-1].strip() for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
            lic = "; ".join(classifiers) or ("see package" if lic else "UNKNOWN")
        out.append({"ecosystem": "pypi", "name": meta["Name"], "version": dist.version, "license": lic})
    return sorted(out, key=lambda p: p["name"].lower())


def npm_packages(lockfile: Path) -> list[dict]:
    lock = json.loads(lockfile.read_text())
    out = []
    for path, info in lock.get("packages", {}).items():
        if not path or info.get("dev"):  # root project and build-only tools do not ship
            continue
        name = path.split("node_modules/")[-1]
        out.append({"ecosystem": "npm", "name": name, "version": info.get("version", "?"), "license": info.get("license", "UNKNOWN")})
    return sorted(out, key=lambda p: p["name"].lower())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--npm-lock", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    packages = python_packages() + (npm_packages(args.npm_lock) if args.npm_lock else [])
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "sbom.json").write_text(json.dumps({"schema": 1, "packages": packages}, indent=2))
    lines = ["# Third-party notices", "", "Generated from the installed environment. Full license texts ship with each package.", ""]
    lines += [f"- {p['ecosystem']}: {p['name']} {p['version']} ({p['license']})" for p in packages]
    (args.out / "THIRD_PARTY_NOTICES.md").write_text("\n".join(lines) + "\n")
    unknown = [p["name"] for p in packages if p["license"] == "UNKNOWN"]
    print(f"{len(packages)} packages; {len(unknown)} without a declared license: {', '.join(unknown[:20])}")


if __name__ == "__main__":
    main()
