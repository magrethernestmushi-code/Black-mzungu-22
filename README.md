# BLACK MZUNGU STUDIO
Private mobile-first vocal studio. Everything runs in the browser; audio stays on the device (IndexedDB).

**Working:** beat import (MP3/WAV/M4A), beat maker (rule-based, 5 genres), multi-take recording with metronome, count-in, loop, input device selector, live meters and spectrum, clip editing (split, trim, move, duplicate, fades, gain, undo), auto vocal engineer (measures the vocal, sets HPF/EQ/sibilance/compressor/reverb/delay/gate), 10 editable presets + your own, experimental pitch correction, Mix Assistant, loudness-targeted mastering (limiter + true-peak ceiling), WAV and MP3 export with validation, project backup/restore (.bms).

**Not built yet:** separate vocal tracks (lead/double/harmony/ad-lib) with their own faders, true de-esser, noise reduction beyond the gate, AI models (denoise, stem separation), loudness-matched A/B preview, drag editing, projects list.

**Tests:** `npm test` (31 DSP/clip/beat/backup tests). Real-device listening tests (latency, recording quality, pitch-correction artefacts) are still needed.

Deploy: static site, publish path `.` (see render.yaml). Third-party notices: THIRD_PARTY.md.
