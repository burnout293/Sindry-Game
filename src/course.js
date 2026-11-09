// A course of Roue libre, in track coordinates (the wheel's tip radius is 1):
// s along the path, x across it, y above it. Plain data and pure functions;
// the scene draws it, the simulation collides with it, Node can test it.
//
// Three lanes, as in a runner: switch lanes, jump, slide. What stands in the
// way: blocks and piles (go round or jump), spikes (jump), gantries (slide
// under), holes across the track (jump), wagons to ride on (climb their ramp,
// or go round), slabs to land on. Forks make you choose a side; a wall
// stands in the middle lane where they part.

import { buildTrack, forkAt } from './track.js';

export const M_PER_UNIT = 2.75;                // 1 unit = the 2D game's 27.5 px = 2.75 m
export const LANES = [-2, 0, 2];
export const LANE_W = 2, HALF_W = 3;
export const BLOCK = 1.25, SPIKE_H = 0.75, PLAT_T = 0.55, PILE_H = 2.5, WAGON_H = 3, GANTRY = [1.3, 4.6];

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Course n is 1 200 m long, then 300 m more each time. */
export const lengthOf = (n) => (1200 + 300 * (n - 1)) / M_PER_UNIT;
const laneSpan = (first, count) => [LANES[first] - LANE_W / 2 + 0.1, LANES[first + count - 1] + LANE_W / 2 - 0.1];
const inLane = (l) => [LANES[l] - LANE_W / 2 + 0.15, LANES[l] + LANE_W / 2 - 0.15];

/**
 * Hazards { t, s0, s1, x0, x1, y0, y1, branch }: t is 'bloc', 'pile', 'pics',
 * 'portique' (slide under) or 'mur'. Holes { s0, s1, branch } cross the whole
 * track. Wagons { s0, s1, x0, x1, h, ramp } can be ridden; slabs { s0, s1, x0,
 * x1, y } landed on. Tokens: turbos and réglages { s, x, y, branch }.
 * branch is null on the trunk, 'A' or 'B' in a fork.
 */
export function buildCourse(n, seed) {
  const r = rng(seed * 31 + n * 7919);
  const L = lengthOf(n), diff = Math.min(1, (n - 1) / 8);
  const track = buildTrack(L, r);
  const obs = [], holes = [], wagons = [], plats = [];

  // One event at s on a branch: what it puts down, and how long it lasts.
  function event(s, branch, roomy) {
    const p = r(), lanes3 = [0, 1, 2].sort(() => r() - 0.5);
    if (p < 0.18) {
      const k = r() < 0.4 + 0.3 * diff ? 2 : 1;
      for (const l of lanes3.slice(0, k)) { const [x0, x1] = inLane(l); obs.push({ t: 'bloc', s0: s, s1: s + BLOCK, x0, x1, y0: 0, y1: BLOCK, branch }); }
      return BLOCK;
    }
    if (p < 0.32) {
      const k = r() < 0.25 + 0.3 * diff ? 3 : 1 + Math.floor(r() * 2), first = Math.floor(r() * (4 - k)), [x0, x1] = laneSpan(first, k);
      obs.push({ t: 'pics', s0: s, s1: s + 0.9, x0, x1, y0: 0, y1: SPIKE_H, branch });
      return 0.9;
    }
    if (p < 0.46) {
      // A gantry: slide under it. Over every lane but one, sometimes all three.
      const all = r() < 0.3 + 0.3 * diff;
      for (const l of all ? lanes3 : lanes3.slice(0, 2)) { const [x0, x1] = inLane(l); obs.push({ t: 'portique', s0: s, s1: s + 0.8, x0, x1, y0: GANTRY[0], y1: GANTRY[1], branch }); }
      return 0.8;
    }
    if (p < 0.56 && roomy) {
      const len = 2.8 + r() * (1.6 + 1.6 * diff);
      holes.push({ s0: s, s1: s + len, branch });
      return len;
    }
    if (p < 0.76) {
      // Wagons: long boxes to ride on, one with a ramp to climb.
      const len = 14 + r() * 18, k = 1 + (r() < 0.5 ? 1 : 0);
      lanes3.slice(0, k).forEach((l, i) => {
        const [x0, x1] = inLane(l), ramp = i === 0 && r() < 0.75;
        wagons.push({ s0: s + (ramp ? 6 : 0), s1: s + (ramp ? 6 : 0) + len, x0, x1, h: WAGON_H, ramp, branch });
      });
      return len + 6;
    }
    if (p < 0.88) {
      const k = 1 + Math.floor(r() * 3), first = Math.floor(r() * (4 - k)), [x0, x1] = laneSpan(first, k);
      const len = 7 + r() * 5, y = 2.6 + r() * 1.4;
      plats.push({ s0: s, s1: s + len, x0, x1, y, branch });
      if (r() < 0.5 + 0.3 * diff) obs.push({ t: 'pics', s0: s + 1.3, s1: s + len - 1.3, x0, x1, y0: 0, y1: SPIKE_H, branch });
      return len;
    }
    const l = lanes3[0], [x0, x1] = inLane(l);
    obs.push({ t: 'pile', s0: s, s1: s + BLOCK, x0, x1, y0: 0, y1: PILE_H, branch });
    return BLOCK;
  }
  const gap = () => 13 - 4 * diff + r() * 10;
  const tunnelAt = (s) => track.tunnels.some((q) => s > q.s0 - 4 && s < q.s1 + 4);

  // The trunk, around the forks.
  let s = 55;
  for (const fork of [...track.forks, { s0: L - 30, s1: L, end: true }]) {
    while (s < fork.s0 - 34) s += event(s, null, !tunnelAt(s)) + gap();
    if (fork.end) break;
    // The wall where the branches part: the middle lane must choose.
    obs.push({ t: 'mur', s0: fork.s0 - 4, s1: fork.s0 + 2, x0: -0.85, x1: 0.85, y0: 0, y1: 3.6, branch: null });
    for (const b of ['A', 'B']) {
      let sb = fork.s0 + 30;
      while (sb < fork.s1 - 30) sb += event(sb, b, true) + gap();
    }
    s = fork.s1 + 8;
  }

  // Tokens: 2 turbos and 2 réglages on the trunk, and a réglage at the end of
  // one branch of each fork: the harder way pays.
  const blocked = (ss, x, branch, pad) => holes.some((h) => h.branch === branch && ss > h.s0 - pad && ss < h.s1 + pad)
    || obs.some((o) => o.branch === branch && ss > o.s0 - pad && ss < o.s1 + pad && x > o.x0 - 0.8 && x < o.x1 + 0.8)
    || wagons.some((w) => w.branch === branch && ss > w.s0 - 7 && ss < w.s1 + 1 && x > w.x0 - 0.8 && x < w.x1 + 0.8);
  const taken = [];
  const place = () => {
    let ss = 0, x = 0;
    for (let i = 0; i < 200; i++) {
      ss = 40 + r() * (L - 90); x = LANES[Math.floor(r() * 3)];
      if (!forkAt(track, ss) && !blocked(ss, x, null, 3) && taken.every((q) => Math.abs(q - ss) > 30)) break;
    }
    taken.push(ss);
    return { s: ss, x, y: 1, branch: null, taken: false };
  };
  const turbos = [place(), place()].sort((a, b) => a.s - b.s);
  const reglages = [place(), place()];
  for (const fork of track.forks) {
    const b = r() < 0.5 ? 'A' : 'B';
    const ss = fork.s1 - 34, x = LANES[Math.floor(r() * 3)];
    reglages.push({ s: ss, x, y: blocked(ss, x, b, 2) ? 4.5 : 1, branch: b, taken: false });
  }
  return { n, L, track, obs, holes, wagons, plats, turbos, reglages };
}

