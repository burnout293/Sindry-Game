// A course of Roue libre, in world units (the wheel's tip radius is 1).
//
// The track runs along s (metres ahead = s × M_PER_UNIT), three lanes wide.
// Everything here is plain data and pure functions: the scene draws it, the
// simulation collides with it, and Node can test it without a browser.
//
// The rules are those of the 2D game (mockup M45), scaled from its pixels
// (the wheel was 27.5 px): courses that grow longer, always 2 boosts and
// 2 bonuses placed at random, platforms, blocks, spikes and holes.

export const M_PER_UNIT = 2.75;                // 1 unit = the old 27.5 px = 2.75 m
export const LANES = [-2, 0, 2];               // lane centres, across the track
export const LANE_W = 2;
export const HALF_W = 3;                       // half the track's width
export const BLOCK = 1.25, SPIKE_H = 0.75, PLAT_T = 0.55, PILE_H = 2.5;

/** Seeded random numbers: the same course for the same seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Course n is 1 000 m long, then 250 m more each time. */
export const lengthOf = (n) => (1000 + 250 * (n - 1)) / M_PER_UNIT;

const laneSpan = (first, count) => [LANES[first] - LANE_W / 2, LANES[first + count - 1] + LANE_W / 2];

/**
 * Builds course n. Hazards: { t, s0, s1, x0, x1, h } where t is 'bloc', 'pics'
 * or 'pile'; holes cross the whole track { s0, s1 }; platforms are slabs
 * { s0, s1, x0, x1, y } (y: the top). Boosts { s, x } and bonuses { s, x, y }.
 */
export function buildCourse(n, seed) {
  const r = rng(seed * 31 + n * 7919);
  const L = lengthOf(n), diff = Math.min(1, (n - 1) / 8);
  const obs = [], holes = [], plats = [];
  const pick = (k) => Math.floor(r() * (LANES.length - k + 1));   // first lane of k contiguous lanes
  let s = 40;                                   // a clear start
  while (s < L - 25) {
    const p = r();
    if (p < 0.22) {
      // Blocks: one or two lanes, never all three.
      const two = r() < 0.35 + 0.3 * diff, lanes = [0, 1, 2].sort(() => r() - 0.5).slice(0, two ? 2 : 1);
      for (const l of lanes) obs.push({ t: 'bloc', s0: s, s1: s + BLOCK, x0: LANES[l] - BLOCK / 2, x1: LANES[l] + BLOCK / 2, h: BLOCK });
      s += BLOCK;
    } else if (p < 0.4) {
      // Spikes: across one to three lanes; three means jump.
      const k = r() < 0.25 + 0.35 * diff ? 3 : 1 + Math.floor(r() * 2), first = pick(k), [x0, x1] = laneSpan(first, k);
      obs.push({ t: 'pics', s0: s, s1: s + 0.9, x0: x0 + 0.1, x1: x1 - 0.1, h: SPIKE_H });
      s += 0.9;
    } else if (p < 0.54) {
      const len = 2.5 + r() * (1.3 + 1.6 * diff);
      holes.push({ s0: s, s1: s + len });
      s += len;
    } else if (p < 0.74) {
      // A platform over one to three lanes, often with spikes under it.
      const k = 1 + Math.floor(r() * 3), first = pick(k), [x0, x1] = laneSpan(first, k);
      const len = 6 + r() * 5, y = 2.6 + r() * 1.4;
      plats.push({ s0: s, s1: s + len, x0, x1, y });
      if (r() < 0.45 + 0.4 * diff) obs.push({ t: 'pics', s0: s + 1.3, s1: s + len - 1.3, x0: x0 + 0.1, x1: x1 - 0.1, h: SPIKE_H });
      s += len;
    } else if (p < 0.86) {
      // Stairs: a low slab, a high one, and under it a pile to go over (or round).
      const k = 2 + Math.floor(r() * 2), first = pick(k), [x0, x1] = laneSpan(first, k);
      plats.push({ s0: s, s1: s + 4.7, x0, x1, y: 2.7 });
      const s2 = s + 6.4, mid = LANES[first + Math.floor(r() * k)];
      plats.push({ s0: s2, s1: s2 + 6.9, x0, x1, y: 5.3 });
      obs.push({ t: 'pile', s0: s2 + 2.5, s1: s2 + 2.5 + BLOCK, x0: mid - BLOCK / 2, x1: mid + BLOCK / 2, h: PILE_H });
      s = s2 + 6.9;
    } else {
      const l = Math.floor(r() * 3);
      obs.push({ t: 'pile', s0: s, s1: s + BLOCK, x0: LANES[l] - BLOCK / 2, x1: LANES[l] + BLOCK / 2, h: PILE_H });
      s += BLOCK;
    }
    s += 11.6 - 4 * diff + r() * 9.5;
  }
  // Always 2 boosts and 2 bonuses, at random but never on a hazard.
  const blocked = (ss, x, pad) => holes.some((h) => ss > h.s0 - pad && ss < h.s1 + pad)
    || obs.some((o) => ss > o.s0 - pad && ss < o.s1 + pad && x > o.x0 - 1 && x < o.x1 + 1);
  const taken = [];
  const place = (pad) => {
    let ss = 0, x = 0;
    for (let i = 0; i < 120; i++) {
      ss = 25 + r() * (L - 50); x = LANES[Math.floor(r() * 3)];
      if (!blocked(ss, x, pad) && taken.every((q) => Math.abs(q - ss) > 15)) break;
    }
    taken.push(ss);
    return { s: ss, x };
  };
  const boosts = [place(3), place(3)].map((b) => ({ ...b, taken: false })).sort((a, b) => a.s - b.s);
  const bonus = [place(2), place(2)].map((b) => {
    const pl = plats.find((q) => b.s > q.s0 + 0.5 && b.s < q.s1 - 0.5 && b.x > q.x0 && b.x < q.x1);
    const y = pl ? pl.y + PLAT_T + 1 : 1 + (r() < 0.45 ? 0 : 2 + r() * 1.5);
    return { ...b, y, taken: false };
  });
  return { n, L, obs, holes, plats, boosts, bonus };
}

/** Is there a hole under s? */
export const holeAt = (c, s) => c.holes.find((h) => s > h.s0 + 0.15 && s < h.s1 - 0.15);

/** Circle (in the s-y plane) against a rectangle. */
export function circleRect(cs, cy, rad, s0, s1, y0, y1) {
  const ds = cs - Math.max(s0, Math.min(cs, s1)), dy = cy - Math.max(y0, Math.min(cy, y1));
  return ds * ds + dy * dy < rad * rad;
}
