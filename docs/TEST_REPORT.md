# Test report (25 Oct 2026)

## Commands that were run and their results
| Command | Result |
|---|---|
| `npm test` (unit and server tests, Node test runner) | 44 tests, **44 passed, 0 failed** |
| `node test/e2e-browser.mjs` (real headless Chromium, fake microphone, static hosting without the backend) | **38 checks passed, 0 failed** |
| `node test/e2e-v3.mjs` (real headless Chromium + studio server + local fake ACE-Step server) | **7 checks passed, 0 failed** |
| JavaScript syntax check of the page script | passed |

The browser tests need `puppeteer-core` and `@sparticuz/chromium` installed separately (they are not project dependencies).

## What the tests cover
- **Audio maths (unit):** WAV 16/24-bit, loudness against a known tone, true peak, limiter ceiling, mastering target and limiter depth, clip editing, pitch detection/correction on synthetic tones, noise gate, beat maker, project backup, presets.
- **Server (unit, mocks):** health, capability registry, missing provider config, auth and production-without-token, validation (prompts, bpm, duration, key, lyrics, JSON, size), job lifecycle, failure, timeout, duplicate prevention, cancel, rate limit, audio download, static-file safety, no secret in responses, repo hygiene (.env not tracked, `.env.example` clean).
- **ACE-Step adapter:** tested against a **local fake that follows the documented API** (submit, poll, download, auth header, wrong key, failed task, server errors with retry, unreachable server, refusal of non-`/v1/audio` locations). **This is not a real model test.**
- **Browser flows:** page start, beat maker, recording with a fake microphone, track arming/mute, take review (listen, delete, undo, re-take muting), zoom, playback, WAV/24-bit/MP3 export (files decoded back and checked for audio), MP3 import, vocal engineer, presets, Mix Assistant, mastering to the Apple Music target, Auto Produce with Before/After and the engineering report, backup, reload persistence, AI music flow through the server (consent, token, generation, "use as beat").
- **Mobile layout:** screenshots at 390 x 844 were inspected by eye during development; there is no automated layout assertion.

## What could not be tested
- **No real AI model:** ACE-Step was not run (no GPU, no server). The adapter has never talked to a real ACE-Step server. Status in the registry: "implemented, needs external setup".
- **No physical iPhone:** microphone hardware, Bluetooth behaviour, real latency, iOS Safari quirks, and how recordings sound.
- **Sound quality:** no listening test. Measurements are not proof that a song sounds professional.
- **Security review:** no penetration test; checks are the automated ones listed above.
- **Deployment:** the V3 branch has not been deployed. The production site is still the previous static version.