/** The branch a point is on: the one chosen in a fork, none elsewhere. */
export const onBranch = (c, s, chosen) => (forkAt(c.track, s) ? chosen : null);
const here = (q, branch) => q.branch === null || q.branch === branch;

/** Is there a hole under s on this branch? */
export const holeAt = (c, s, branch) => c.holes.find((h) => here(h, branch) && s > h.s0 + 0.15 && s < h.s1 - 0.15);

/**
 * The height the wheel can stand on at (s, x), given the bottom of the wheel
 * yb: the track (unless a hole), a ramp rising to a wagon, a wagon's roof, a
 * slab. -Infinity over a hole with nothing under.
 */
export function supportAt(c, s, x, yb, branch) {
  let best = holeAt(c, s, branch) ? -Infinity : 0;
  for (const w of c.wagons) {
    if (!here(w, branch) || x < w.x0 - 0.1 || x > w.x1 + 0.1) continue;
    if (s >= w.s0 && s <= w.s1 && yb >= w.h - 0.45) best = Math.max(best, w.h);
    else if (w.ramp && s >= w.s0 - 6 && s < w.s0) {
      const h = w.h * (s - (w.s0 - 6)) / 6;
      if (yb >= h - 0.6) best = Math.max(best, h);
    }
  }
  for (const p of c.plats) {
    if (here(p, branch) && s > p.s0 && s < p.s1 && x > p.x0 - 0.15 && x < p.x1 + 0.15 && yb >= p.y - 0.05) best = Math.max(best, p.y);
  }
  return best;
}

/** Hazards the wheel can hit here: obstacles, and the fronts of wagons. */
export function hazardsNear(c, s, branch) {
  const list = c.obs.filter((o) => here(o, branch) && o.s0 < s + 2 && o.s1 > s - 2);
  for (const w of c.wagons) if (here(w, branch) && w.s0 < s + 2 && w.s1 > s - 2) list.push({ t: 'wagon', s0: w.s0, s1: w.s0 + 0.6, x0: w.x0, x1: w.x1, y0: 0, y1: w.h - 0.4 });
  return list;
}

/** Circle (in the s-y plane) against a rectangle. */
export function circleRect(cs, cy, rad, s0, s1, y0, y1) {
  const ds = cs - Math.max(s0, Math.min(cs, s1)), dy = cy - Math.max(y0, Math.min(cy, y1));
  return ds * ds + dy * dy < rad * rad;
}
