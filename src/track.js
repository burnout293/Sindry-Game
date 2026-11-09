// The track's path through the city: straights, bends, hills, tunnels and
// forks, sampled every DS units. Pure data and maths, no three.js.
//
// The game itself plays in track coordinates: s along the path, x across it
// (lanes), y above it. Bends and hills only change where that frame sits in
// the world, so the physics stays as simple as on a straight line.

export const DS = 0.5;
const FORK_EASE = 26;                           // the length over which branches part or meet

const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/**
 * Lays out the sections of course n, length L: { t, s0, s1, yaw?, rise?, kind? }.
 * t is 'straight', 'curve', 'slope', 'tunnel' or 'fork' (kind 'lr': left or
 * right, 'ud': up or down).
 */
export function layout(L, r) {
  const secs = [];
  let s = 0, h = 0;
  const add = (t, len, extra = {}) => { secs.push({ t, s0: s, s1: s + len, ...extra }); s += len; };
  add('straight', 50);
  while (s < L - 140) {
    const p = r();
    if (p < 0.2) add('straight', 20 + r() * 25);
    else if (p < 0.5) add('curve', 35 + r() * 35, { yaw: (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.95) });
    else if (p < 0.68) {
      // Hills, kept within reach of the ground.
      let rise = (r() < 0.5 ? -1 : 1) * (4 + r() * 9);
      if (h + rise > 22 || h + rise < -3) rise = -rise;
      h += rise;
      add('slope', 32 + r() * 25, { rise });
    } else if (p < 0.82) add('tunnel', 36 + r() * 26, { yaw: (r() - 0.5) * 0.5 });
    else if (s > 120) add('fork', 90 + r() * 30, { kind: r() < 0.5 ? 'lr' : 'ud' });
    else add('straight', 30);
  }
  add('straight', L - s);
  return secs;
}

/** Samples the path: positions, heading (yaw) and slope (pitch) every DS. */
export function buildTrack(L, r) {
  const sections = layout(L, r);
  const n = Math.ceil(L / DS) + 1;
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n), yaw = new Float32Array(n), pitch = new Float32Array(n);
  let x = 0, y = 0, z = 0, a = 0, i = 0;
  for (const sec of sections) {
    const steps = Math.round((sec.s1 - sec.s0) / DS);
    for (let k = 0; k < steps && i < n - 1; k++) {
      const u0 = k / steps, u1 = (k + 1) / steps;
      const da = (sec.yaw || 0) * (smooth(u1) - smooth(u0));
      const dh = (sec.rise || 0) * (smooth(u1) - smooth(u0));
      const flat = Math.sqrt(Math.max(0, DS * DS - dh * dh));
      px[i] = x; py[i] = y; pz[i] = z; yaw[i] = a; pitch[i] = Math.asin(Math.max(-1, Math.min(1, dh / DS)));
      a += da;
      x += -Math.sin(a) * flat; z += -Math.cos(a) * flat; y += dh;
      i++;
    }
  }
  for (; i < n; i++) {                          // what is left runs straight on
    px[i] = x; py[i] = y; pz[i] = z; yaw[i] = a; pitch[i] = 0;
    x += -Math.sin(a) * DS; z += -Math.cos(a) * DS;
  }
  return {
    L, sections, px, py, pz, yaw, pitch,
    forks: sections.filter((q) => q.t === 'fork'),
    tunnels: sections.filter((q) => q.t === 'tunnel'),
  };
}

/** The frame at s: position p, forward f, right r, up u (unit vectors). */
export function frameAt(tr, s) {
  const n = tr.px.length - 1;
  const fi = Math.max(0, Math.min(n - 1e-6, s / DS)), i = Math.floor(fi), w = fi - i, j = Math.min(n, i + 1);
  const lerp = (arr) => arr[i] + (arr[j] - arr[i]) * w;
  const extra = s > tr.L ? s - tr.L : s < 0 ? s : 0;   // beyond the ends, straight on
  const a = lerp(tr.yaw), b = lerp(tr.pitch);
  const f = [-Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)];
  const r = [Math.cos(a), 0, -Math.sin(a)];
  const u = [-r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1]];
  const p = [lerp(tr.px) + f[0] * extra, lerp(tr.py) + f[1] * extra, lerp(tr.pz) + f[2] * extra];
  return { p, f, r, u, yaw: a, pitch: b };
}

export const forkAt = (tr, s) => tr.forks.find((q) => s >= q.s0 && s <= q.s1) || null;

/** How far a branch has parted from the trunk at s, from 0 to 1. */
export function parting(fork, s) {
  return smooth(clamp01((s - fork.s0) / FORK_EASE)) * smooth(clamp01((fork.s1 - s) / FORK_EASE));
}
export const FORK_SPREAD = { lr: 7.5, ud: 7 };

/** Where track point (s, x, y) on branch 'A' or 'B' (or none) sits in the world. */
export function worldAt(tr, s, x, y, branch) {
  const fr = frameAt(tr, s);
  let ox = 0, oy = 0;
  const fork = branch ? forkAt(tr, s) : null;
  if (fork) {
    const d = FORK_SPREAD[fork.kind] * parting(fork, s) * (branch === 'A' ? -1 : 1);
    if (fork.kind === 'lr') ox = d; else oy = -d;      // 'ud': A goes up, B goes down
  }
  return [
    fr.p[0] + fr.r[0] * (x + ox) + fr.u[0] * (y + oy),
    fr.p[1] + fr.r[1] * (x + ox) + fr.u[1] * (y + oy),
    fr.p[2] + fr.r[2] * (x + ox) + fr.u[2] * (y + oy),
  ];
}
