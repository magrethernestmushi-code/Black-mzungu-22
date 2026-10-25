# Setting up AI music

You need an **ACE-Step 1.5 API server**. This repository does not include or run the model.

1. Pick where it runs. It needs a GPU for reasonable speed (the model card says under 4 GB VRAM works; CPU is slow). Options: your own PC with an NVIDIA GPU, or a rented GPU machine (costs money; compare prices yourself).
2. Install ACE-Step from https://github.com/ACE-Step/ACE-Step-1.5 following its README, then start its API server (its API document lists the module and options). Set an API key: `ACESTEP_API_KEY=<long random value>`. **Never expose that server without a key.**
3. Make it reachable by the studio server over HTTPS (a public URL or a tunnel). The studio server and the music server must be able to talk to each other.
4. Set these environment variables on the studio server (Render dashboard, "Environment"; never commit them):
   - `STUDIO_ACCESS_TOKEN` : a long random value. You type it once on your phone when asked.
   - `ACESTEP_API_URL` : for example `https://your-music-server.example.com`
   - `ACESTEP_API_KEY` : the same key as step 2
5. Open the studio, BEAT tab, "AI music". It should say "Connected". Then try a short 30 second instrumental first.

Notes
- Instrumentals are requested with the lyrics text `[Instrumental]`. This follows ACE-Step's tag convention; confirm it works with your server version.
- The music server may keep generated files on its own disk. The studio server does not save them.
- A job cannot be cancelled on the music server (no cancel endpoint was found). Cancel only stops waiting.
- Local development without a model: `MUSIC_PROVIDER=mock npm start` gives a test tone, clearly labelled MOCK. It is refused in production.

Data flow: your text description (and lyrics, if you add them) goes from your phone to the studio server, then to the music server you configured. Recordings are never uploaded by this feature.
