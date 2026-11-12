# Syncopate

Lyrics that follow the performer. Syncopate times every line and word of a song from one rehearsal
recording, then drives an artist prompter and an LED-wall view in sync with the show.

Built for the USC tiehub SHIP Fund (AI track), fall 2026, by Kushal Bhanot.

## What works today

- **CueBuilder**: upload a recording and the lyrics, get line and word timestamps in about 20–30 s on an
  M1 laptop. Demucs isolates the vocal, then torchaudio's MMS_FA forced aligner places every word.
- **Editor**: play the song, check each line, nudge it by 50 ms or tap it to the playhead, export
  `.lrc`, `.srt` or a `.csv` cue list.
- **Artist prompter** (`/prompter`): black screen, huge current line, next line shown early, the next word
  in amber. `?lead=0.5` sets how early a line appears; `?mirror=1` flips it for beam-splitter glass.
- **LED view** (`/led`): kinetic typography, each word rises in as it is sung. Capture the window into a
  media server (OBS/NDI).
- **Position hub** (`/ws/show`): every screen follows whichever client sends positions. Today that is the
  editor's audio player; LiveFollow (real-time tracking of the live singer) will plug in here next.

## Benchmark

`syncopate eval` scores CueBuilder on the 20 English songs of
[JamendoLyrics MultiLang](https://huggingface.co/datasets/jamendolyrics/jamendolyrics) (868 lines,
word-level ground truth). Results are written to `results/`.

| Setup | Lines within 300 ms | Lines within 1 s | Word PCO (0.3 s) | Speed (M1 Pro) |
| --- | --- | --- | --- | --- |
| Full mix, no separation | 76.6% | 82.6% | 76.8% | 0.03× realtime (~7 s/song) |
| Demucs vocals + MMS_FA (default) | 79.1% | 82.8% | 79.7% | 0.10× realtime (~20 s/song) |

The headline hides a long tail. Pooled over all 868 lines, the median onset error is 53 ms, but the
mean is 3.85 s, p90 is 18.2 s and p95 is 28.7 s. 14 of 20 songs land 78–100% of lines within 300 ms.
Two songs fail outright (Avercage "Embers" drifts from the first line, 5/42 lines within 300 ms; Pure
Mids "The Leader" loses its place at a wordless "aw ah" section, 7/20), and several others have a few
lines that are tens of seconds off. Next fix: anchored re-alignment, which keeps confident lines and
re-aligns the gaps between them.

The editor flags lines with low alignment confidence (below 0.10) so a human can check them. On this
set the flag catches 123 of 181 late lines (68%), 92 of its 215 flags were already on time (57%
precision), and it asks the operator to review 25% of all lines. The threshold was picked on these same
20 songs, so treat those numbers as optimistic. Demucs makes runs slightly nondeterministic (±a few
points per song). Per-song results and the full distribution: [docs/benchmark.md](docs/benchmark.md)
(regenerate with `python3 scripts/benchmark_report.py results/jamendo_demucs.json`).

## Run it

Requires [uv](https://docs.astral.sh/uv/) and Node 20+.

```bash
# API (first run downloads the MMS_FA and Demucs models, about 1.5 GB)
cd core && uv run syncopate serve

# Web app, in a second terminal
cd app && npm install && npm run dev
```

Open http://localhost:5173, add a song, then open the prompter and LED views in other windows.

Command line:

```bash
cd core
uv run syncopate align song.mp3 lyrics.txt -o song.lrc   # also .json .srt .csv
uv run syncopate eval --limit 5                          # benchmark (downloads songs to data/)
```

## Deployments

The public site is a static build on Vercel (no backend): editor, prompter, LED view, demo songs, and
opening your own recording with a cue file. Every push to `main` deploys staging; production is the
`production` branch, moved by hand with the "Promote to production" workflow. The AI timing step runs
locally with `syncopate align` for now. See [docs/DEPLOY.md](docs/DEPLOY.md).

Demo songs are from the [JamendoLyrics](https://huggingface.co/datasets/jamendolyrics/jamendolyrics)
dataset under Creative Commons licenses (Cortez, LUNABLIND, The.Madpix.Project); credits are shown
in the app.

## Layout

```
core/   Python: alignment, evaluation, FastAPI server (src/syncopate)
app/    React + Vite + TypeScript: library, editor, prompter, LED view
deploy/ Hugging Face Space deploy script for the full Docker app
docs/   Deployment guide, architecture diagram
results/ Benchmark outputs
data/   Datasets and uploaded songs (git-ignored)
```
