import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { validateGenerate } from './validate.js';
import { createJobs } from './jobs.js';
import { buildCapabilities } from './capabilities.js';
import { createAceStep } from './providers/acestep.js';
import { createMock } from './providers/mock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = new Set(['index.html', 'dsp.js', 'beat.js', 'lame.min.js']);
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

export function makeProvider(cfg) {
  if (cfg.musicProvider === 'mock') return createMock();
  if (cfg.musicProvider === 'acestep' && cfg.acestep.url) return createAceStep({ baseUrl: cfg.acestep.url, apiKey: cfg.acestep.key, format: cfg.acestep.format, timeoutMs: cfg.acestep.timeoutMs });
  return null;
}

export function createApp(cfg = loadConfig(), { provider = makeProvider(cfg), now = Date.now } = {}) {
  const app = express(), jobs = provider ? createJobs({ provider, pollMs: cfg.pollMs, jobTimeoutMs: cfg.jobTimeoutMs, ttlMs: cfg.jobTtlMs, now }) : null, hits = new Map();
  app.set('trust proxy', 1); app.disable('x-powered-by');
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'black-mzungu-studio', version: 'v3' }));
  app.get('/api/capabilities', (req, res) => res.json(buildCapabilities(cfg, provider)));

  const guard = (req, res, next) => {
    if (!cfg.accessToken) { if (cfg.production) return res.status(503).json({ error: 'Server access token is not set. Set STUDIO_ACCESS_TOKEN to enable AI features.' }); return next(); }
    const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.get('x-studio-token') || '';
    return crypto.timingSafeEqual(digest(given), digest(cfg.accessToken)) ? next() : res.status(401).json({ error: 'Access token missing or wrong.' });
  };
  const recent = ip => (hits.get(ip) || []).filter(x => now() - x < 3600000);
  const needProvider = (req, res, next) => provider && provider.configured() ? next() : res.status(503).json({ error: 'No music model is connected. Set ACESTEP_API_URL (see docs/AI_SETUP.md). The procedural beat maker still works.' });

  app.post('/api/music/generate', guard, needProvider, (req, res) => {
    const v = validateGenerate(req.body, { maxDurationSec: cfg.maxDurationSec });
    if (!v.ok) return res.status(400).json({ error: v.errors[0], errors: v.errors });
    const ip = req.ip || 'x', used = recent(ip);
    if (used.length >= cfg.generatePerHour) return res.status(429).json({ error: `Limit reached: ${cfg.generatePerHour} generations per hour.` });
    const { job, duplicate } = jobs.create(v.value);
    if (!duplicate) hits.set(ip, [...used, now()]);
    return res.status(duplicate ? 200 : 202).json({ jobId: job.id, duplicate, job: jobs.view(job) });
  });
  app.get('/api/jobs/:id', guard, (req, res) => { const j = jobs && jobs.get(req.params.id); return j ? res.json(jobs.view(j)) : res.status(404).json({ error: 'Job not found (the server may have restarted).' }); });
  app.delete('/api/jobs/:id', guard, (req, res) => res.json({ cancelled: !!(jobs && jobs.cancel(req.params.id)) }));
  app.get('/api/jobs/:id/audio', guard, async (req, res) => {
    const j = jobs && jobs.get(req.params.id);
    if (!j) return res.status(404).json({ error: 'Job not found.' });
    if (j.status !== 'succeeded') return res.status(409).json({ error: 'Audio is not ready.' });
    try {
      const a = await provider.fetchAudio(j.audioRef); res.set('Content-Type', a.contentType); if (a.length) res.set('Content-Length', a.length);
      for await (const chunk of a.body) res.write(chunk); res.end();
    } catch (e) { if (!res.headersSent) res.status(502).json({ error: String(e.message || 'Could not fetch the audio.').slice(0, 200) }); else res.end(); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

  const send = f => (req, res) => res.sendFile(path.join(ROOT, f));
  let page = null; const index = (req, res) => { if (!page || !cfg.production) page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('</head>', '<script>window.__BMS_BACKEND=1</script></head>'); res.type('html').send(page); };
  app.get('/', index); app.get('/index.html', index); for (const f of STATIC) if (f !== 'index.html') app.get('/' + f, send(f));
  app.use((err, req, res, next) => { if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' }); if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON.' }); res.status(500).json({ error: 'Server error.' }); });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = loadConfig(); createApp(cfg).listen(cfg.port, () => console.log(`BLACK MZUNGU STUDIO v3 listening on ${cfg.port} (music provider: ${cfg.musicProvider})`));
}
