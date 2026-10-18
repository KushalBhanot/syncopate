# Deployments

The public site is the **static web app** on Vercel, which needs no backend. It has the editor,
artist prompter, LED view, three demo songs, and "open a song" for a recording plus a cue file.
The AI timing step (`syncopate align`) runs on a laptop for now; the full app with uploads and AI
can also run as a Docker image (see the last section).

| | Staging | Production |
| --- | --- | --- |
| Host | Vercel (Hobby, free) | Vercel, same project |
| Git branch | `main`: every push deploys | `production`: moves only when promoted |
| URL | `<project>-git-main-<vercel-username>.vercel.app` | `<project>.vercel.app` |
| How to deploy | Push or merge to `main` | Actions → "Promote to production" → pick a commit, type `production` |
| Badge in the UI | Amber "staging" | None |

Rolling back production: run "Promote to production" again with an older commit.

## What the static site can and can't do

- Songs and edits are saved in each visitor's browser (IndexedDB), never on a server.
- The prompter and LED view follow the editor between windows of the **same browser**
  (BroadcastChannel). Phones or tablets as separate prompters need the server version.
- No automatic timing. Make a cue file with the CLI and open it alongside the recording:

```bash
cd core
uv run syncopate align song.mp3 lyrics.txt -o song.json   # .json keeps word timings; .lrc also works
```

## One-time Vercel setup

1. Sign in at vercel.com with GitHub and choose **Add New → Project → Import** `KushalBhanot/syncopate`.
2. Set **Root Directory** to `app`. Everything else comes from `app/vercel.json`. Deploy.
3. In the project, open Settings → Environments → Production, and set its branch to `production`.
   From then on, `main` builds are previews (staging) and only the `production` branch reaches production.
4. In GitHub, run Actions → "Promote to production" once to create the `production` branch.

Vercel's Hobby plan is for personal, non-commercial use; move to Pro (or Cloudflare Pages / GitHub
Pages) once Syncopate is used commercially.

## Run the static site locally

```bash
cd app && npm run dev:static
```

## Full app with AI (Docker)

The repo-root `Dockerfile` builds one image with the API, the AI models, the WebSocket hub and the web
app on port 7860. "Deploy full app to Hugging Face" (Actions, manual) pushes it to a Hugging Face
Docker Space, which needs a PRO subscription, with the `HF_TOKEN` secret and `HF_SPACE` variable in the
GitHub `staging` environment.

```bash
docker build --platform linux/amd64 -t syncopate:local .
docker run --rm --platform linux/amd64 -p 7860:7860 -e SYNCOPATE_ENV=local syncopate:local
```

Always build for `linux/amd64`: one Demucs dependency, `sphn`, has no prebuilt ARM Linux package, so a
native Apple-silicon build fails. Limits for public deployments are environment variables:
`MAX_UPLOAD_MB=40`, `MAX_AUDIO_MINUTES=10`.
