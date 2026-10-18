# Deployments

Syncopate ships as one Docker image (repo-root `Dockerfile`). The same image runs everywhere;
runtime variables say which environment it is.

| | Staging | Production |
| --- | --- | --- |
| Host | Hugging Face Space (free CPU: 2 vCPU, 16 GB RAM) | Separate target, not set up yet |
| Deploys | Automatically on every push to `main`, after tests pass | Manually: Actions → "Deploy production" → type `production` |
| GitHub environment | `staging` | `production` (add required reviewers in repo settings) |
| Secrets / variables | `HF_TOKEN` secret, `HF_SPACE` variable | Its own `HF_TOKEN` and `HF_SPACE` |
| Access | Public | Decide before launch |
| Uploaded songs | Lost when the Space restarts or sleeps (48 h idle) | Needs persistent storage |

The UI shows an amber environment badge on every non-production deployment, and
`/api/health` reports the environment and the deployed commit.

## One-time setup for staging

1. Create a Hugging Face account and an access token with **write** permission
   (huggingface.co → Settings → Access Tokens).
2. In GitHub: repo Settings → Environments → New environment → `staging`.
   - Add the secret `HF_TOKEN` (the token from step 1).
   - Add the variable `HF_SPACE` = `<your-hf-username>/syncopate-staging`.
3. Run Actions → "Deploy staging" → Run workflow (or push to `main`). The first run creates
   the Space. Hugging Face then builds the image, which takes about 10–15 minutes the first time.

Staging URL: `https://<your-hf-username>-syncopate-staging.hf.space`

## Limits on public deployments

Set as environment variables (defaults shown): `MAX_UPLOAD_MB=40`, `MAX_AUDIO_MINUTES=10`.
Only one song aligns at a time; others queue. On the free CPU Space a 4-minute song takes a few
minutes to align.

## Run the image locally

```bash
docker build --platform linux/amd64 -t syncopate:local .
docker run --rm --platform linux/amd64 -p 7860:7860 -e SYNCOPATE_ENV=local syncopate:local
```

Always build for `linux/amd64` (what Hugging Face runs). One Demucs dependency, `sphn`, has no
prebuilt ARM Linux package, so a native Apple-silicon build fails. On a Mac the amd64 image runs
under emulation, so alignment there is much slower than in a real deployment.

Then open http://localhost:7860.
