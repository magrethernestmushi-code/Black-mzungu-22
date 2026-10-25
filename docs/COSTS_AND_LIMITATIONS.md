# Costs and limitations

**Costs**
- Studio on Render: a free web service is $0 but has 512 MB RAM, 0.1 CPU, sleeps after 15 minutes idle (first request can take about a minute) and loses local files on restart. A $7/month Starter instance (from the pricing page I read) removes the sleeping. Check Render's pricing page before relying on these numbers.
- AI music: the model is free and open, but it needs a GPU. Your own GPU costs electricity; a rented GPU costs money per hour. Nothing in this project signs you up or enables billing.
- Suno, hosted music APIs, LLM planners: not used, so no cost.

**Limitations (honest list)**
- No real-model test has been run. AI music is untested against a real ACE-Step server.
- No source separation, no AI denoising, no true de-esser, no language-model planning.
- Pitch correction is experimental. Spatial preview is not Dolby Atmos.
- Job status is in memory. If the studio server restarts, a running job is lost.
- Mastering and analysis run on the phone and block the screen for a while on long songs.
- Software cannot guarantee identical sound on every speaker. Check the result on earphones, a phone speaker and a larger system.
- Bluetooth microphones sound poor; latency cannot be guaranteed.
