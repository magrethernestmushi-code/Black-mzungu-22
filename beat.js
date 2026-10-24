// Algorithmic beat maker (synthesised sounds, no samples, no generative AI).
export const ROWS = ['Kick', 'Snare', 'Clap', 'Hat', 'Perc', 'Bass', 'Guitar', 'Keys'];
export const GROUPS = { beat: ['Kick', 'Snare', 'Clap', 'Hat', 'Perc'], guitar: ['Guitar'], keys: ['Keys'], bass808: ['Bass'] };
export const GENRES = {
  afrornb: { bpm: 98, swing: 0.12, p: { Kick: 'x.....x...x.....', Snare: '....x.......x...', Clap: '................', Hat: '..x...x...x...x.', Perc: '..x..x..x..x..x.', Bass: 'x.....x...x.....', Guitar: 'x.x.x.x.x.x.x.x.', Keys: 'x.......x.......' } },
  amapianolog: { bpm: 112, swing: 0.08, p: { Kick: 'x...x...x...x...', Snare: '................', Clap: '....x.......x...', Hat: '..x...x...x...x.', Perc: 'x..x..x...x..x..', Bass: 'x..x..x...x..x..', Guitar: '................', Keys: 'x.......x.......' } },
  trapguitar: { bpm: 140, swing: 0, p: { Kick: 'x.....x...x..x..', Snare: '........x.......', Clap: '........x.......', Hat: 'x.x.x.x.xxx.x.xx', Perc: '................', Bass: 'x.....x...x..x..', Guitar: 'x...x...x.x.x...', Keys: '................' } },
  singeli: { bpm: 160, swing: 0.05, p: { Kick: 'x..x..x.x..x..x.', Snare: '....x.......x...', Clap: '................', Hat: 'xxxxxxxxxxxxxxxx', Perc: 'x.x.x.x.x.x.x.x.', Bass: 'x..x..x.x..x..x.', Guitar: '................', Keys: 'x.x...x.x.x...x.' } },
  afrobeats: { bpm: 102, swing: 0.12, p: { Kick: 'x..x..x.x..x....', Snare: '....x.......x...', Clap: '....x.......x...', Hat: 'x.x.x.x.x.x.x.x.', Perc: '..x..x..x..x..x.', Bass: 'x..x..x.x..x....', Keys: 'x.....x.....x...' } },
  amapiano: { bpm: 112, swing: 0.08, p: { Kick: 'x...x...x...x...', Snare: '................', Clap: '....x.......x...', Hat: '..x...x...x...x.', Perc: 'x..x..x...x..x..', Bass: 'x..x..x...x..x..', Keys: 'x.......x.......' } },
  bongoflava: { bpm: 95, swing: 0.10, p: { Kick: 'x.....x...x.....', Snare: '....x.......x...', Clap: '....x.......x...', Hat: 'x.x.x.x.x.x.x.x.', Perc: '.x..x..x.x..x...', Bass: 'x.....x...x.....', Guitar: 'x.x...x.x.x...x.', Keys: 'x...........x...' } },
  melodicrap: { bpm: 140, swing: 0, p: { Kick: 'x.....x...x..x..', Snare: '........x.......', Clap: '........x.......', Hat: 'x.x.x.x.x.x.x.xx', Perc: '................', Bass: 'x.....x...x.....', Keys: 'x.......x.......' } },
  rnb: { bpm: 80, swing: 0.15, p: { Kick: 'x.......x..x....', Snare: '....x.......x...', Clap: '................', Hat: 'x.x.x.x.x.x.x.x.', Perc: '................', Bass: 'x.......x.......', Keys: 'x.......x.......' } },
};
const SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] }, PROG = { major: [0, 5, 3, 4], minor: [0, 5, 2, 6] };
export const SONG = [['Intro', 2, ['Hat', 'Keys']], ['Verse', 4, ['Kick', 'Snare', 'Hat', 'Perc', 'Bass']], ['Chorus', 4, ROWS], ['Verse', 4, ['Kick', 'Snare', 'Hat', 'Perc', 'Bass']], ['Chorus', 4, ROWS], ['Outro', 2, ['Hat', 'Keys']]];
export function renderBeat({ pattern, bpm, swing = 0, key = 0, scale = 'major', bars = 4, song = false, sr = 44100, rows: allowed = ROWS }) {
  const step = 60 / bpm / 4, plan = (song ? SONG : [['Loop', bars, ROWS]]).map(([n, nb, r]) => [n, nb, r.filter(x => allowed.includes(x))]), totalBars = plan.reduce((a, s) => a + s[1], 0), n = Math.round(totalBars * 16 * step * sr), L = new Float32Array(n), R = new Float32Array(n);
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1;
  const add = (t, v, pl = 0.5) => { const i = Math.round(t * sr); if (i >= 0 && i < n) { L[i] += v * (1 - pl) * 1.4; R[i] += v * pl * 1.4; } };
  const voice = (t0, dur, fn, pan = 0.5) => { for (let k = 0, m = Math.min(Math.round(dur * sr), n - Math.round(t0 * sr)); k < m; k++) add(t0 + k / sr, fn(k / sr), pan); };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12), sc = SC[scale] || SC.major, prog = PROG[scale] || PROG.major;
  let bar0 = 0, gi = 0;
  for (const [, nb, rows] of plan) {
    for (let b = 0; b < nb; b++) { const bar = bar0 + b, deg = prog[bar % 4];
      for (let s = 0; s < 16; s++) { if (s === 0) gi = 0; const t = (bar * 16 + s) * step + (s % 2 ? swing * step : 0);
        for (const r of rows) { if ((pattern[r] || '')[s] !== 'x') continue;
          if (r === 'Kick') { let ph = 0; voice(t, 0.4, u => { ph += 2 * Math.PI * (45 + 80 * Math.exp(-u * 30)) / sr; return 0.9 * Math.sin(ph) * Math.exp(-u * 9); }); }
          else if (r === 'Snare') voice(t, 0.2, u => 0.35 * rnd() * Math.exp(-u * 22) + 0.35 * Math.sin(2 * Math.PI * 190 * u) * Math.exp(-u * 25));
          else if (r === 'Clap') voice(t, 0.25, u => 0.4 * rnd() * (Math.exp(-u * 18) + 0.7 * Math.exp(-((u - 0.012) ** 2) * 9000) + 0.5 * Math.exp(-((u - 0.024) ** 2) * 9000)), 0.55);
          else if (r === 'Hat') { let p = 0; voice(t, 0.06, u => { const v = rnd(), o = v - p; p = v; return 0.18 * o * Math.exp(-u * 70); }, 0.62); }
          else if (r === 'Perc') { let ph = 0; voice(t, 0.3, u => { ph += 2 * Math.PI * (70 + 90 * Math.exp(-u * 14)) / sr; return 0.5 * Math.sin(ph) * Math.exp(-u * 8); }, 0.4); }
          else if (r === 'Bass') { const f = hz(36 + key + sc[deg]); let ph = 0; voice(t, step * 6, u => { const fr = f * (1 + 1.2 * Math.exp(-u * 60)); ph += 2 * Math.PI * fr / sr; return 0.55 * Math.tanh(2.2 * Math.sin(ph)) * Math.exp(-u * 1.8) * Math.min(1, u * 300); }); }
          else if (r === 'Guitar') { const seq = [0, 2, 4, 7], i0 = deg + seq[gi % 4], f = hz(55 + key + sc[i0 % 7] + 12 * Math.floor(i0 / 7)), N = Math.max(2, Math.round(sr / f)), kb = new Float32Array(N); let lp = 0; for (let q = 0; q < N; q++) { lp = 0.6 * lp + 0.4 * rnd(); kb[q] = lp; } let ix = 0; gi++;
            voice(t, 1.4, u => { const v = kb[ix]; kb[ix] = 0.5 * (v + kb[(ix + 1) % N]) * 0.997; ix = (ix + 1) % N; return 0.55 * v * Math.exp(-u * 1.4) * Math.min(1, u * 400); }, 0.35); }
          else if (r === 'Keys') for (const k of [0, 2, 4]) { const i = deg + k, f = hz(60 + key + sc[i % 7] + 12 * Math.floor(i / 7)); voice(t, step * 6, u => 0.07 * (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(4 * Math.PI * f * u)) * Math.exp(-u * 2.2) * Math.min(1, u * 100), 0.3 + 0.2 * k / 2); } } } }
    bar0 += nb;
  }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); if (pk > 0.89) { const g = 0.89 / pk; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }
  return { L, R, sr, dur: n / sr };
}
