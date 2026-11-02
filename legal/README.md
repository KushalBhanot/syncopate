# Ownership, licensing and commercial-use decisions

Status as of 2026-11-01: **open**. Nothing here is legal advice. This file records what must be
decided by the people who own the work, so a paid release is not blocked by an unanswered question.
Until each item is decided, the repository has **no license file**: all rights are reserved by the
owners, and nobody else may reuse the code.

## Decisions needed before charging money

| # | Decision | Who decides | Status | Evidence to record here |
| --- | --- | --- | --- | --- |
| 1 | Who owns the application code and brand (Kushal alone, or shared with contributors such as Luyi/Lucy Li) | The contributors, in writing | Open | Signed contributor or co-founder agreement |
| 2 | Whether USC policy or the SHIP Fund award gives USC or tiehub any claim to the IP | Kushal, with USC/tiehub | Open | USC IP policy section and SHIP award terms, quoted with dates |
| 3 | License for our own code (proprietary, or a named open-source license) | Owners (after 1-2) | Open | The chosen LICENSE file |
| 4 | Customer terms: upload rights, retention, deletion, no training without opt-in | Owners, ideally with counsel | Open | legal/app-terms.md (not written yet) |
| 5 | Paid hosting: Vercel Hobby is non-commercial only | Kushal | Open | Chosen plan/host and its terms URL and date |
| 6 | Model and codec approvals (see compliance/model-manifest.json) | A named reviewer | Open | `reviewer` and `commercial_use: approved` per artifact |
| 7 | Demo content for a commercial site (current demos are pending/NC) | Owners | Open | Commissioned or licensed demos in compliance/demo-assets.json |

## Third-party obligations already known

- Qwen3-ForcedAligner-0.6B weights: Apache-2.0. Ship the license text and any NOTICE with the weights.
- MMS_FA weights: CC-BY-NC 4.0. Never in a paid product; the commercial build refuses them.
- HT Demucs weights: permission unresolved; left out of commercial builds.
- FFmpeg: obligations depend on enabled components; record the build flags.
- Demo recordings: CC BY / BY-NC / BY-NC-SA via Jamendo; the NC ones are free-demo only.
- Customer songs: no model license clears a customer's recording or lyrics. Uploading requires the
  customer to have those rights (decision 4).

Run `python3 scripts/check_artifacts.py --profile commercial` to see what still blocks a paid release.
