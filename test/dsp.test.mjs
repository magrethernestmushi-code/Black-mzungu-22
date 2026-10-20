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
