"""Deploy Syncopate to a Hugging Face Space (Docker SDK).

Usage (normally run by GitHub Actions, see .github/workflows/):
    HF_TOKEN=... python deploy/deploy_space.py --space USER/syncopate-staging --env staging

The Space builds the repo's Dockerfile itself. This script uploads only what the build
needs (Dockerfile, app/, core/) plus a Space README, sets the runtime variables that
tell the app which environment it is, and creates the Space on first run.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

REPO = Path(__file__).resolve().parents[1]
SKIP = shutil.ignore_patterns("node_modules", "dist", ".venv", "__pycache__", "*.pyc", ".DS_Store", "tests")

SPACE_README = """---
title: Syncopate ({env})
emoji: 🎤
colorFrom: yellow
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Lyrics that follow the performer ({env})
---

Syncopate {env} build `{version}`. Source: https://github.com/KushalBhanot/syncopate
"""


def git_version() -> str:
    sha = os.environ.get("GITHUB_SHA") or subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.strip()
    return sha[:7]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--space", required=True, help="Space id, e.g. kushal/syncopate-staging")
    parser.add_argument("--env", required=True, choices=["staging", "production"])
    parser.add_argument("--private", action="store_true", help="Create the Space as private")
    args = parser.parse_args()

    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    version = git_version()

    api.create_repo(args.space, repo_type="space", space_sdk="docker", private=args.private, exist_ok=True)
    # Runtime variables: Spaces pass these to the container (and restart it when they change).
    api.add_space_variable(args.space, "SYNCOPATE_ENV", args.env)
    api.add_space_variable(args.space, "SYNCOPATE_VERSION", version)

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        shutil.copy(REPO / "Dockerfile", out / "Dockerfile")
        shutil.copy(REPO / ".dockerignore", out / ".dockerignore")
        shutil.copytree(REPO / "app", out / "app", ignore=SKIP)
        shutil.copytree(REPO / "core", out / "core", ignore=SKIP)
        (out / "README.md").write_text(SPACE_README.format(env=args.env, version=version))
        api.upload_folder(
            repo_id=args.space,
            repo_type="space",
            folder_path=out,
            delete_patterns="*",  # remove files that no longer exist in the repo
            commit_message=f"Deploy {version} to {args.env}",
        )

    owner, name = args.space.split("/")
    print(f"Deployed {version} to {args.env}: https://{owner}-{name}.hf.space".lower().replace("_", "-"))


if __name__ == "__main__":
    main()
