# Syncopate

Lyrics that follow the performer: time every lyric line/word from a rehearsal recording, then drive an
artist prompter and an LED-wall view. Built by Kushal Bhanot (all technical work) and Lucy Li (USC
first-year civil engineering; customer discovery, deck, weekly updates) for the USC tiehub **SHIP Fund,
AI track**, fall 2026.

## SHIP dates

Weekly updates due Mondays 5 PM PT (Airtable form) through Nov 16. Check-in #1 week of Oct 26,
check-in #2 week of Nov 16, Final ASK due **Nov 23, 5 PM PT**, winners Dec 8. Judging: execution and
progress, technical potential, commercial opportunity, team. Evidence over pitch.

## Layout and commands

- `core/` Python (uv, Python 3.12): `syncopate align song.mp3 lyrics.txt -o song.json|.lrc|.srt|.csv`,
  `syncopate eval` (JamendoLyrics benchmark), `syncopate serve` (FastAPI + WebSocket hub on :8000).
  Tests: `cd core && uv run pytest -q`.
- `app/` React + Vite + TS. `npm run dev` (server mode, proxies to :8000), `npm run dev:static`
  (no backend), `npm run build`, `npm run build:static`.
- Pipeline: Demucs HT vocal isolation, then torchaudio MMS_FA forced alignment, star token between lines.
  We use pretrained Meta models; we did not train a model. The live follower (real-time tracking with
  jump recovery) is the planned original contribution and is not built yet.

## Benchmark (results/)

20 English JamendoLyrics songs, 868 lines: 79.1% of lines within 300 ms with Demucs (76.6% full mix),
~20 s/song on an M1. Two songs fail outright (Avercage "Embers", Pure Mids "The Leader"); next fix is
anchored re-alignment. Editor "check" flag threshold 0.10 is calibrated from results/jamendo_demucs.json.

## Deployments (docs/DEPLOY.md)

- Public site = static build on Vercel (Hobby). `main` = staging
  (syncopate-git-main-kushalbhanots-projects.vercel.app, amber badge). Production = `production` branch
  (syncopate-pi.vercel.app), moved only by the manual "Promote to production" GitHub workflow.
- Static mode: demo songs in `app/public/demo/` (CC-licensed, credited; keep lyrics clean), user songs
  and edits in IndexedDB, screens sync between windows via BroadcastChannel, no AI step online.
- Full app with AI: repo-root Dockerfile (build `--platform linux/amd64`; `sphn` has no ARM wheel).
  Hugging Face Docker Spaces need PRO ($9/mo); that workflow is manual only and unused.

## Working agreements

- Stop any dev servers or containers started for testing before finishing.
- Check current prices and free tiers before recommending a service.
- Commits end with the Co-Authored-By line; push and promote only when Kushal asks.
- Explain decisions in plain language; Kushal needs to be able to answer judges and Lucy.
