import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { createApp } from '../server/index.js';
import { loadConfig } from '../server/config.js';
import { validateGenerate } from '../server/validate.js';
import { createAceStep } from '../server/providers/acestep.js';
import { createMock } from '../server/providers/mock.js';
import { wavEncode } from '../dsp.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cfgOf = (o = {}) => ({ ...loadConfig({}), accessToken: 'secret-test-token', pollMs: 15, jobTimeoutMs: 3000, musicProvider: 'mock', ...o });
async function serve(app) { const s = http.createServer(app); await new Promise(r => s.listen(0, '127.0.0.1', r)); return { url: 'http://127.0.0.1:' + s.address().port, close: () => new Promise(r => s.close(r)) }; }
const H = { authorization: 'Bearer secret-test-token', 'content-type': 'application/json' };
const post = (u, body, h = H) => fetch(u + '/api/music/generate', { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
async function waitDone(u, id, ms = 4000) { const t = Date.now(); for (;;) { const j = await (await fetch(`${u}/api/jobs/${id}`, { headers: H })).json(); if (j.status !== 'running' || Date.now() - t > ms) return j; await sleep(20); } }
const good = { prompt: 'Dark Afro RnB, 98 BPM, plucked guitar and warm 808', bpm: 98, duration: 30, key_scale: 'A minor', instrumental: true };

test('health endpoint and capability registry (mock tests, no real model)', async () => {
  const s = await serve(createApp(cfgOf())); const h = await (await fetch(s.url + '/api/health')).json(); assert.equal(h.ok, true);
  const c = await (await fetch(s.url + '/api/capabilities')).json(); const m = c.capabilities.find(x => x.id === 'ai_music');
  assert.equal(m.realModelTested, false); assert.equal(m.mock, true);
  for (const id of ['separation', 'denoise', 'suno', 'deesser', 'llm_planner']) assert.equal(c.capabilities.find(x => x.id === id).status, 'not_available');
  assert.ok(c.capabilities.some(x => x.status === 'implemented_tested') && c.capabilities.some(x => x.status === 'experimental')); await s.close();
});
test('missing provider config is reported clearly and honestly', async () => {
  const s = await serve(createApp(cfgOf({ musicProvider: 'none' }))); const r = await post(s.url, good); assert.equal(r.status, 503); assert.match((await r.json()).error, /ACESTEP_API_URL/);
  const c = await (await fetch(s.url + '/api/capabilities')).json(); assert.equal(c.capabilities.find(x => x.id === 'ai_music').configured, false); await s.close();
});
test('auth: token required; production without token disables AI routes', async () => {
  const s = await serve(createApp(cfgOf())); assert.equal((await post(s.url, good, { 'content-type': 'application/json' })).status, 401);
  assert.equal((await post(s.url, good, { ...H, authorization: 'Bearer wrong' })).status, 401); await s.close();
  const p = await serve(createApp(cfgOf({ accessToken: '', production: true }))); const r = await post(p.url, good, { 'content-type': 'application/json' }); assert.equal(r.status, 503); assert.match((await r.json()).error, /STUDIO_ACCESS_TOKEN/); await p.close();
});
test('input validation: invalid prompts, bpm, duration, lyrics, JSON, size', async () => {
  const s = await serve(createApp(cfgOf()));
  for (const bad of [{}, { prompt: 'hi' }, { prompt: 'x'.repeat(1001) }, { ...good, bpm: 500 }, { ...good, bpm: 'fast' }, { ...good, duration: 1000 }, { ...good, key_scale: 'banana' }, { ...good, instrumental: false }, { ...good, lyrics: 'x'.repeat(6001), instrumental: false }])
    assert.equal((await post(s.url, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  assert.equal((await post(s.url, '{not json')).status, 400); assert.equal((await post(s.url, { prompt: 'a'.repeat(60000) })).status, 413);
  assert.equal(validateGenerate({ ...good, instrumental: false, lyrics: '[Verse]\nla la', vocal_language: 'sw' }).ok, true); await s.close();
});
test('job lifecycle with mock: status, audio download, valid file', async () => {
  const s = await serve(createApp(cfgOf())); const r = await post(s.url, good); assert.equal(r.status, 202); const { jobId } = await r.json();
  const j = await waitDone(s.url, jobId); assert.equal(j.status, 'succeeded'); assert.equal(j.audioReady, true);
  const a = await fetch(`${s.url}/api/jobs/${jobId}/audio`, { headers: H }); assert.equal(a.status, 200); const b = Buffer.from(await a.arrayBuffer()); assert.equal(b.slice(0, 4).toString(), 'RIFF'); assert.ok(b.length > 1000);
  assert.equal((await fetch(`${s.url}/api/jobs/${jobId}/audio`)).status, 401); assert.equal((await fetch(`${s.url}/api/jobs/nope`, { headers: H })).status, 404); await s.close();
});
test('job failure, timeout, duplicate prevention, cancel, rate limit', async () => {
  const s = await serve(createApp(cfgOf({ generatePerHour: 4, jobTimeoutMs: 300 })));
  const f = await (await post(s.url, { ...good, prompt: good.prompt + ' FAIL_TEST' })).json(); const fj = await waitDone(s.url, f.jobId); assert.equal(fj.status, 'failed'); assert.match(fj.error.message, /Mock failure/);
  const h1 = await (await post(s.url, { ...good, prompt: good.prompt + ' HANG_TEST' })).json(); const h2 = await (await post(s.url, { ...good, prompt: good.prompt + ' HANG_TEST' })).json(); assert.equal(h2.duplicate, true); assert.equal(h2.jobId, h1.jobId);
  const hj = await waitDone(s.url, h1.jobId); assert.equal(hj.status, 'failed'); assert.equal(hj.error.code, 'timeout');
  const c1 = await (await post(s.url, { ...good, prompt: good.prompt + ' HANG_TEST two' })).json(); const del = await (await fetch(`${s.url}/api/jobs/${c1.jobId}`, { method: 'DELETE', headers: H })).json(); assert.equal(del.cancelled, true);
  assert.equal((await fetch(`${s.url}/api/jobs/${c1.jobId}`, { headers: H }).then(r => r.json())).status, 'cancelled');
  await post(s.url, { ...good, prompt: good.prompt + ' extra' }); assert.equal((await post(s.url, { ...good, prompt: good.prompt + ' more' })).status, 429); await s.close();
});
test('unsafe static access is refused and secrets are not exposed', async () => {
  const s = await serve(createApp(cfgOf())); for (const p of ['/server/index.js', '/.env', '/package.json', '/../package.json', '/node_modules/express/package.json']) assert.equal((await fetch(s.url + p)).status, 404, p);
  const home = await fetch(s.url + '/'); assert.equal(home.status, 200); assert.match(await home.text(), /__BMS_BACKEND/); const body = await (await fetch(s.url + '/api/capabilities')).text(); assert.ok(!body.includes('secret-test-token')); await s.close();
});
test('repo hygiene: no .env tracked, .env.example has no real secrets, server never logs tokens', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n'); assert.ok(!tracked.some(f => /(^|\/)\.env$/.test(f)));
  const ex = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8'); assert.ok(!/(sk-[A-Za-z0-9]{10,}|ghp_|github_pat_|Bearer [A-Za-z0-9]{20,})/.test(ex));
  for (const f of ['index.js', 'jobs.js', 'config.js', 'providers/acestep.js']) assert.ok(!/console\.(log|error|warn)\([^)]*(accessToken|apiKey|ACESTEP_API_KEY|STUDIO_ACCESS_TOKEN)/.test(fs.readFileSync(new URL('../server/' + f, import.meta.url), 'utf8')), f);
});

// ---- ACE-Step adapter against a LOCAL FAKE implementing the documented API (not a real model) ----
function fakeAce({ key = '', failTask = false, status500 = 0 } = {}) {
  const tasks = new Map(); const seen = { auth: [], body: null };
  const wav = Buffer.from(wavEncode([Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i / 10))], 22050));
  const srv = http.createServer((req, res) => {
    seen.auth.push(req.headers.authorization || ''); const json = (o, c = 200) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: o, code: c, error: null })); };
    if (key && req.headers.authorization !== 'Bearer ' + key) return json({}, 401);
    if (req.url === '/health') return json({ status: 'ok', service: 'ACE-Step API', version: '1.0' });
    if (req.url.startsWith('/v1/audio')) { res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(wav); }
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const body = b ? JSON.parse(b) : {};
      if (req.url === '/release_task') { if (status500-- > 0) return json({}, 500); seen.body = body; const id = 'task-' + tasks.size; tasks.set(id, 0); return json({ task_id: id, status: 'queued', queue_position: 1 }); }
      if (req.url === '/query_result') { const id = body.task_id_list[0], n = (tasks.get(id) || 0) + 1; tasks.set(id, n); if (n < 2) return json([{ task_id: id, status: 0, result: '[]' }]);
        return json([{ task_id: id, status: failTask ? 2 : 1, result: JSON.stringify([{ file: failTask ? '' : '/v1/audio?path=%2Ftmp%2Fa.wav', status: failTask ? 2 : 1, metas: { bpm: 98 }, generation_info: 'boom' }]) }]); }
      json({}, 404);
    });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + srv.address().port, seen, close: () => new Promise(c => srv.close(c)) })));
}
test('ACE-Step adapter vs local fake of the documented API: submit, poll, download, auth header', async () => {
  const f = await fakeAce({ key: 'k-test' }); const a = createAceStep({ baseUrl: f.url, apiKey: 'k-test' });
  assert.equal((await a.health()).ok, true); const sub = await a.submit({ prompt: 'afro guitar', instrumental: true, bpm: 98, duration: 30, key_scale: 'A minor' });
  assert.equal(f.seen.body.lyrics, '[Instrumental]'); assert.equal(f.seen.body.bpm, 98); assert.equal(f.seen.body.audio_duration, 30); assert.equal(f.seen.body.key_scale, 'A minor');
  assert.equal((await a.poll(sub.remoteId)).state, 'running'); const p = await a.poll(sub.remoteId); assert.equal(p.state, 'succeeded'); assert.ok(p.audioRef.startsWith('/v1/audio'));
  const au = await a.fetchAudio(p.audioRef); const chunks = []; for await (const c of au.body) chunks.push(c); assert.equal(Buffer.concat(chunks).slice(0, 4).toString(), 'RIFF');
  assert.ok(f.seen.auth.every(x => x === 'Bearer k-test')); await assert.rejects(a.fetchAudio('http://evil.example/steal'), /Refused/); await assert.rejects(a.fetchAudio('/etc/passwd'), /Refused/); await f.close();
});
test('ACE-Step adapter: wrong key, failed task, server errors with retry, unreachable', async () => {
  const f = await fakeAce({ key: 'right' }); await assert.rejects(createAceStep({ baseUrl: f.url, apiKey: 'wrong' }).submit({ prompt: 'x y z q r', instrumental: true }), e => e.code === 'http_401' && e.retryable === false); await f.close();
  const g = await fakeAce({ failTask: true }); const a = createAceStep({ baseUrl: g.url }); const s = await a.submit({ prompt: 'fail please', instrumental: true }); await a.poll(s.remoteId); assert.equal((await a.poll(s.remoteId)).state, 'failed'); await g.close();
  const h = await fakeAce({ status500: 2 }); const app = await serve(createApp(cfgOf({ musicProvider: 'acestep' }), { provider: createAceStep({ baseUrl: h.url }) }));
  const { jobId } = await (await post(app.url, good)).json(); assert.equal((await waitDone(app.url, jobId)).status, 'succeeded'); const au = await fetch(`${app.url}/api/jobs/${jobId}/audio`, { headers: H }); assert.equal(Buffer.from(await au.arrayBuffer()).slice(0, 4).toString(), 'RIFF'); await app.close(); await h.close();
  await assert.rejects(createAceStep({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 }).health(), e => e.retryable === true);
});
