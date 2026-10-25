# AI technology research (checked 25 Oct 2026)

Method: web searches and the ACE-Step API document itself. Several claims come from search summaries or third-party pages, not from the primary repository page; those are marked "verify". Nothing here was run on a GPU.

| Technology | What it really offers | Licence | Resources | Limits | Decision |
|---|---|---|---|---|---|
| **ACE-Step 1.5** | Open music model: text-to-music, lyrics, 50+ languages, cover/repaint/extract editing. Documented async REST API (`/release_task`, `/query_result`, `/v1/audio`, `/health`, optional API key). | MIT (model card). Authors state output may be used commercially (verify before releasing music). | Model card says it runs with under 4 GB VRAM; CPU/MPS works but is slow (README). One GitHub issue reports a decode stall on a 6 GB laptop GPU. | Needs a GPU machine you run or rent. Cannot run on Render free (512 MB RAM, 0.1 CPU). No cancel endpoint found in the docs. | **Selected** for AI music. Adapter written to the documented API. |
| **Suno** | Consumer music generator. | n/a | n/a | Sources (mid 2026) say there is no self-serve, documented public API. Suno announced an invite-only developer API exploration (July 2026). Third-party "Suno API" resellers are unofficial: terms and reliability risk. | **Not integrated.** |
| **Demucs (source separation)** | Splits stems (vocals, drums, bass, other; 6-stem variant). | Code MIT. A third-party model page says no explicit licence grant was identified for the released weights (verify). Original Meta repo archived 1 Jan 2025; `adefossez/demucs` is the maintained fork. | Heavy CPU/GPU; browser inference needs lots of memory. | Not feasible on Render free. Weights licence unclear. | **Not integrated.** Registry says not available. |
| AI denoising / enhancement | Candidates exist; none evaluated deeply here. | n/a | n/a | No verified, licensed, phone-friendly option selected. | **Not integrated.** A noise gate exists (not denoising). |
| Pitch correction | Implemented locally: YIN detection + PSOLA shifting. | Own code | Runs in the phone browser | Tested on synthetic tones only. | **Experimental.** |
| Language model planner | Could turn measurements into plans. | n/a | Needs a paid or self-hosted LLM | None connected; costs money. | **Not integrated.** Planning is rule-based on measurements. |
| iOS Safari audio | `getUserMedia` plus AudioWorklet capture raw PCM; MediaRecorder formats vary. | n/a | n/a | Bluetooth mics are low quality; latency cannot be guaranteed. | Capture via AudioWorklet; device and Bluetooth warnings. |
| Render free web service | 512 MB RAM, 0.1 CPU, ephemeral filesystem, spins down after 15 min idle, shared monthly hours. | n/a | n/a | Files vanish on restart; no persistent disk on free; none of the instance types in the sources I read has a GPU. | Local-first storage; backend keeps no recordings. |

## Sources
- ACE-Step 1.5 model card: https://huggingface.co/ACE-Step/Ace-Step1.5
- ACE-Step API document: https://raw.githubusercontent.com/ace-step/ACE-Step-1.5/HEAD/docs/en/API.md
- ACE-Step issue about API on a 6 GB GPU: https://github.com/ace-step/ACE-Step/issues/415
- Suno developer API reports: https://musicbusinessworldwide.com/suno-explores-developer-api-seeking-apps-that-unlock-experiences-generative-music-makes-possible-for-the-first-time and https://www.aimusicpreneur.com/ai-tools-news/suno-developer-api/
- Demucs: https://github.com/adefossez/demucs , archived original https://github.com/facebookresearch/demucs , weights licence note https://huggingface.co/Ryan5453/unblend
- Render free tier: https://render.com/docs/free , https://render.com/docs/faq

Before paying for anything, re-read the primary pages above; prices, licences and APIs change.
