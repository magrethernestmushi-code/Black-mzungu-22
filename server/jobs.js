import crypto from 'node:crypto';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safe = e => ({ message: String(e && e.message || 'Unknown error').slice(0, 300), code: (e && e.code) || 'error' });
export function createJobs({ provider, pollMs = 2000, jobTimeoutMs = 600000, ttlMs = 3600000, maxJobs = 100, now = Date.now }) {
  const jobs = new Map(), active = new Map();
  const view = j => ({ id: j.id, status: j.status, stage: j.stage, message: j.message, error: j.error || null, queuePosition: j.queuePosition ?? null, elapsedSeconds: Math.round(((j.status === 'running' ? now() : j.updatedAt) - j.createdAt) / 1000), meta: j.meta || null, audioReady: j.status === 'succeeded', params: j.params });
  const cleanup = () => { for (const [id, j] of jobs) if (j.status !== 'running' && now() - j.updatedAt > ttlMs) jobs.delete(id); while (jobs.size > maxJobs) { const old = [...jobs.values()].find(j => j.status !== 'running'); if (!old) break; jobs.delete(old.id); } };
  async function run(job) {
    const t0 = now();
    try {
      job.stage = 'submitting'; job.message = 'Sending your request to the music model…';
      let remote; for (let a = 0; ; a++) { try { remote = await provider.submit(job.params); break; } catch (e) { if (a >= 2 || !e.retryable) throw e; await sleep(400 * (a + 1)); } }
      job.remoteId = remote.remoteId; job.queuePosition = remote.queuePosition ?? null; job.stage = 'generating'; job.message = 'The model is generating your music. This can take from under a minute to several minutes.';
      let bad = 0;
      for (;;) {
        if (job.status === 'cancelled') return;
        if (now() - t0 > jobTimeoutMs) throw Object.assign(new Error('Timed out waiting for the music model.'), { code: 'timeout' });
        await sleep(pollMs);
        if (job.status === 'cancelled') return;
        let p; try { p = await provider.poll(job.remoteId); bad = 0; } catch (e) { if (++bad >= 3 || !e.retryable) throw e; continue; }
        if (p.state === 'succeeded') { job.audioRef = p.audioRef; job.meta = p.meta || {}; job.status = 'succeeded'; job.stage = 'done'; job.message = 'Your music is ready.'; return; }
        if (p.state === 'failed') throw Object.assign(new Error(p.error || 'The music model reported a failure.'), { code: 'provider_failed' });
      }
    } catch (e) { if (job.status !== 'cancelled') { job.status = 'failed'; job.stage = 'failed'; job.error = safe(e); job.message = job.error.message; } }
    finally { job.updatedAt = now(); active.delete(job.key); }
  }
  return {
    create(params) {
      cleanup();
      const key = crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex');
      if (active.has(key)) return { job: jobs.get(active.get(key)), duplicate: true };
      const id = crypto.randomUUID(), job = { id, key, params, status: 'running', stage: 'queued', message: 'Queued.', createdAt: now(), updatedAt: now() };
      jobs.set(id, job); active.set(key, id); run(job); return { job, duplicate: false };
    },
    get: id => jobs.get(id), view,
    cancel(id) { const j = jobs.get(id); if (!j || j.status !== 'running') return false; j.status = 'cancelled'; j.stage = 'cancelled'; j.message = 'Cancelled here. The music server may still finish the task.'; j.updatedAt = now(); active.delete(j.key); return true; },
    size: () => jobs.size,
  };
}
