# BLACK MZUNGU STUDIO V3 (branch `v3-ai-studio`)

A private, phone-first music studio. Recording, editing, mixing and mastering run in the browser. An optional Node backend connects to an ACE-Step music server for AI-generated instrumentals.

**Not deployed from this branch.** Production still serves the previous static version. Do not merge until you have tested V3.

## Run locally
```
npm ci
STUDIO_ACCESS_TOKEN=pick-a-long-secret npm start        # http://localhost:3000
# optional AI music: also set ACESTEP_API_URL and ACESTEP_API_KEY (see docs/AI_SETUP.md)
# test the AI screens without a model: MUSIC_PROVIDER=mock npm start   (plays a test tone, labelled MOCK)
```
## Test
```
npm test                  # 44 unit and server tests
node test/e2e-browser.mjs # real-browser tests (needs puppeteer-core and @sparticuz/chromium)
node test/e2e-v3.mjs      # AI music flow against a local fake ACE-Step server
```
## Deploy on Render
Use `render.yaml` (a Node web service named `black-mzungu-studio-v3`, health check `/api/health`). Set `STUDIO_ACCESS_TOKEN`, and optionally `ACESTEP_API_URL` and `ACESTEP_API_KEY`, in the Render dashboard. Copy `.env.example`; never commit `.env`. In production the AI routes are disabled until `STUDIO_ACCESS_TOKEN` is set.

## Documents
`docs/AI_TECH_RESEARCH.md`, `ARCHITECTURE.md`, `FEATURE_STATUS.md`, `AI_SETUP.md`, `TEST_REPORT.md`, `COSTS_AND_LIMITATIONS.md`.

## Honest status in one paragraph
Working and tested: recording, editing, vocal analysis and auto settings, Mix Assistant, loudness mastering, exports, backup, procedural beats, engineering report. Implemented but never run against a real model: AI music (ACE-Step). Experimental: pitch correction, spatial preview. Not available: Suno, source separation, AI denoising, true de-esser, LLM planner. Third-party notice: `THIRD_PARTY.md` (lamejs, LGPL-3.0).
