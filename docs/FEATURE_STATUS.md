# Feature status (matches `server/capabilities.js`)

| Feature | Status | Evidence |
|---|---|---|
| Multitrack recording booth, takes, clips, take review, undo | Implemented and tested | Browser test with a fake microphone. Real iPhone hardware not tested. |
| Vocal analysis and automatic settings | Implemented and tested | Unit tests on synthetic signals; browser run. Thresholds are starting heuristics. |
| Mix Assistant | Implemented and tested | Unit tests of the advice logic; browser run. |
| Mastering (loudness, limiter, true peak) | Implemented and tested | Unit tests (loudness against a known tone, limiter ceiling); validated exports. |
| WAV 16/24-bit, MP3, stems, backup | Implemented and tested | Round-trip and validation tests; MP3 decoded back. |
| Engineering report | Implemented and tested | Browser test checks the report content. |
| Procedural beat maker | Implemented and tested | Unit tests. Not AI. |
| **AI music (ACE-Step)** | Implemented, needs external setup | Tested against a local fake that follows the documented API and with a mock provider. **Never tested against a real model.** |
| Pitch correction | Experimental | Synthetic tones only. |
| Spatial preview | Experimental | Binaural panning, not Dolby Atmos. |
| Genuine de-esser | Not available | Only a static cut exists. |
| Source separation | Not available | Not integrated. |
| AI denoising | Not available | Only a gate exists. |
| Suno | Not available | No official self-serve API. |
| Language-model planner | Not available | Planning is rule-based. |
| Server-side project storage | Not available | Local-first by design. |
