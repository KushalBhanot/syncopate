"""Syncopate: lyrics that follow the performer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(prog="syncopate")
    sub = parser.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("align", help="Time-align lyrics to a recording (CueBuilder)")
    a.add_argument("audio", type=Path)
    a.add_argument("lyrics", type=Path, help="Plain-text lyrics, one sung line per line")
    a.add_argument("-o", "--out", type=Path, help="Write cues here; format from extension (.json .lrc .srt .csv)")
    a.add_argument("--no-separate", action="store_true", help="Align the full mix (skip Demucs)")

    e = sub.add_parser("eval", help="Benchmark on JamendoLyrics")
    e.add_argument("--language", default="English")
    e.add_argument("--limit", type=int)
    e.add_argument("--out", type=Path, default=Path("../results/jamendo.json"))
    e.add_argument("--no-separate", action="store_true", help="Align the full mix (skip Demucs)")

    s = sub.add_parser("serve", help="Run the local API for the web app")
    s.add_argument("--port", type=int, default=8000)

    args = parser.parse_args()

    if args.cmd == "align":
        from . import export
        from .align import align

        result = align(args.audio, args.lyrics.read_text(), separate=not args.no_separate)
        out = args.out or args.audio.with_suffix(".json")
        writers = {
            ".json": lambda: json.dumps(export.to_json(result.lines, result.duration), indent=2),
            ".lrc": lambda: export.to_lrc(result.lines),
            ".srt": lambda: export.to_srt(result.lines),
            ".csv": lambda: export.to_csv(result.lines),
        }
        out.write_text(writers[out.suffix]())
        print(f"Aligned {len(result.lines)} lines in {result.seconds_taken:.1f}s -> {out}")
    elif args.cmd == "eval":
        from .evaluate import run

        run(args.language, args.limit, args.out, separate=not args.no_separate)
    elif args.cmd == "serve":
        import uvicorn

        uvicorn.run("syncopate.server:app", host="127.0.0.1", port=args.port, reload=False)
