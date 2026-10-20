// Pure audio utilities (no browser APIs) so they can be unit-tested in Node.
const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
export function analyse(x) {
  let pk = 0, sum = 0, clip = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > pk) pk = a;
    sum += x[i] * x[i];
    if (a >= 0.999) clip++;
  }
  const rms = Math.sqrt(sum / (x.length || 1));
  return { peak: pk, peakDb: db(pk), rmsDb: db(rms), clipped: clip, silent: pk < 1e-4 };
}
export function wavEncode(chs, sr) {
  const ch = chs.length, n = chs[0].length;
  const dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, chs[c][i]));
    dv.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true); o += 2;
  }
  return dv.buffer;
}
export function validateWav(ab) {
  const dv = new DataView(ab);
  const tag = o => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (ab.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { ok: false };
  let o = 12, ch = 0, sr = 0, bits = 0, frames = 0;
  while (o + 8 <= ab.byteLength) {
    const id = tag(o), size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(o + 10, true); sr = dv.getUint32(o + 12, true); bits = dv.getUint16(o + 22, true); }
    if (id === 'data') { frames = size / (ch * (bits / 8)); break; }
    o += 8 + size;
  }
  return { ok: ch > 0 && frames > 0, ch, sr, bits, frames };
}
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// ---- Clip editing (timeline seconds). clip = {id,takeId,name,start,off,dur,mute} ----
export const clipEnd = c => c.start + c.dur;
export function splitClip(c, t, newId) {
  if (t <= c.start + 0.01 || t >= clipEnd(c) - 0.01) return null;
  const a = { ...c, dur: t - c.start };
  const b = { ...c, id: newId, name: c.name + ' B', start: t, off: c.off + (t - c.start), dur: clipEnd(c) - t };
  return [a, b];
}
export function trimStart(c, t) {
  if (t <= c.start || t >= clipEnd(c) - 0.01) return null;
  const d = t - c.start;
  return { ...c, start: t, off: c.off + d, dur: c.dur - d };
}
export function trimEnd(c, t) {
  if (t <= c.start + 0.01 || t >= clipEnd(c)) return null;
  return { ...c, dur: t - c.start };
}
export const moveClip = (c, dt) => ({ ...c, start: Math.max(0, c.start + dt) });
// ---- Vocal analysis + automatic settings (Stage C) ----
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
export function analyseVocal(x, sr) {
  const base = analyse(x), N = 2048, H = 1024, frames = [];
  for (let s = 0; s + N <= x.length; s += H) { let e = 0; for (let i = 0; i < N; i++) e += x[s + i] * x[s + i]; frames.push({ s, db: 10 * Math.log10(e / N + 1e-12) }); }
  if (!frames.length || base.silent) return { ...base, silent: true };
  const sorted = frames.map(f => f.db).sort((a, b) => a - b), pct = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const floor = pct(0.1), p95 = pct(0.95), gate = Math.min(Math.max(floor + 10, p95 - 35), p95 - 0.5), act = frames.filter(f => f.db >= gate);
  if (!act.length) return { ...base, silent: true };
  const aDb = act.map(f => f.db).sort((a, b) => a - b), rmsDb = 10 * Math.log10(aDb.reduce((s, d) => s + Math.pow(10, d / 10), 0) / aDb.length);
  const dynRangeDb = aDb[Math.min(aDb.length - 1, Math.floor(0.95 * aDb.length))] - aDb[Math.floor(0.2 * aDb.length)];
  const step = Math.max(1, Math.floor(act.length / 300)), P = new Float64Array(N / 2), win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  let used = 0;
  for (let a = 0; a < act.length; a += step) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[act[a].s + i] * win[i]; fft(re, im); for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; used++; }
  const hz = sr / N, band = (f1, f2) => { const k1 = Math.max(1, Math.floor(f1 / hz)), k2 = Math.min(N / 2 - 1, Math.max(k1, Math.floor(f2 / hz))); let s = 0; for (let k = k1; k <= k2; k++) s += P[k]; return 10 * Math.log10(s / (k2 - k1 + 1) / used + 1e-20); };
  let tot = 0, low = 0; for (let k = 1; k < N / 2; k++) { tot += P[k]; if (k * hz < 90) low += P[k]; }
  return { ...base, silent: false, rmsDb, noiseFloorDb: floor, snrDb: rmsDb - floor, p95Db: p95, dynRangeDb, lowPct: 100 * low / tot,
    mudDb: band(200, 500) - band(1000, 4000), harshDb: band(2000, 5000) - band(500, 2000), sibDb: band(5000, 9000) - band(1000, 4000) };
}
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
export const STYLES = { natural: { rev: 0.06, dly: 0 }, pop: { rev: 0.14, dly: 0.08 }, dryrap: { rev: 0.02, dly: 0 }, bongo: { rev: 0.16, dly: 0.12 } };
// Thresholds are starting heuristics, to be tuned by ear on real vocals.
export function decide(a, style = 'natural') {
  const st = STYLES[style] || STYLES.natural, notes = [], p = {};
  p.hpf = a.lowPct > 15 ? 110 : a.lowPct > 6 ? 95 : 80;
  notes.push(['measured', `${a.lowPct.toFixed(1)}% of the vocal energy is below 90 Hz, so high-pass set to ${p.hpf} Hz.`]);
  p.mud = +cl((a.mudDb - 8) * 0.4, 0, 5).toFixed(1);
  notes.push(['measured', p.mud ? `Low-mids (200–500 Hz) are strong compared with the mids, so cut ${p.mud} dB at 300 Hz.` : 'Low-mids look balanced, so no mud cut.']);
  p.pres = a.harshDb > -6 ? -cl((a.harshDb + 6) * 0.5, 0, 3) : a.harshDb < -14 ? cl((-14 - a.harshDb) * 0.3, 0, 3) : 0; p.pres = +p.pres.toFixed(1);
  notes.push(['measured', p.pres < 0 ? `2–5 kHz is harsh, so ${p.pres} dB at 3 kHz.` : p.pres > 0 ? `Voice sounds dull in 2–5 kHz, so +${p.pres} dB presence.` : 'Presence region looks balanced.']);
  p.sib = +cl((a.sibDb + 10) * 0.5, 0, 6).toFixed(1); p.air = p.sib > 0 ? 0 : 1.5;
  notes.push(['measured', p.sib ? `Strong 5–9 kHz energy (possible “S” sounds): static cut of ${p.sib} dB at 7 kHz. This is a fixed cut, not a true de-esser.` : 'No excess 5–9 kHz found.']);
  p.ratio = a.dynRangeDb > 20 ? 4 : a.dynRangeDb > 14 ? 3 : 2; p.thr = cl(Math.round(a.rmsDb + 1), -40, -12);
  const gr = Math.max(0, a.p95Db - p.thr) * (1 - 1 / p.ratio); p.mk = +cl(gr * 0.5, 0, 8).toFixed(1);
  notes.push(['measured', `Dynamic range is ${a.dynRangeDb.toFixed(0)} dB, so compression ${p.ratio}:1 from ${p.thr} dB, makeup +${p.mk} dB.`]);
  p.rev = st.rev; p.dly = st.dly;
  notes.push(['choice', `Reverb ${Math.round(p.rev * 100)}% and delay ${Math.round(p.dly * 100)}% come from the “${style}” style. This is a taste choice, not a measurement.`]);
  if (a.snrDb < 20) notes.push(['warn', `Background noise is high (about ${a.snrDb.toFixed(0)} dB above the noise floor). There is no noise reduction yet; re-record somewhere quieter if you can.`]);
  if (a.clipped) notes.push(['warn', `${a.clipped} clipped samples. Clipping can't be repaired; re-record quieter.`]);
  return { p, notes };
}
