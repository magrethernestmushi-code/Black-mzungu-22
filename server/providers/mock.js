// MOCK provider: for automated tests and local development only. It generates a plain test tone, NOT music.
import { wavEncode } from '../../dsp.js';
export function createMock({ polls = 2 } = {}) {
  const tasks = new Map(); let n = 0;
  const wav = () => { const sr = 22050, x = Float32Array.from({ length: sr * 2 }, (_, i) => 0.3 * Math.sin(2 * Math.PI * 440 * i / sr)); return Buffer.from(wavEncode([x], sr)); };
  return {
    id: 'mock', label: 'MOCK provider (test tone, not AI music)', mock: true, host: 'mock.local', configured: () => true,
    async health() { return { ok: true, detail: { service: 'mock' } }; },
    async submit(p) { if (/FAIL_TEST/.test(p.prompt)) { tasks.set('t' + ++n, { fail: true, left: 1 }); } else if (/HANG_TEST/.test(p.prompt)) { tasks.set('t' + ++n, { hang: true }); } else tasks.set('t' + ++n, { left: polls }); return { remoteId: 't' + n }; },
    async poll(id) { const t = tasks.get(id); if (!t || t.hang) return { state: 'running' }; if (--t.left > 0) return { state: 'running' }; return t.fail ? { state: 'failed', error: 'Mock failure requested.' } : { state: 'succeeded', audioRef: '/v1/audio?path=mock', meta: { bpm: 100 } }; },
    async fetchAudio() { const b = wav(); return { body: (async function* () { yield b; })(), contentType: 'audio/wav', length: String(b.length) }; },
  };
}
