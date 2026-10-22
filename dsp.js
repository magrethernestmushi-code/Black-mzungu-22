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
  return { ...base, silent: false, presAbsDb: band(2000, 5000), rmsDb, noiseFloorDb: floor, snrDb: rmsDb - floor, p95Db: p95, dynRangeDb, lowPct: 100 * low / tot,
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
  if (a.snrDb >= 12) { p.gate = cl(Math.round(a.noiseFloorDb + 8), -75, -35); p.gdepth = 15; p.gateOn = 1;
    notes.push(['measured', `Background between phrases is about ${a.noiseFloorDb.toFixed(0)} dB, so a noise gate is set at ${p.gate} dB, turning that down 15 dB when you are not singing. It cannot remove noise while you sing.`]); }
  else { p.gateOn = 0; notes.push(['measured', 'No clearly quiet gaps were found, so the noise gate stays off (it could cut words).']); }
  p.rev = st.rev; p.dly = st.dly;
  notes.push(['choice', `Reverb ${Math.round(p.rev * 100)}% and delay ${Math.round(p.dly * 100)}% come from the “${style}” style. This is a taste choice, not a measurement.`]);
  if (a.snrDb < 20) notes.push(['warn', `Background noise is high (about ${a.snrDb.toFixed(0)} dB above the noise floor). There is no noise reduction yet; re-record somewhere quieter if you can.`]);
  if (a.clipped) notes.push(['warn', `${a.clipped} clipped samples. Clipping can't be repaired; re-record quieter.`]);
  return { p, notes };
}
// ---- Loudness, true peak, limiter, mix advice, mastering (Stage D) ----
export function kLoudness(chs, sr) { // ITU-R BS.1770 K-weighting, 400 ms blocks, absolute + relative gating
  const Hp = Math.round(0.1 * sr), n = chs[0].length, nseg = Math.floor(n / Hp);
  if (nseg < 4) return { integrated: -Infinity, shortMax: -Infinity };
  let K = Math.tan(Math.PI * 1681.974450955533 / sr), Q = 0.7071752369554196; const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K; const s = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  K = Math.tan(Math.PI * 38.13547087602444 / sr); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K; const h1 = 2 * (K * K - 1) / a0, h2 = (1 - K / Q + K * K) / a0;
  const seg = chs.map(x => { const e = new Float64Array(nseg); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, p1 = 0, p2 = 0, o1 = 0, o2 = 0, j = 0, c = 0;
    for (let i = 0; i < nseg * Hp; i++) { const v = x[i], y = s.b0 * v + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y;
      const o = y - 2 * p1 + p2 - h1 * o1 - h2 * o2; p2 = p1; p1 = y; o2 = o1; o1 = o; e[j] += o * o; if (++c === Hp) { c = 0; j++; } } return e; });
  const win = (j, len) => { let z = 0; for (const e of seg) for (let k = 0; k < len; k++) z += e[j + k]; return z / (len * Hp); };
  const z4 = []; for (let j = 0; j + 4 <= nseg; j++) z4.push(win(j, 4));
  const L = z => -0.691 + 10 * Math.log10(z + 1e-20);
  const g1 = z4.filter(z => L(z) > -70); if (!g1.length) return { integrated: -Infinity, shortMax: -Infinity };
  const rel = L(g1.reduce((a, b) => a + b, 0) / g1.length) - 10, g2 = g1.filter(z => L(z) > rel);
  const integrated = L(g2.reduce((a, b) => a + b, 0) / g2.length);
  const sl = Math.min(30, nseg); let sm = -Infinity; for (let j = 0; j + sl <= nseg; j++) sm = Math.max(sm, L(win(j, sl)));
  return { integrated, shortMax: sm };
}
export function truePeakDb(x, sr) { // 4x oversampled peak (windowed sinc), checks only near-peak regions
  let pk = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > pk) pk = a; }
  if (pk === 0) return -Infinity;
  const T = 12, ker = [1, 2, 3].map(p => { const f = p / 4; return Array.from({ length: T }, (_, t) => { const k = t - (T / 2 - 1), d = k - f, sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d), w = 0.5 + 0.5 * Math.cos(Math.PI * d / (T / 2)); return sinc * w; }); });
  let tp = pk;
  for (let i = T / 2; i < x.length - T / 2; i++) { if (Math.max(Math.abs(x[i]), Math.abs(x[i + 1])) < 0.6 * pk) continue;
    for (let p = 0; p < 3; p++) { let v = 0; for (let t = 0; t < T; t++) v += ker[p][t] * x[i + t - (T / 2 - 1)]; if (Math.abs(v) > tp) tp = Math.abs(v); } }
  return 20 * Math.log10(tp);
}
export function limiter(chs, sr, ceilDb) { // lookahead limiter, linked channels, in place; sample peak never exceeds ceiling
  const ceil = Math.pow(10, ceilDb / 20), n = chs[0].length, L = Math.max(1, Math.round(0.003 * sr)), g = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (const c of chs) { const a = Math.abs(c[i]); if (a > m) m = a; } g[i] = m > ceil ? ceil / m : 1; }
  const gm = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0, r = 0;
  for (let i = 0; i < n; i++) { const hi = Math.min(n - 1, i + L); while (r <= hi) { while (t > h && g[dq[t - 1]] >= g[r]) t--; dq[t++] = r; r++; } while (dq[h] < i - L) h++; gm[i] = g[dq[h]]; }
  const out = new Float32Array(n); let sum = 0, lo = 0, hi2 = -1;
  for (let i = 0; i < n; i++) { const nh = Math.min(n - 1, i + L), nl = Math.max(0, i - L); while (hi2 < nh) sum += gm[++hi2]; while (lo < nl) sum -= gm[lo++]; out[i] = sum / (hi2 - lo + 1); }
  const step = 1 / (0.12 * sr); let mn = 1; for (let i = 1; i < n; i++) { if (out[i] > out[i - 1] + step) out[i] = out[i - 1] + step; if (out[i] < mn) mn = out[i]; }
  for (const c of chs) for (let i = 0; i < n; i++) c[i] *= out[i];
  return { maxGrDb: Math.max(0, -20 * Math.log10(mn)) };
}
export function stereoStats(L, R) {
  let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0;
  for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2; ll += L[i] * L[i]; rr += R[i] * R[i]; lr += L[i] * R[i]; mm += m * m; ss += s * s; }
  return { corr: lr / Math.sqrt(ll * rr + 1e-20), monoDropDb: 10 * Math.log10((mm + 1e-20) / ((ll + rr) / 2 + 1e-20)), widthDb: 10 * Math.log10((ss + 1e-20) / (mm + 1e-20)) };
}
export const TARGETS = { streaming: { lufs: -14, tp: -1 }, download: { lufs: -10, tp: -1 }, live: { lufs: -9, tp: -1 } };
export function master(chs, sr, target, maxGr = 5) {
  const before = kLoudness(chs, sr); let gdb = target.lufs - before.integrated, res = null;
  for (let it = 0; it < 12; it++) {
    const g = Math.pow(10, gdb / 20), w = chs.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * g; return o; });
    const r = limiter(w, sr, target.tp - 0.3), tp = Math.max(...w.map(c => truePeakDb(c, sr))); res = { w, gdb, r, tp };
    if (r.maxGrDb > maxGr + 0.05) { gdb -= Math.max(0.5, r.maxGrDb - maxGr); continue; }
    if (tp > target.tp + 0.05) { gdb -= Math.max(0.3, tp - target.tp); continue; }
    break;
  }
  const after = kLoudness(res.w, sr);
  return { chs: res.w, before, after, gainDb: res.gdb, maxGrDb: res.r.maxGrDb, tpDb: res.tp, reached: Math.abs(after.integrated - target.lufs) < 0.6 };
}
export const VOXREL = { natural: 1, pop: 0.5, dryrap: 3, bongo: 1 };
export function mixAdvice(m, style = 'natural') { // each item: [kind, text, optionalApply]
  const o = [], t = VOXREL[style] ?? 1, rel = m.voxLufs - m.beatLufs;
  o.push(['measured', `The vocal is ${Math.abs(rel).toFixed(1)} LU ${rel >= 0 ? 'above' : 'below'} the beat (K-weighted loudness).`]);
  const d = cl(t - rel, -8, 8);
  if (Math.abs(d) >= 1) o.push(['choice', `A common starting balance for “${style}” is about ${t > 0 ? '+' : ''}${t} LU. That is a taste guide, not a rule. Suggest vocal ${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} dB.`, { vg: +d.toFixed(1) }]);
  else o.push(['measured', 'Vocal and beat balance is close to the usual starting point for this style (a subjective guide).']);
  const gap = m.beatPres - m.voxPres;
  if (gap > -6) { const dip = +cl((gap + 6) * 0.5, 0.5, 4).toFixed(1); o.push(['measured', `The beat has strong 2–5 kHz energy (only ${Math.max(0, -gap).toFixed(1)} dB under the vocal there), which can hide the words. Suggest dipping the beat ${dip} dB at 3 kHz.`, { dip }]); }
  else o.push(['measured', 'The beat leaves room in the 2–5 kHz region where words are understood.']);
  if (m.beatLowPct > 50) o.push(['warn', `${m.beatLowPct.toFixed(0)}% of the beat's energy is below 90 Hz. Phone speakers and earphones can't play that, so the beat may sound weak there and boomy on big systems. Listen on a phone before finishing.`]);
  if (m.monoDropDb < -6) o.push(['warn', `Mono check: the mix loses ${Math.abs(m.monoDropDb).toFixed(1)} dB when summed to mono, so parts may vanish on mono speakers or phones.`]);
  else o.push(['measured', `Mono check: only ${Math.abs(m.monoDropDb).toFixed(1)} dB lost when summed to mono (good).`]);
  o.push(['measured', `Stereo width: side is ${m.widthDb.toFixed(1)} dB relative to centre; left/right correlation ${m.corr.toFixed(2)}.`]);
  if (m.tpDb > -1) o.push(['warn', `True peak is ${m.tpDb.toFixed(1)} dBTP, close to or over the safe −1 dBTP. Mastering will bring it under.`]);
  o.push(['measured', `Mix loudness ${m.mixLufs.toFixed(1)} LUFS integrated, ${m.shortMax.toFixed(1)} LUFS highest short-term.`]);
  return o;
}
// ---- Noise gate (non-destructive: applied to a copy at playback/export) ----
export function gateAudio(x, sr, thrDb, depthDb) {
  const n = x.length, y = new Float32Array(n), g = new Float32Array(n), thr = Math.pow(10, thrDb / 10), floor = Math.pow(10, -depthDb / 20);
  const ea = 1 - Math.exp(-1 / (0.001 * sr)), er = 1 - Math.exp(-1 / (0.05 * sr)), ga = 1 - Math.exp(-1 / (0.003 * sr)), gr = 1 - Math.exp(-1 / (0.1 * sr)), look = Math.round(0.006 * sr);
  let e = 0, gg = floor;
  for (let i = 0; i < n; i++) { const p = x[i] * x[i]; e += (p - e) * (p > e ? ea : er); const t = e > thr ? 1 : floor; gg += (t - gg) * (t > gg ? ga : gr); g[i] = gg; }
  for (let i = 0; i < n; i++) y[i] = x[i] * g[Math.min(n - 1, i + look)];
  return y;
}
// ---- Pitch detection and correction (experimental) ----
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
export function snapMidi(m, key, scale) {
  const deg = SCALES[scale] || SCALES.major; let best = m, bd = 1e9; const base = Math.round(m);
  for (let n = base - 7; n <= base + 7; n++) { const pc = (((n - key) % 12) + 12) % 12; if (deg.includes(pc)) { const d = Math.abs(n - m); if (d < bd) { bd = d; best = n; } } }
  return best;
}
export function detectPitch(x, sr, hop = 512) { // YIN on a 4x decimated copy. f0[i] = 0 when unvoiced. Frame i is centred at i*hop + 0.02*sr
  const D = 4, ns = Math.floor(x.length / D), xs = new Float32Array(ns); for (let i = 0; i < ns; i++) xs[i] = (x[D * i] + x[D * i + 1] + x[D * i + 2] + x[D * i + 3]) / 4;
  const fs = sr / D, W = Math.round(0.04 * fs), tmin = Math.max(2, Math.floor(fs / 800)), tmax = Math.floor(fs / 70), nF = Math.max(0, Math.floor((x.length - 0.04 * sr) / hop)), f0 = new Float32Array(nF), d = new Float64Array(tmax + 2), c = new Float64Array(tmax + 2);
  for (let f = 0; f < nF; f++) { const p = Math.round(f * hop / D); if (p + W + tmax + 1 >= ns) break; let e = 0; for (let j = 0; j < W; j++) e += xs[p + j] * xs[p + j]; if (Math.sqrt(e / W) < 0.004) continue;
    for (let t = 1; t <= tmax; t++) { let s = 0; for (let j = 0; j < W; j++) { const q = xs[p + j] - xs[p + j + t]; s += q * q; } d[t] = s; }
    let run = 0; c[0] = 1; for (let t = 1; t <= tmax; t++) { run += d[t]; c[t] = run > 0 ? d[t] * t / run : 1; }
    let tau = -1; for (let t = tmin; t < tmax; t++) { if (c[t] < 0.15) { while (t + 1 < tmax && c[t + 1] < c[t]) t++; tau = t; break; } }
    if (tau < 0) continue; const a = c[tau - 1], b = c[tau], g = c[tau + 1], den = a - 2 * b + g, tt = den !== 0 ? tau + 0.5 * (a - g) / den : tau; f0[f] = fs / tt; }
  return { f0, hop, centre: Math.round(0.02 * sr) };
}
export function pitchCorrect(x, sr, o) { // TD-PSOLA on voiced runs; unvoiced audio is left untouched
  const { key = 0, scale = 'major', strength = 1 } = o, { f0, hop, centre } = detectPitch(x, sr), nF = f0.length, n = x.length, out = Float32Array.from(x), ratio = new Float32Array(nF).fill(1);
  for (let i = 0; i < nF; i++) if (f0[i] > 0) { const m = 69 + 12 * Math.log2(f0[i] / 440); ratio[i] = Math.pow(2, ((snapMidi(m, key, scale) - m) * strength) / 12); }
  let prev = 1; for (let i = 0; i < nF; i++) { if (f0[i] > 0) { prev = ratio[i] = prev + (ratio[i] - prev) * 0.6; } else prev = 1; }
  const idx = t => Math.max(0, Math.min(nF - 1, Math.round((t - centre) / hop))), fade = Math.round(0.005 * sr);
  let i = 0;
  while (i < nF) {
    if (!(f0[i] > 0)) { i++; continue; } let j = i; while (j + 1 < nF && f0[j + 1] > 0) j++;
    if (j - i + 1 >= 4) { const s = Math.max(0, centre + i * hop - hop / 2 | 0), e = Math.min(n, centre + j * hop + hop / 2 | 0), T0 = t => sr / f0[idx(t)];
      let m = s, bv = -1; const T = T0(s); for (let k = s; k < Math.min(e, s + T); k++) if (x[k] > bv) { bv = x[k]; m = k; }
      const marks = [m]; for (;;) { const Tm = T0(m), nx = m + Tm; if (nx + Tm / 4 >= e) break; let mm = Math.round(nx), best = -1e9; for (let k = Math.round(nx - 0.2 * Tm); k <= Math.round(nx + 0.2 * Tm); k++) if (k < n && x[k] > best) { best = x[k]; mm = k; } if (mm <= m) break; marks.push(mm); m = mm; }
      const len = e - s, acc = new Float32Array(len), ws = new Float32Array(len); let ts = marks[0], k = 0;
      while (ts < e) { while (k + 1 < marks.length && Math.abs(marks[k + 1] - ts) < Math.abs(marks[k] - ts)) k++; const mk = marks[k], L = Math.round(T0(mk));
        for (let q = -L; q <= L; q++) { const src = mk + q, dst = Math.round(ts) + q - s; if (src < 0 || src >= n || dst < 0 || dst >= len) continue; const w = 0.5 + 0.5 * Math.cos(Math.PI * q / L); acc[dst] += x[src] * w; ws[dst] += w; }
        ts += T0(mk) / ratio[idx(mk)]; }
      for (let q = 0; q < len; q++) { if (ws[q] < 0.3) continue; const wg = Math.min(1, q / fade, (len - 1 - q) / fade); out[s + q] = x[s + q] * (1 - wg) + (acc[q] / ws[q]) * wg; } }
    i = j + 1;
  }
  return out;
}
// ---- Presets (starting points, not promises) ----
export const PRESETS = {
  'Bongo Flava': { hpf: 90, mud: 1.5, pres: 2, air: 2, sib: 2, thr: -24, ratio: 3, mk: 3, rev: 0.14, dly: 0.10 },
  'Afrobeats': { hpf: 90, mud: 1, pres: 1.5, air: 2, sib: 2, thr: -22, ratio: 3, mk: 3, rev: 0.12, dly: 0.12 },
  'Amapiano': { hpf: 100, mud: 2, pres: 1, air: 2.5, sib: 2, thr: -24, ratio: 3, mk: 3, rev: 0.16, dly: 0.10 },
  'Melodic rap': { hpf: 95, mud: 2, pres: 1.5, air: 1.5, sib: 3, thr: -26, ratio: 4, mk: 4, rev: 0.12, dly: 0.14 },
  'Dry rap': { hpf: 100, mud: 2.5, pres: 2, air: 0.5, sib: 3, thr: -28, ratio: 4, mk: 5, rev: 0.02, dly: 0 },
  'R&B': { hpf: 85, mud: 1, pres: 1, air: 3, sib: 2.5, thr: -24, ratio: 3, mk: 3, rev: 0.18, dly: 0.08 },
  'Gospel': { hpf: 80, mud: 0.5, pres: 1, air: 2, sib: 1.5, thr: -22, ratio: 2.5, mk: 2, rev: 0.22, dly: 0.06 },
  'Clean pop': { hpf: 90, mud: 1.5, pres: 1.5, air: 2.5, sib: 3, thr: -25, ratio: 3.5, mk: 4, rev: 0.14, dly: 0.08 },
  'Aggressive': { hpf: 110, mud: 2.5, pres: 3, air: 1, sib: 2, thr: -30, ratio: 6, mk: 6, rev: 0.04, dly: 0.04 },
  'Natural': { hpf: 80, mud: 0, pres: 0, air: 1, sib: 0, thr: -20, ratio: 2, mk: 1, rev: 0.05, dly: 0 },
};
// ---- Project backup container: 'BMS1' + json length + json + binary blobs ----
export function packProject(meta, blobs) {
  const json = new TextEncoder().encode(JSON.stringify({ ...meta, sizes: blobs.map(b => b.byteLength) })), out = new Uint8Array(8 + json.length + blobs.reduce((a, b) => a + b.byteLength, 0)), dv = new DataView(out.buffer);
  out.set([66, 77, 83, 49]); dv.setUint32(4, json.length, true); out.set(json, 8); let o = 8 + json.length; for (const b of blobs) { out.set(new Uint8Array(b), o); o += b.byteLength; } return out.buffer;
}
export function unpackProject(ab) {
  if (ab.byteLength < 8) return null; const dv = new DataView(ab); if (dv.getUint32(0, false) !== 0x424d5331) return null;
  try { const jl = dv.getUint32(4, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, jl))); let o = 8 + jl; const blobs = meta.sizes.map(s => { const b = ab.slice(o, o + s); o += s; return b; }); return o === ab.byteLength ? { meta, blobs } : null; } catch { return null; }
}
