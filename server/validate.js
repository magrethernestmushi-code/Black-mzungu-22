const clean = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
export function validateGenerate(body, { maxDurationSec = 240 } = {}) {
  const errors = [], v = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['Send a JSON object.'] };
  if (typeof body.prompt !== 'string') errors.push('prompt is required (describe the music you want).');
  else { v.prompt = clean(body.prompt); if (v.prompt.length < 5) errors.push('prompt is too short. Describe genre, mood, tempo and instruments.'); if (v.prompt.length > 1000) errors.push('prompt is too long (max 1000 characters).'); }
  v.instrumental = body.instrumental === undefined ? true : body.instrumental === true;
  if (body.lyrics !== undefined && body.lyrics !== '') { if (typeof body.lyrics !== 'string') errors.push('lyrics must be text.'); else { v.lyrics = clean(body.lyrics); if (v.lyrics.length > 6000) errors.push('lyrics are too long (max 6000 characters).'); } }
  if (body.bpm !== undefined && body.bpm !== null && body.bpm !== '') { const n = Number(body.bpm); if (!Number.isInteger(n) || n < 30 || n > 300) errors.push('bpm must be a whole number from 30 to 300.'); else v.bpm = n; }
  if (body.duration !== undefined && body.duration !== null && body.duration !== '') { const n = Number(body.duration); if (!Number.isFinite(n) || n < 10 || n > maxDurationSec) errors.push(`duration must be from 10 to ${maxDurationSec} seconds.`); else v.duration = Math.round(n); }
  if (body.key_scale) { const k = clean(body.key_scale); if (!/^[A-Ga-g][#b]?\s?(major|minor|maj|min|m)?$/i.test(k)) errors.push('key_scale looks wrong. Examples: "A minor", "C major", "F#m".'); else v.key_scale = k; }
  if (body.vocal_language) { const l = clean(body.vocal_language); if (!/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(l)) errors.push('vocal_language must be a language code such as en or sw.'); else v.vocal_language = l; }
  if (!v.instrumental && !v.lyrics) errors.push('A vocal song needs lyrics. Add lyrics or choose instrumental.');
  return errors.length ? { ok: false, errors } : { ok: true, value: v };
}
