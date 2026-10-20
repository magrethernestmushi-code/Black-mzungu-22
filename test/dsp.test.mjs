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
