# Architecture

```
iPhone Safari (studio UI + DSP)  <--HTTPS-->  Node server (Express)  <--HTTP-->  ACE-Step server (you run it)
 recording, editing, mixing,                  /api/health, /api/capabilities        text-to-music
 mastering, analysis, exports                 /api/music/generate, /api/jobs/:id
 IndexedDB project storage                    (token, limits, job tracking)
```

**A. Studio interface** (`index.html`): booth, timeline, take review, mix, master, beat tab. All audio recording, analysis, effects, loudness measurement, limiting and export run in the browser (`dsp.js`, `beat.js`). Recordings and projects live in IndexedDB on the phone and can be exported as `.bms` backups.

**B. Backend** (`server/`): serves the studio and a small API. It never stores recordings. Generated music is streamed from the music server through to the phone and not saved. Job state is in memory (lost on restart; documented).
- `config.js` environment settings. `validate.js` input validation. `jobs.js` job manager (status, stages, elapsed time, timeout, retry of transient errors, duplicate prevention, cancel, cleanup). `capabilities.js` capability registry. `providers/` adapters (`acestep.js` real, `mock.js` tests only).
- Provider interface: `configured()`, `health()`, `submit(params)`, `poll(id)`, `fetchAudio(ref)`. Another model can replace ACE-Step by implementing these five calls.

**C. AI engines**: ACE-Step through the adapter. Not available: separation, AI denoising, LLM planning, Suno (see `FEATURE_STATUS.md`).

**D. DSP engine** (browser): high-pass, EQ, static sibilance cut, compressor, gate, reverb, delay, pitch correction (experimental), BS.1770 loudness, true-peak estimate, lookahead limiter, panning, fades, WAV 16/24-bit and MP3 export.

**E. Storage**: local-first. Backup export is the safety net. Render free has an ephemeral disk, so nothing important is kept on the server.

## AI Engineer workflow (Producer, "Auto Produce")
validate project, measure vocal, build plan from measurements, apply processing, balance against beat (Mix Assistant), render, master with bounded limiting, re-measure the processed vocal, list remaining issues, offer Before/After at matched loudness, export song and an engineering report. There is no retry loop: at most one pass, by design.

## Security
Optional-but-required-in-production access token (constant-time compare); AI routes return 503 in production if no token is set; per-IP generation limit; 50 KB JSON limit; strict validation; the audio path from the music server must start with `/v1/audio` (no arbitrary URLs); only four static files are served; secrets only in environment variables; no secret appears in `/api/capabilities`.
