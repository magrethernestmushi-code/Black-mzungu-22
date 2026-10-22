import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, wavEncode, validateWav } from '../dsp.js';
const sr = 44100;
const sine = (amp, n = sr) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * 440 * i / sr));
test('WAV header and length are correct', () => {
  const ab = wavEncode([sine(0.5), sine(0.5)], sr);
  const v = validateWav(ab);
  assert.deepEqual([v.ok, v.ch, v.sr, v.bits, v.frames], [true, 2, sr, 16, sr]);
});
test('encoded audio round-trips at the right level', () => {
  const ab = wavEncode([sine(0.5)], sr);
  const dv = new DataView(ab);
  let pk = 0;
  for (let i = 0; i < sr; i++) pk = Math.max(pk, Math.abs(dv.getInt16(44 + i * 2, true)) / 32768);
  assert.ok(Math.abs(pk - 0.5) < 0.002);
});
test('silence is detected, sine is not', () => {
  assert.equal(analyse(new Float32Array(1000)).silent, true);
  assert.equal(analyse(sine(0.5)).silent, false);
});
test('clipping is counted and encoder clamps', () => {
  const x = sine(1.5);
  assert.ok(analyse(x).clipped > 0);
  const dv = new DataView(wavEncode([x], sr));
  for (let i = 0; i < sr; i++) { const s = dv.getInt16(44 + i * 2, true); assert.ok(s >= -32768 && s <= 32767); }
});
test('peak dB is right for amplitude 0.5', () => {
  assert.ok(Math.abs(analyse(sine(0.5)).peakDb - -6.02) < 0.05);
});
test('invalid data is rejected', () => assert.equal(validateWav(new ArrayBuffer(10)).ok, false));
import { splitClip, trimStart, trimEnd, moveClip, clipEnd } from '../dsp.js';
const near = (a, b) => Math.abs(a - b) < 1e-9;
const clip = { id: 1, takeId: 1, name: 'T', start: 2, off: 0.1, dur: 4, mute: false };
test('split keeps audio continuous and in sync', () => {
  const [a, b] = splitClip(clip, 3.5, 2);
  assert.ok(near(a.dur + b.dur, clip.dur));
  assert.ok(near(clipEnd(a), b.start));
  assert.ok(near(a.off + a.dur, b.off));            // source position at the cut matches
  assert.ok(near(clipEnd(b), clipEnd(clip)));
});
test('trimStart keeps the end and the source alignment', () => {
  const n = trimStart(clip, 3);
  assert.ok(near(clipEnd(n), clipEnd(clip)));
  assert.ok(near(n.off + n.dur, clip.off + clip.dur));
  assert.ok(near(n.off - clip.off, n.start - clip.start));
});
test('trimEnd shortens only the end', () => {
  const n = trimEnd(clip, 5);
  assert.ok(near(n.start, clip.start) && near(n.off, clip.off) && near(n.dur, 3));
});
test('move shifts start, clamps at zero, never changes source offset', () => {
  assert.ok(near(moveClip(clip, 0.5).start, 2.5));
  assert.equal(moveClip(clip, -10).start, 0);
  assert.equal(moveClip(clip, 1).off, clip.off);
});
test('out-of-range edits are refused', () => {
  assert.equal(splitClip(clip, 1, 2), null); assert.equal(splitClip(clip, 7, 2), null);
  assert.equal(trimStart(clip, 7), null); assert.equal(trimEnd(clip, 1), null);
});
import { fft, analyseVocal, decide } from '../dsp.js';
const mix = (freqs, amp, n = sr * 2) => Float32Array.from({ length: n }, (_, i) => freqs.reduce((s, f) => s + amp * Math.sin(2 * Math.PI * f * i / sr), 0));
test('FFT puts a sine in the right bin', () => {
  const N = 1024, re = new Float64Array(N), im = new Float64Array(N), bin = 50;
  for (let i = 0; i < N; i++) re[i] = Math.sin(2 * Math.PI * bin * i / N);
  fft(re, im); let best = 0; for (let k = 1; k < N / 2; k++) if (re[k] ** 2 + im[k] ** 2 > re[best] ** 2 + im[best] ** 2) best = k;
  assert.equal(best, bin);
});
test('silent input is flagged, not analysed', () => assert.equal(analyseVocal(new Float32Array(sr), sr).silent, true));
test('rumble raises high-pass frequency', () => {
  const clean = analyseVocal(mix([220, 1000, 2000], 0.1), sr), rumble = analyseVocal(mix([50, 220, 1000], 0.25), sr);
  assert.ok(rumble.lowPct > clean.lowPct + 20);
  assert.ok(decide(rumble).p.hpf > decide(clean).p.hpf);
});
test('sibilant content is measured and gets a bigger cut', () => {
  const clean = analyseVocal(mix([220, 1000, 2500], 0.15), sr), sib = analyseVocal(mix([220, 1000, 2500, 6500, 7500, 8500], 0.15), sr);
  assert.ok(sib.sibDb > clean.sibDb + 10);
  assert.ok(decide(sib).p.sib > decide(clean).p.sib);
});
test('decided settings stay inside safe ranges and styles differ', () => {
  const a = analyseVocal(mix([100, 300, 1000, 6000], 0.2), sr);
  for (const s of ['natural', 'pop', 'dryrap', 'bongo']) { const { p } = decide(a, s); assert.ok(p.hpf >= 80 && p.hpf <= 110 && p.mud >= 0 && p.mud <= 5 && p.sib >= 0 && p.sib <= 6 && p.mk >= 0 && p.mk <= 8 && p.thr >= -40 && p.thr <= -12); }
  assert.ok(decide(a, 'bongo').p.rev > decide(a, 'dryrap').p.rev);
});
import { kLoudness, truePeakDb, limiter, master, TARGETS, stereoStats, mixAdvice } from '../dsp.js';
const tone = (f, a, secs, ph = 0) => Float32Array.from({ length: Math.round(sr * secs) }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr + ph));
test('LUFS: 1 kHz stereo sine at -20 dBFS reads about -20 LUFS', () => {
  const x = tone(1000, 0.1, 10), l = kLoudness([x, x], sr);
  assert.ok(Math.abs(l.integrated - -20) < 0.25, String(l.integrated));
});
test('LUFS rises 6 dB when level doubles; silence is -Infinity', () => {
  const a = kLoudness([tone(1000, 0.1, 6), tone(1000, 0.1, 6)], sr).integrated, b = kLoudness([tone(1000, 0.2, 6), tone(1000, 0.2, 6)], sr).integrated;
  assert.ok(Math.abs(b - a - 6.02) < 0.1);
  assert.equal(kLoudness([new Float32Array(sr * 3), new Float32Array(sr * 3)], sr).integrated, -Infinity);
});
test('true peak catches an inter-sample peak the sample peak misses', () => {
  const x = tone(sr / 4, 1, 1, Math.PI / 4), sp = 20 * Math.log10(Math.max(...x.map(Math.abs)));
  assert.ok(sp < -2.9 && truePeakDb(x, sr) > -0.6);
});
test('limiter holds the ceiling on spikes and leaves quiet audio untouched', () => {
  const x = tone(220, 0.3, 2); x[30000] = 1.8; x[30001] = -1.7; const c = 10 ** (-1 / 20), r = limiter([x], sr, -1);
  assert.ok(Math.max(...x.map(Math.abs)) <= c + 1e-6);
  const q = tone(220, 0.2, 1), q0 = Float32Array.from(q), r2 = limiter([q], sr, -1);
  assert.equal(r2.maxGrDb, 0); assert.deepEqual(q, q0);
});
test('master reaches target, respects true-peak ceiling and limiter depth', () => {
  const mk = a => [0, 1].map(c => Float32Array.from({ length: sr * 12 }, (_, i) => a * (Math.sin(2 * Math.PI * 110 * i / sr) + 0.5 * Math.sin(2 * Math.PI * 1500 * i / sr + c)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * i / sr))));
  for (const a of [0.05, 0.4]) { const r = master(mk(a), sr, TARGETS.streaming);
    assert.ok(r.tpDb <= -1 + 0.06, 'tp ' + r.tpDb); assert.ok(r.maxGrDb <= 5.1, 'gr ' + r.maxGrDb); assert.ok(Math.abs(r.after.integrated - -14) < 1, 'lufs ' + r.after.integrated); }
});
test('stereo stats: identical channels are mono-safe, opposite channels are not', () => {
  const x = tone(300, 0.3, 1), n = Float32Array.from(x, v => -v);
  assert.ok(stereoStats(x, x).monoDropDb > -0.1); assert.ok(stereoStats(x, n).monoDropDb < -40);
});
test('mix advice flags masking and suggests vocal gain', () => {
  const base = { beatLufs: -14, voxLufs: -20, beatPres: -50, voxPres: -48, beatLowPct: 60, monoDropDb: -1, corr: 0.9, widthDb: -12, tpDb: -3, mixLufs: -13, shortMax: -11 };
  const a = mixAdvice(base, 'natural'), has = f => a.some(i => i[2] && f(i[2]));
  assert.ok(has(x => x.vg > 0) && has(x => x.dip > 0) && a.some(i => i[0] === 'warn'));
});
import { gateAudio } from '../dsp.js';
test('gate lowers background between phrases but keeps the singing and its onset', () => {
  const noise = n => Float32Array.from({ length: n }, (_, i) => 0.001 * (Math.sin(2 * Math.PI * 3000 * i / sr) + Math.sin(2 * Math.PI * 5000 * i / sr)));
  const a = noise(sr), b = tone(300, 0.3, 0.5), c = noise(sr), x = new Float32Array(a.length + b.length + c.length); x.set(a); x.set(b, a.length); x.set(c, a.length + b.length);
  const y = gateAudio(x, sr, -48, 15), rms = (v, s, e) => Math.sqrt(v.subarray(s, e).reduce((t, q) => t + q * q, 0) / (e - s));
  const quiet = 20 * Math.log10(rms(y, 5000, sr - 5000) / rms(x, 5000, sr - 5000));
  assert.ok(quiet < -12, 'noise change ' + quiet);
  const mid = 20 * Math.log10(rms(y, sr + 5000, sr + 20000) / rms(x, sr + 5000, sr + 20000));
  assert.ok(Math.abs(mid) < 0.5, 'mid ' + mid);
  const on = Math.max(...y.subarray(sr, sr + 130).map(Math.abs)) / Math.max(...x.subarray(sr, sr + 130).map(Math.abs));
  assert.ok(on > 0.6, 'onset ' + on);
});
import { detectPitch, pitchCorrect, snapMidi, packProject, unpackProject, PRESETS } from '../dsp.js';
import { renderBeat, GENRES } from '../beat.js';
const medCents = (x, hz) => { const { f0 } = detectPitch(x, sr), v = [...f0].filter(f => f > 0).sort((a, b) => a - b); return v.length ? 1200 * Math.log2(v[Math.floor(v.length / 2)] / hz) : NaN; };
const rmsOf = v => Math.sqrt(v.reduce((t, q) => t + q * q, 0) / v.length);
test('pitch detector finds 220 Hz within 1%', () => assert.ok(Math.abs(medCents(mix([220, 440, 660], 0.1, sr * 1), 220)) < 17));
test('snap to scale: A is in C major, A# snaps to a neighbour', () => { assert.equal(snapMidi(69.2, 0, 'major'), 69); assert.ok([69, 71].includes(snapMidi(70, 0, 'major'))); });
test('pitch correction moves a flat note onto the scale note', () => {
  const x = tone(430, 0.3, 2), y = pitchCorrect(x, sr, { key: 0, scale: 'major', strength: 1 }), mid = a => a.subarray(sr * 0.4, sr * 1.6);
  const before = medCents(mid(x), 440), after = medCents(mid(y), 440);
  assert.ok(Math.abs(after) < 12 && Math.abs(after) < Math.abs(before) - 10, `before ${before.toFixed(1)} after ${after.toFixed(1)}`);
  const lv = 20 * Math.log10(rmsOf(mid(y)) / rmsOf(mid(x))); assert.ok(Math.abs(lv) < 3, 'level ' + lv);
});
test('pitch correction leaves an in-tune note and quiet gaps alone', () => {
  const x = tone(440, 0.3, 2), y = pitchCorrect(x, sr, { key: 0, scale: 'major', strength: 1 }); assert.ok(Math.abs(medCents(y.subarray(sr * 0.4, sr * 1.6), 440)) < 8);
  const q = new Float32Array(sr), z = pitchCorrect(q, sr, { key: 0, scale: 'major', strength: 1 }); assert.deepEqual(z, q);
});
test('project backup round-trips exactly and rejects junk', () => {
  const a = new Float32Array([1, 2, 3]).buffer, b = new Uint8Array([9, 8, 7, 6, 5]).buffer, p = unpackProject(packProject({ name: 'x', n: 2 }, [a, b]));
  assert.equal(p.meta.name, 'x'); assert.deepEqual([...new Float32Array(p.blobs[0])], [1, 2, 3]); assert.deepEqual([...new Uint8Array(p.blobs[1])], [9, 8, 7, 6, 5]);
  assert.equal(unpackProject(new ArrayBuffer(20)), null);
});
test('all 10 presets exist and stay in range', () => { assert.equal(Object.keys(PRESETS).length, 10); for (const p of Object.values(PRESETS)) assert.ok(p.hpf >= 40 && p.hpf <= 200 && p.ratio >= 1 && p.rev >= 0 && p.rev <= 0.5); });
test('beat maker: exact length, sound lands on the beat, not clipped, repeatable', () => {
  const g = GENRES.afrobeats, a = renderBeat({ pattern: g.p, bpm: 100, bars: 2, sr }), b = renderBeat({ pattern: g.p, bpm: 100, bars: 2, sr });
  assert.equal(a.L.length, Math.round(2 * 16 * (60 / 100 / 4) * sr));
  assert.ok(rmsOf(a.L.subarray(0, sr * 0.05)) > 0.05, 'kick at 0');
  { let pk = 0; for (const v of a.L) pk = Math.max(pk, Math.abs(v)); assert.ok(pk <= 0.9); }
  assert.deepEqual(a.L, b.L);
  const s = renderBeat({ pattern: g.p, bpm: 100, song: true, sr }); assert.ok(Math.abs(s.dur - 20 * 16 * 0.15) < 0.01, 'song ' + s.dur);
});
