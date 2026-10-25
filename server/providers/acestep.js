// Adapter for the ACE-Step 1.5 REST API as documented in docs/en/API.md of the ACE-Step-1.5 repository:
// POST /release_task -> task_id; POST /query_result (status 0 running, 1 succeeded, 2 failed); GET /v1/audio?path=...
export function createAceStep({ baseUrl, apiKey = '', format = 'mp3', timeoutMs = 20000, fetchImpl = fetch }) {
  const call = async (path, { method = 'GET', body } = {}) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(baseUrl + path, { method, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}) } });
      if (!res.ok) { const e = new Error(`The music server answered HTTP ${res.status}.`); e.code = 'http_' + res.status; e.retryable = res.status >= 500 || res.status === 429; throw e; }
      return res;
    } catch (e) {
      if (e.name === 'AbortError') { const er = new Error('The music server did not answer in time.'); er.code = 'timeout'; er.retryable = true; throw er; }
      if (!e.code) { const er = new Error('Could not reach the music server.'); er.code = 'unreachable'; er.retryable = true; throw er; }
      throw e;
    } finally { clearTimeout(t); }
  };
  return {
    id: 'acestep', label: 'ACE-Step 1.5 (your server)', mock: false, host: (() => { try { return new URL(baseUrl).host; } catch { return ''; } })(),
    configured: () => !!baseUrl,
    async health() { const j = await (await call('/health')).json(); return { ok: j && j.data && j.data.status === 'ok', detail: j && j.data }; },
    async submit(p) {
      const body = { prompt: p.prompt, lyrics: p.instrumental ? '[Instrumental]' : (p.lyrics || ''), thinking: true, audio_format: format, batch_size: 1, use_random_seed: true };
      if (p.bpm) body.bpm = p.bpm; if (p.duration) body.audio_duration = p.duration; if (p.key_scale) body.key_scale = p.key_scale; if (p.vocal_language) body.vocal_language = p.vocal_language;
      const j = await (await call('/release_task', { method: 'POST', body })).json();
      const id = j && j.data && j.data.task_id; if (!id) { const e = new Error('The music server did not return a task id.'); e.code = 'bad_response'; throw e; }
      return { remoteId: id, queuePosition: j.data.queue_position };
    },
    async poll(remoteId) {
      const j = await (await call('/query_result', { method: 'POST', body: { task_id_list: [remoteId] } })).json();
      const item = j && Array.isArray(j.data) ? j.data.find(x => x.task_id === remoteId) : null;
      if (!item) return { state: 'running' };
      if (item.status === 0) return { state: 'running' };
      let parsed = []; try { parsed = JSON.parse(item.result || '[]'); } catch { /* keep empty */ }
      const first = Array.isArray(parsed) ? parsed[0] : null;
      if (item.status === 2 || !first || first.status === 2) return { state: 'failed', error: (first && first.generation_info) ? String(first.generation_info).slice(0, 300) : 'The music model reported a failure.' };
      if (typeof first.file !== 'string' || !first.file.startsWith('/v1/audio')) return { state: 'failed', error: 'The music server returned an unexpected audio location.' };
      return { state: 'succeeded', audioRef: first.file, meta: first.metas || {} };
    },
    async fetchAudio(audioRef) {
      if (typeof audioRef !== 'string' || !audioRef.startsWith('/v1/audio')) throw Object.assign(new Error('Refused: audio location is not on the music server.'), { code: 'refused' });
      const res = await call(audioRef);
      return { body: res.body, contentType: res.headers.get('content-type') || 'audio/mpeg', length: res.headers.get('content-length') };
    },
  };
}
