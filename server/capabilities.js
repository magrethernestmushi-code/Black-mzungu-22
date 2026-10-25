// Capability registry. Status values: implemented_tested | implemented_needs_config | experimental | not_available
export function buildCapabilities(cfg, provider) {
  const music = provider ? { id: 'ai_music', name: 'AI music generation (ACE-Step)', status: 'implemented_needs_config', configured: provider.configured(), mock: !!provider.mock,
      detail: provider.mock ? 'MOCK provider active: returns a test tone, not music.' : 'Adapter follows the documented ACE-Step 1.5 REST API. Tested against a local fake that implements the documented protocol, NOT against a real model.', host: provider.host, realModelTested: false }
    : { id: 'ai_music', name: 'AI music generation (ACE-Step)', status: 'implemented_needs_config', configured: false, mock: false, detail: 'Needs ACESTEP_API_URL pointing at an ACE-Step server you run (GPU recommended). See docs/AI_SETUP.md.', host: '', realModelTested: false };
  const T = (id, name, detail) => ({ id, name, status: 'implemented_tested', detail });
  return { version: 'v3', authRequired: !!cfg.accessToken, capabilities: [
    T('recording', 'Multitrack recording booth', 'Real microphone capture, takes, clips, track lanes. Automated browser test with a fake microphone; needs your physical iPhone for hardware checks.'),
    T('editing', 'Clip editing, take review, undo', 'Split, trim, move, duplicate, fades, gain, mute/solo, delete/undo.'),
    T('vocal_analysis', 'Vocal analysis and auto settings', 'Measures level, clipping, noise, low end, mud, harshness, sibilance, dynamics; sets HPF/EQ/compressor/gate/reverb/delay.'),
    T('mix_assistant', 'Mix Assistant', 'Measures vocal vs beat balance, masking, bass, mono, width, true peak.'),
    T('mastering', 'Mastering (loudness, limiter, true peak)', 'ITU-R BS.1770 loudness, lookahead limiter, bounded limiting, validated export.'),
    T('export', 'Export WAV 16/24, MP3, stems, backup', 'Validated files; project backup/restore (.bms).'),
    T('procedural_beats', 'Procedural beat maker (not AI)', 'Rule-based synthesis: drums, plucked guitar, keys, 808 bass.'),
    T('engineering_report', 'Engineering report', 'Downloadable measured before/after report after Auto Produce.'),
    music,
    { id: 'pitch', name: 'Pitch correction', status: 'experimental', detail: 'Real pitch detection and PSOLA shifting; unit-tested on synthetic tones only; quality on real vocals unverified.' },
    { id: 'spatial', name: 'Spatial preview', status: 'experimental', detail: 'Binaural (HRTF) panning for headphones. Not Dolby Atmos.' },
    { id: 'deesser', name: 'Genuine de-esser', status: 'not_available', detail: 'Only a static 7 kHz cut exists, which is not a de-esser.' },
    { id: 'separation', name: 'Source separation (Demucs or similar)', status: 'not_available', detail: 'Needs heavy CPU/GPU and its weights licence is unclear. Not integrated. See docs/AI_TECH_RESEARCH.md.' },
    { id: 'denoise', name: 'AI vocal denoising', status: 'not_available', detail: 'Not integrated. Only a noise gate exists.' },
    { id: 'suno', name: 'Suno', status: 'not_available', detail: 'No self-serve official public API found; unofficial wrappers are not used.' },
    { id: 'llm_planner', name: 'Language-model planner', status: 'not_available', detail: 'Planning is rule-based on measurements. No LLM provider is connected.' },
    { id: 'server_storage', name: 'Server-side project storage', status: 'not_available', detail: 'By design: recordings stay on your device; use backup export.' },
  ] };
}
