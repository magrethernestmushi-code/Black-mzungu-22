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
