// The 3D scene: white, unlit surfaces and thick black outlines, the 2D game's
// line drawing given depth. The track bends, climbs and forks through a city
// of ink; everything on it is placed by the track's frame at its s.

import * as THREE from 'three';
import { LineSegments2 } from '../vendor/three/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/lines/LineSegmentsGeometry.js';
import { LineMaterial } from '../vendor/three/lines/LineMaterial.js';
import * as ART from './art.js';
import { frameAt, worldAt, forkAt, parting, FORK_SPREAD } from './track.js';
import { HALF_W, BLOCK, PLAT_T, M_PER_UNIT, rng } from './course.js';

// Sindry's gear (design/icon, M49 T3): tip radius 100, roots 82, one tooth up.
const GEAR_D = 'M-21.13 -82.56L-16.2 -95.18Q-14.75 -98.91 -10.78 -99.42A100 100 0 0 1 10.78 -99.42Q14.75 -98.91 16.2 -95.18L21.13 -82.56Q22.58 -78.83 26.4 -77.63A82 82 0 0 1 36.23 -73.56Q39.77 -71.71 43.44 -73.32L55.85 -78.76Q59.51 -80.36 62.68 -77.92A100 100 0 0 1 77.92 -62.68Q80.36 -59.51 78.76 -55.85L73.32 -43.44Q71.71 -39.77 73.56 -36.23A82 82 0 0 1 77.63 -26.4Q78.83 -22.58 82.56 -21.13L95.18 -16.2Q98.91 -14.75 99.42 -10.78A100 100 0 0 1 99.42 10.78Q98.91 14.75 95.18 16.2L82.56 21.13Q78.83 22.58 77.63 26.4A82 82 0 0 1 73.56 36.23Q71.71 39.77 73.32 43.44L78.76 55.85Q80.36 59.51 77.92 62.68A100 100 0 0 1 62.68 77.92Q59.51 80.36 55.85 78.76L43.44 73.32Q39.77 71.71 36.23 73.56A82 82 0 0 1 26.4 77.63Q22.58 78.83 21.13 82.56L16.2 95.18Q14.75 98.91 10.78 99.42A100 100 0 0 1 -10.78 99.42Q-14.75 98.91 -16.2 95.18L-21.13 82.56Q-22.58 78.83 -26.4 77.63A82 82 0 0 1 -36.23 73.56Q-39.77 71.71 -43.44 73.32L-55.85 78.76Q-59.51 80.36 -62.68 77.92A100 100 0 0 1 -77.92 62.68Q-80.36 59.51 -78.76 55.85L-73.32 43.44Q-71.71 39.77 -73.56 36.23A82 82 0 0 1 -77.63 26.4Q-78.83 22.58 -82.56 21.13L-95.18 16.2Q-98.91 14.75 -99.42 10.78A100 100 0 0 1 -99.42 -10.78Q-98.91 -14.75 -95.18 -16.2L-82.56 -21.13Q-78.83 -22.58 -77.63 -26.4A82 82 0 0 1 -73.56 -36.23Q-71.71 -39.77 -73.32 -43.44L-78.76 -55.85Q-80.36 -59.51 -77.92 -62.68A100 100 0 0 1 -62.68 -77.92Q-59.51 -80.36 -55.85 -78.76L-43.44 -73.32Q-39.77 -71.71 -36.23 -73.56A82 82 0 0 1 -26.4 -77.63Q-22.58 -78.83 -21.13 -82.56Z';
export const WHEEL_T = 0.6;
export const GROUND_Y = -12;                    // the city's ground: below the lowest road (a fork's low branch, at -7)
const INK = new THREE.Color(ART.INK), PAPER = new THREE.Color(ART.PAPER);

let renderer, scene, camera, courseGroup, wheel, spinner, gearMeshes, shadow, fire, fireArt, ground, dust, trail, flames;
const lineMats = [];

/* ---------- Materials and outlines ---------- */
const textures = {};
function tex(name, make, repeat) {
  if (!textures[name]) {
    const t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures[name] = t;
  }
  return textures[name];
}
// Surfaces sit a hair behind their outlines, so the lines always win.
const surface = (opts = {}) => new THREE.MeshBasicMaterial({ color: PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...opts });
const PAPER_MAT = surface(), PAPER_BOTH = surface({ side: THREE.DoubleSide });
function inkMat(width, opts = {}) {
  const m = new LineMaterial({ color: INK, linewidth: width, ...opts });
  m.fog = true;
  lineMats.push(m);
  return m;
}
const INK_THICK = inkMat(2.4), INK_THIN = inkMat(1.4), INK_FINE = inkMat(1);
const INK_DASH = inkMat(1.4, { dashed: true, dashSize: 0.9, gapSize: 1.1, transparent: true, opacity: 0.35 });
const INK_TRAIL = inkMat(0.16, { worldUnits: true, transparent: true, opacity: 0.32 });
const mats = {};
const matOf = (name, make, repeat) => (mats[name] ||= surface({ map: tex(name, make, repeat) }));

function edgesOf(geometry, mat = INK_THICK, angle = 25) {
  return new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, angle)), mat);
}
function segments(points, mat) {
  const l = new LineSegments2(new LineSegmentsGeometry().setPositions(points), mat);
  if (mat.dashed) l.computeLineDistances();
  return l;
}
const polyline = (pts) => { const out = []; for (let i = 0; i + 1 < pts.length; i++) out.push(...pts[i], ...pts[i + 1]); return out; };
const closed = (pts) => polyline([...pts, pts[0]]);
function drawn(geometry, material = PAPER_MAT, mat = INK_THICK, angle = 25) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geometry, material), edgesOf(geometry, mat, angle));
  return g;
}
// Puts an object on the track at (s, x, y), turned with the track (or only
// with its heading, for what stands upright: buildings, posts).
const _m = new THREE.Matrix4(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _b = new THREE.Vector3();
function place(obj, tr, s, x, y, branch = null, upright = false) {
  const fr = frameAt(tr, s);
  if (upright) { _r.set(fr.r[0], 0, fr.r[2]); _u.set(0, 1, 0); _b.set(Math.sin(fr.yaw), 0, Math.cos(fr.yaw)); }
  else { _r.fromArray(fr.r); _u.fromArray(fr.u); _b.set(-fr.f[0], -fr.f[1], -fr.f[2]); }
  _m.makeBasis(_r, _u, _b);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.fromArray(worldAt(tr, s, x, y, branch));
  return obj;
}

/* ---------- The wheel, in more detail: bevelled teeth, a pierced web, a bolted hub ---------- */
function gearShape(missing) {
  const cmds = [...GEAR_D.matchAll(/([MLQAZ])([^MLQAZ]*)/g)].map(([, c, a]) => [c, a.trim() ? a.trim().split(/[\s,]+/).map(Number) : []]);
  const P = (x, y) => [x / 100, -y / 100];
  const sh = new THREE.Shape();
  let cur = P(cmds[0][1][0], cmds[0][1][1]);
  sh.moveTo(...cur);
  const body = cmds.slice(1).filter(([c]) => c !== 'Z');
  const endOf = ([c, a]) => (c === 'L' ? P(a[0], a[1]) : c === 'Q' ? P(a[2], a[3]) : P(a[5], a[6]));
  const apply = ([c, a]) => {
    const end = endOf([c, a]);
    if (c === 'L') sh.lineTo(...end);
    else if (c === 'Q') sh.quadraticCurveTo(...P(a[0], a[1]), ...end);
    else sh.absarc(0, 0, a[0] / 100, Math.atan2(cur[1], cur[0]), Math.atan2(end[1], end[0]), true);
    cur = end;
  };
  for (let tooth = 0; tooth < 8; tooth++) {
    const seq = body.slice(tooth * 8, tooth * 8 + 8);
    if (missing.has(tooth)) {
      // A broken tooth: a jagged stump from its left base to its right base.
      const end = endOf(seq[4]), a0 = Math.atan2(cur[1], cur[0]), a1 = Math.atan2(end[1], end[0]);
      for (const [f, rr] of [[0.22, 0.9], [0.42, 0.86], [0.6, 0.92], [0.8, 0.87]]) { const a = a0 + (a1 - a0) * f; sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      sh.lineTo(...end); cur = end;
      seq.slice(5).forEach(apply);
    } else seq.forEach(apply);
  }
  return sh;
}
const circle = (r, cw = false) => { const p = new THREE.Path(); p.absarc(0, 0, r, 0, Math.PI * 2, cw); return p; };
function alongX(geo, depth) { geo.translate(0, 0, -depth / 2); geo.rotateY(Math.PI / 2); return geo; }   // faces look along ±x
function buildGear(missing) {
  const g = new THREE.Group();
  // The rim: the icon's teeth, a ring inside.
  const rim = gearShape(missing);
  rim.holes.push(circle(0.6, true));
  g.add(drawn(alongX(new THREE.ExtrudeGeometry(rim, { depth: WHEEL_T, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 }), WHEEL_T), [faceMat(), PAPER_MAT], INK_THICK, 20));
  // The web, thinner and pierced with six holes.
  const web = new THREE.Shape(); web.absarc(0, 0, 0.61, 0, Math.PI * 2, false);
  web.holes.push(circle(0.34, true));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * 0.475, Math.sin(a) * 0.475, 0.085, 0, Math.PI * 2, true); web.holes.push(h); }
  g.add(drawn(alongX(new THREE.ExtrudeGeometry(web, { depth: WHEEL_T * 0.45, bevelEnabled: false, curveSegments: 8 }), WHEEL_T * 0.45), PAPER_MAT, INK_THIN, 20));
  // The hub, standing proud, with six bolts on each face, and the axle.
  g.add(drawn(new THREE.CylinderGeometry(0.34, 0.34, WHEEL_T + 0.12, 28).rotateZ(Math.PI / 2), PAPER_MAT, INK_THIN, 30));
  const bolt = new THREE.CylinderGeometry(0.055, 0.055, 0.07, 6).rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, b = drawn(bolt, PAPER_MAT, INK_FINE, 30);
    b.position.set(side * (WHEEL_T / 2 + 0.09), Math.cos(a) * 0.23, Math.sin(a) * 0.23);
    g.add(b);
  }
  g.add(drawn(new THREE.CylinderGeometry(0.11, 0.11, WHEEL_T + 0.34, 16).rotateZ(Math.PI / 2), PAPER_MAT, INK_THIN, 30));
  return g;
}
let skinId = 'origine';
function faceMat() {
  if (skinId === 'origine') return PAPER_MAT;
  const t = tex(`skin-${skinId}`, () => ART.skin(skinId), true).clone(); t.needsUpdate = true; t.repeat.set(1.5, 1.5);
  return surface({ map: t });
}
export function setSkin(id) { if (id !== skinId) { skinId = id; missingKey = null; } }
let missingKey = null;
export function setMissing(missing) {
  const key = [...missing].sort().join(',') + skinId;
  if (key === missingKey) return;
  missingKey = key;
  if (gearMeshes) { spinner.remove(gearMeshes); disposeTree(gearMeshes); }
  gearMeshes = buildGear(missing);
  spinner.add(gearMeshes);
}

/* ---------- The track: ribbons swept along the path ---------- */
function disposeTree(o) { o.traverse((n) => n.geometry?.dispose?.()); }
// A slab of road from sa to sb, on a branch, its width given at each s.
function ribbon(tr, sa, sb, branch, widen = () => 0) {
  const pos = [], uv = [], left = [], right = [], dashL = [], dashR = [];
  const n = Math.max(1, Math.ceil(sb - sa));
  const at = (k) => {
    const s = sa + (sb - sa) * (k / n), w = HALF_W + widen(s);
    return { s, L: worldAt(tr, s, -w, 0, branch), R: worldAt(tr, s, w, 0, branch), Lb: worldAt(tr, s, -w, -0.4, branch), Rb: worldAt(tr, s, w, -0.4, branch),
      dl: worldAt(tr, s, -1, 0.012, branch), dr: worldAt(tr, s, 1, 0.012, branch) };
  };
  let a = at(0);
  left.push(a.L); right.push(a.R); dashL.push(a.dl); dashR.push(a.dr);
  const quad = (p, q, r, t) => { pos.push(...p, ...q, ...r, ...p, ...r, ...t); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
  for (let k = 1; k <= n; k++) {
    const b = at(k);
    quad(a.L, a.R, b.R, b.L); quad(a.Lb, a.L, b.L, b.Lb); quad(a.R, a.Rb, b.Rb, b.R);
    left.push(b.L); right.push(b.R); dashL.push(b.dl); dashR.push(b.dr);
    a = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, PAPER_MAT));
  g.add(segments([...polyline(left), ...polyline(right), ...left[0], ...right[0], ...left[left.length - 1], ...right[right.length - 1]], INK_THICK));
  if (!widen(sa) && !widen(sb)) g.add(segments([...polyline(dashL), ...polyline(dashR)], INK_DASH));
  return g;
}
// Ranges of [sa, sb] left once holes on this branch are cut out.
function minusHoles(sa, sb, holes) {
  const out = [];
  let from = sa;
  for (const h of holes.filter((q) => q.s1 > sa && q.s0 < sb).sort((p, q) => p.s0 - q.s0)) { if (h.s0 > from) out.push([from, h.s0]); from = Math.max(from, h.s1); }
  if (sb > from) out.push([from, sb]);
  return out;
}
function holeWall(tr, h) {
  const b = h.branch, s = h.s1;
  const P = (x, y) => worldAt(tr, s, x, y, b);
  const pts = [P(-HALF_W, -0.4), P(HALF_W, -0.4), P(HALF_W, -7), P(-HALF_W, -7)];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 6, 0, 6, 6.6, 0, 0, 6, 6.6, 0, 6.6], 2));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, matOf('hatch', ART.hatching, true)), segments(closed(pts), INK_THIN));
  return g;
}
// A tunnel: an arch swept along the path, ribbed, hatched inside, with a portal at each end.
function tunnel(tr, sa, sb, branch) {
  const g = new THREE.Group(), K = 12, R = 4.5, Hh = 5.4;
  const arch = (s, k) => worldAt(tr, s, Math.cos((k / K) * Math.PI) * R, Math.sin((k / K) * Math.PI) * Hh, branch);
  const n = Math.max(1, Math.ceil((sb - sa) / 1.5)), pos = [], uv = [], ribs = [], crown = [];
  for (let i = 0; i < n; i++) {
    const s0 = sa + (sb - sa) * (i / n), s1 = sa + (sb - sa) * ((i + 1) / n);
    for (let k = 0; k < K; k++) {
      const a = arch(s0, k), b = arch(s0, k + 1), c = arch(s1, k + 1), d = arch(s1, k);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(s0 * 1.2, k / 1.2, s0 * 1.2, (k + 1) / 1.2, s1 * 1.2, (k + 1) / 1.2, s0 * 1.2, k / 1.2, s1 * 1.2, (k + 1) / 1.2, s1 * 1.2, k / 1.2);
    }
    if (i % 3 === 0) ribs.push(...polyline(Array.from({ length: K + 1 }, (_, k) => arch(s0, k))));
    crown.push(arch(s0, K / 2));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Ribs only, no shell: what comes next stays in sight through the tunnel.
  geo.dispose();
  g.add(segments(ribs, INK_THIN), segments(polyline(crown), INK_FINE));
  // Portals: an arch-shaped frame, thick, at both ends.
  // One horseshoe outline: up the outer arch, down to the road, back under the inner arch.
  const frame = new THREE.Shape();
  frame.moveTo(-R - 1.2, -0.4); frame.lineTo(-R - 1.2, 0);
  frame.absellipse(0, 0, R + 1.2, Hh + 1.2, Math.PI, 0, true);
  frame.lineTo(R + 1.2, -0.4); frame.lineTo(R, -0.4); frame.lineTo(R, 0);
  frame.absellipse(0, 0, R, Hh, 0, Math.PI, false);
  frame.lineTo(-R, -0.4); frame.closePath();
  const portal = new THREE.ExtrudeGeometry(frame, { depth: 1.2, bevelEnabled: false, curveSegments: 16 });
  portal.translate(0, 0, -0.6);
  for (const s of [sa, sb]) g.add(place(drawn(portal, [matOf('stripes', ART.stripes, true), PAPER_MAT], INK_THICK, 30), tr, s, 0, 0, branch));
  return g;
}
function trackRanges(c) {
  const tr = c.track, g = new THREE.Group();
  const trunkHoles = c.holes.filter((h) => !h.branch);
  // The trunk, outside the forks.
  let from = -40;
  const spans = [];
  for (const f of tr.forks) { spans.push([from, f.s0]); from = f.s1; }
  spans.push([from, c.L + 120]);
  for (const [a, b] of spans) for (const [p, q] of minusHoles(a, b, trunkHoles)) g.add(ribbon(tr, p, q, null));
  for (const f of tr.forks) {
    // Where the branches still overlap the road is one, widening (left/right)
    // or rising and sinking apart (up/down).
    const spread = FORK_SPREAD[f.kind], split = (th) => { let s = f.s0; while (s < f.s1 && spread * parting(f, s) < th) s += 0.5; return s; };
    if (f.kind === 'lr') {
      const sSplit = split(HALF_W + 0.2), sJoin = f.s1 - (sSplit - f.s0);
      const widen = (s) => spread * parting(f, s);
      g.add(ribbon(tr, f.s0, sSplit, null, widen), ribbon(tr, sJoin, f.s1, null, widen));
      for (const b of ['A', 'B']) for (const [p, q] of minusHoles(sSplit, sJoin, c.holes.filter((h) => h.branch === b))) g.add(ribbon(tr, p, q, b));
    } else {
      const sSplit = split(0.5), sJoin = f.s1 - (sSplit - f.s0);
      g.add(ribbon(tr, f.s0, sSplit, null), ribbon(tr, sJoin, f.s1, null));
      for (const b of ['A', 'B']) for (const [p, q] of minusHoles(sSplit, sJoin, c.holes.filter((h) => h.branch === b))) g.add(ribbon(tr, p, q, b));
      // Down under the ground: a tunnel. Up in the air: piers.
      const deep = split(4.8);
      g.add(tunnel(tr, deep, f.s1 - (deep - f.s0), 'B'));
      for (let s = split(2); s < f.s1 - (split(2) - f.s0); s += 10) {
        const h = spread * parting(f, s);
        for (const x of [-HALF_W + 0.5, HALF_W - 0.5]) {
          g.add(place(drawn(new THREE.BoxGeometry(0.7, h, 0.7)), tr, s, x, -h / 2, 'A', true));
        }
      }
    }
    // The sign before the fork, and its gantry.
    const sign = new THREE.Group();
    const panel = drawn(new THREE.BoxGeometry(HALF_W * 2 + 1, 1.6, 0.25), [PAPER_MAT, PAPER_MAT, PAPER_MAT, PAPER_MAT, matOf(`fork-${f.kind}`, () => ART.forkSign(f.kind)), PAPER_MAT]);
    panel.position.y = 6.2; sign.add(panel);
    for (const x of [-HALF_W - 0.6, HALF_W + 0.6]) { const post = drawn(new THREE.BoxGeometry(0.35, 7, 0.35)); post.position.set(x, 3.5, 0); sign.add(post); }
    g.add(place(sign, tr, f.s0 - 30, 0, 0, null, true));
  }
  for (const h of c.holes) g.add(holeWall(tr, h));
  for (const t of tr.tunnels) g.add(tunnel(tr, t.s0, t.s1, null));
  return g;
}

/* ---------- Things on the track ---------- */
let BLOCK_GEO = null;
function block(y0, hatchIt) {
  BLOCK_GEO ||= new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const wood = hatchIt ? matOf('stripes', ART.stripes, true) : matOf('crate', ART.crate);
  const g = drawn(BLOCK_GEO, wood);
  g.position.y = y0 + BLOCK / 2;
  return g;
}
function spikeField(o) {
  const cone = new THREE.ConeGeometry(0.34, o.y1, 4, 1).toNonIndexed();
  cone.rotateY(Math.PI / 4); cone.translate(0, o.y1 / 2, 0);
  const across = Math.max(1, Math.round((o.x1 - o.x0) / 0.6)), along = Math.max(1, Math.round((o.s1 - o.s0) / 0.75));
  const src = cone.getAttribute('position').array, out = new Float32Array(src.length * across * along);
  let k = 0;
  for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
    const x = o.x0 + (i + 0.5) * (o.x1 - o.x0) / across, z = (o.s1 - o.s0) / 2 - (j + 0.5) * (o.s1 - o.s0) / along;
    for (let v = 0; v < src.length; v += 3) { out[k++] = src[v] + x; out[k++] = src[v + 1]; out[k++] = src[v + 2] + z; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return drawn(geo, PAPER_MAT, INK_THIN, 20);
}
let marker = false;
export function setMarker(on) { marker = on; }
function hazards(c) {
  const tr = c.track, g = new THREE.Group();
  for (const o of c.obs) {
    const mid = (o.s0 + o.s1) / 2, xc = (o.x0 + o.x1) / 2, w = o.x1 - o.x0;
    let obj;
    if (o.t === 'pics') { obj = spikeField(o); place(obj, tr, mid, 0, 0, o.branch); g.add(obj); continue; }
    if (o.t === 'caisse' || o.t === 'pile') {
      obj = new THREE.Group(); obj.add(block(0)); if (o.t === 'pile') obj.add(block(BLOCK));
    } else if (o.t === 'portique') {
      // A striped panel overhead, on two legs: slide under it.
      obj = new THREE.Group();
      const panel = drawn(new THREE.BoxGeometry(w, o.y1 - o.y0, 0.5), [PAPER_MAT, PAPER_MAT, PAPER_MAT, PAPER_MAT, matOf('stripes', ART.stripes, true), PAPER_MAT]);
      panel.position.y = (o.y0 + o.y1) / 2; obj.add(panel);
      for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) { const leg = drawn(new THREE.BoxGeometry(0.16, o.y0, 0.16), PAPER_MAT, INK_THIN); leg.position.set(lx, o.y0 / 2, 0); obj.add(leg); }
    } else {
      obj = drawn(new THREE.BoxGeometry(w, o.y1, o.s1 - o.s0), [matOf('stripes', ART.stripes, true), matOf('stripes', ART.stripes, true), PAPER_MAT, PAPER_MAT, matOf('stripes', ART.stripes, true), PAPER_MAT]);
      obj.children[0].position.y = obj.children[1].position.y = o.y1 / 2;
    }
    o.mesh = obj;
    g.add(place(obj, tr, mid, xc, 0, o.branch));
  }
  // Wagons: cars of 8 units, so that they follow the bends; a ramp before some.
  for (const w of c.wagons) {
    const width = w.x1 - w.x0, xc = (w.x0 + w.x1) / 2, cars = Math.max(1, Math.round((w.s1 - w.s0) / 8)), len = (w.s1 - w.s0) / cars;
    const side = matOf('wagon', ART.wagonSide), front = matOf('stripes', ART.stripes, true);
    for (let i = 0; i < cars; i++) {
      const car = drawn(new THREE.BoxGeometry(width, w.h, len - 0.35), [side, side, PAPER_MAT, PAPER_MAT, i === 0 ? front : PAPER_MAT, PAPER_MAT]);
      car.children[0].position.y = car.children[1].position.y = w.h / 2;
      g.add(place(car, tr, w.s0 + len * (i + 0.5), xc, 0, w.branch));
    }
    if (w.ramp) {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(6, 0); shape.lineTo(6, w.h); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: width - 0.1, bevelEnabled: false });
      geo.translate(-3, 0, -(width - 0.1) / 2); geo.rotateY(Math.PI / 2);
      g.add(place(drawn(geo, [PAPER_MAT, matOf('hatch', ART.hatching, true)]), tr, w.s0 - 3, xc, 0, w.branch));
    }
  }
  for (const p of c.plats) {
    const geo = new THREE.BoxGeometry(p.x1 - p.x0, PLAT_T, p.s1 - p.s0), h = matOf('hatch', ART.hatching, true);
    const slab = drawn(geo, [h, h, PAPER_MAT, PAPER_MAT, h, h]);
    slab.children[0].position.y = slab.children[1].position.y = p.y - PLAT_T / 2;
    g.add(place(slab, tr, (p.s0 + p.s1) / 2, (p.x0 + p.x1) / 2, 0, p.branch));
  }
  // Boost pads and réglages.
  c.turboMeshes = c.turbos.map((b) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: tex('chevrons', ART.chevrons), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    const holder = place(new THREE.Group(), tr, b.s, b.x, 0.03, b.branch); holder.add(m); g.add(holder);
    return m;
  });
  const coinMat = new THREE.SpriteMaterial({ map: tex(marker ? 'coinBlue' : 'coin', () => ART.coin(marker ? ART.BLUE : ART.INK)), transparent: true });
  c.coinSprites = c.coins.map((b) => {
    const sp = new THREE.Sprite(coinMat);
    sp.scale.set(0.8, 0.8, 1); sp.position.fromArray(worldAt(tr, b.s, b.x, b.y, b.branch));
    g.add(sp);
    return sp;
  });
  if (marker) for (const m of c.turboMeshes) m.material.color.set(ART.BLUE);
  // Roadworks: a striped fence the whole length of the closed lane.
  if (c.works) {
    const w = c.works, width = w.x1 - w.x0, xc = (w.x0 + w.x1) / 2, stripes = matOf('stripes', ART.stripes, true);
    for (let s = 30; s < c.L; s += 10) {
      if (forkAt(tr, s)) continue;
      const fence = drawn(new THREE.BoxGeometry(width, 1.1, 9.4), [stripes, stripes, PAPER_MAT, PAPER_MAT, stripes, stripes]);
      fence.children[0].position.y = fence.children[1].position.y = 0.55;
      g.add(place(fence, tr, s + 5, xc, 0));
    }
  }
  // A mark every 100 m, on the trunk.
  for (let m = 100; m / M_PER_UNIT < c.L; m += 100) {
    const s = m / M_PER_UNIT;
    if (forkAt(tr, s) || c.holes.some((h) => !h.branch && s > h.s0 - 0.5 && s < h.s1 + 0.5)) continue;
    g.add(segments([...worldAt(tr, s, -HALF_W, 0.015), ...worldAt(tr, s, HALF_W, 0.015)], INK_THIN));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(`m${m}`, () => ART.label(`${m} m`)), transparent: true, depthWrite: false }));
    sp.scale.set(2.4, 0.6, 1); sp.position.fromArray(worldAt(tr, s, -HALF_W - 1.5, 0.5)); g.add(sp);
  }
  // The finish: posts, a checked banner, a checked strip.
  const fin = new THREE.Group();
  for (const sx of [-1, 1]) { const p = drawn(new THREE.BoxGeometry(0.45, 6, 0.45)); p.position.set(sx * (HALF_W + 0.35), 3, 0); fin.add(p); }
  const chk = tex('checker', ART.checker, true).clone(); chk.needsUpdate = true; chk.repeat.set(8, 1);
  const banner = drawn(new THREE.BoxGeometry(HALF_W * 2 + 1.2, 1, 0.3), surface({ map: chk })); banner.position.y = 6.2; fin.add(banner);
  const chk2 = chk.clone(); chk2.needsUpdate = true; chk2.repeat.set(6, 1);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 1), surface({ map: chk2 })); strip.rotation.x = -Math.PI / 2; strip.position.y = 0.02; fin.add(strip);
  g.add(place(fin, tr, c.L, 0, 0));
  return g;
}

/* ---------- The city: buildings along the trunk, merged by stretches ---------- */
function city(c) {
  const tr = c.track, r = rng(c.n * 131 + 7), g = new THREE.Group();
  const near = (s, list, pad) => list.some((q) => s > q.s0 - pad && s < q.s1 + pad);
  let sides = [], tops = [], all = [], extra = [];
  const flush = () => {
    if (!all.length) return;
    const mk = (arr, withUv) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3)); if (withUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2)); return geo; };
    g.add(new THREE.Mesh(mk(sides, true), matOf('windows', ART.windows, true)), new THREE.Mesh(mk(tops), PAPER_MAT));
    const box = mk({ pos: all.flatMap((q) => q) }); g.add(edgesOf(box, INK_THIN, 30)); box.dispose();
    if (extra.length) g.add(segments(extra, INK_FINE));
    sides = { pos: [], uv: [] }; tops = { pos: [] }; all = []; extra = [];
  };
  sides = { pos: [], uv: [] }; tops = { pos: [] };
  // One box: base centre, half sizes along the track's right (a) and ahead (b), height.
  const building = (cx, cz, yaw, ha, hb, y0, h, plain = false) => {
    const ra = [Math.cos(yaw), -Math.sin(yaw)], rb = [-Math.sin(yaw), -Math.cos(yaw)];
    const corner = (i, j, y) => [cx + ra[0] * ha * i + rb[0] * hb * j, y, cz + ra[1] * ha * i + rb[1] * hb * j];
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const tri = [];
    for (let k = 0; k < 4; k++) {
      const [i0, j0] = ring[k], [i1, j1] = ring[(k + 1) % 4];
      const a = corner(i0, j0, y0), b = corner(i1, j1, y0), cc = corner(i1, j1, y0 + h), d = corner(i0, j0, y0 + h);
      const wlen = Math.hypot(b[0] - a[0], b[2] - a[2]) / 2.6, hlen = h / 2.6;
      if (plain) tops.pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      else { sides.pos.push(...a, ...b, ...cc, ...a, ...cc, ...d); sides.uv.push(0, 0, wlen, 0, wlen, hlen, 0, 0, wlen, hlen, 0, hlen); }
      tri.push(...a, ...b, ...cc, ...a, ...cc, ...d);
    }
    const t = ring.map(([i, j]) => corner(i, j, y0 + h));
    tops.pos.push(...t[0], ...t[1], ...t[2], ...t[0], ...t[2], ...t[3]);
    tri.push(...t[0], ...t[1], ...t[2], ...t[0], ...t[2], ...t[3]);
    all.push(tri);
    if (!plain && r() < 0.25) { const top = y0 + h, ax = cx + (r() - 0.5) * ha, az = cz + (r() - 0.5) * hb; extra.push(ax, top, az, ax, top + 4 + r() * 4, az, ax - 0.8, top + 3, az, ax + 0.8, top + 3, az); }
  };
  let chunk = 0;
  for (let s = -40; s < c.L + 160; s += 11 + r() * 6) {
    const fr = frameAt(tr, s), fork = forkAt(tr, s);
    const clear = 9 + (fork && fork.kind === 'lr' ? FORK_SPREAD.lr : 0);
    for (const side of [-1, 1]) {
      if (r() < 0.12) continue;
      const ha = 3 + r() * 4, hb = 3 + r() * 5, off = clear + ha + r() * 5;
      const cx = fr.p[0] + fr.r[0] * side * off, cz = fr.p[2] + fr.r[2] * side * off;
      const down = near(s, tr.sections.filter((q) => q.t === 'slope' || q.t === 'curve'), 0) ? 0.7 : 1;
      building(cx, cz, fr.yaw, ha, hb, GROUND_Y, (8 + r() * (r() < 0.2 ? 55 : 26)) * down + Math.max(0, fr.p[1]));
    }
    // Over a tunnel, a building straddles the track.
    if (near(s, tr.tunnels, -2)) building(fr.p[0], fr.p[2], fr.yaw, 8, 6.5, fr.p[1] + 6.8, 6 + r() * 14);
    // Piers under the track where it rides above the ground.
    if (!fork && fr.p[1] > GROUND_Y + 1.5 && !near(s, tr.tunnels, 2)) {
      for (const x of [-2.2, 2.2]) { const px = fr.p[0] + fr.r[0] * x, pz = fr.p[2] + fr.r[2] * x; building(px, pz, fr.yaw, 0.4, 0.4, GROUND_Y, fr.p[1] - 0.4 - GROUND_Y, true); }
    }
    if (s > (chunk + 1) * 70) { flush(); chunk++; }
  }
  flush();
  return g;
}

export function setCourse(c) {
  if (courseGroup) { scene.remove(courseGroup); disposeTree(courseGroup); }
  courseGroup = new THREE.Group();
  courseGroup.add(trackRanges(c), hazards(c), city(c));
  scene.add(courseGroup);
}

/* ---------- Setup, resize, frame ---------- */
export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(PAPER, 1);
  // Phones: a lighter picture, so it keeps up.
  renderer.setPixelRatio(Math.min(matchMedia('(pointer: coarse)').matches ? 1.5 : 2, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 50, 190);
  camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  wheel = new THREE.Group(); spinner = new THREE.Group();
  wheel.add(spinner); scene.add(wheel);
  setMissing(new Set());
  shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  const shadowHolder = new THREE.Group(); shadowHolder.add(shadow); scene.add(shadowHolder); shadow.userData.holder = shadowHolder;
  fireArt = ART.fire();
  const fireTex = new THREE.CanvasTexture(fireArt.canvas); fireTex.colorSpace = THREE.SRGBColorSpace;
  fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false }));
  fire.visible = false; scene.add(fire);
  flames = Array.from({ length: 22 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flameP', ART.flameParticle), transparent: true, depthWrite: false }));
    sp.visible = false; sp.userData = { life: 0 }; scene.add(sp); return sp;
  });
  const gridTex = tex('grid', ART.groundGrid, true).clone(); gridTex.needsUpdate = true; gridTex.repeat.set(60, 60);
  ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ map: gridTex, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; scene.add(ground);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 240), 3));
  dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: INK, size: 0.13, sizeAttenuation: true }));
  dust.frustumCulled = false; scene.add(dust);
  trail = null;
  resize();
}
export function resize() {
  const w = renderer.domElement.clientWidth || window.innerWidth, h = renderer.domElement.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  for (const m of lineMats) m.resolution.set(w, h);   // each line material keeps its own copy
}

/**
 * One frame. v: { s, x, y, ang, lean, slide (0..1), branch, ground (height
 * under the wheel or -Infinity), turbo (0..3), fireK (0..1), invisible, t, dt,
 * parts, trail (recent contact points [s, x, y, branch]), shake, speed, course }.
 */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
const CAM_SIDE = 0;
let camX = CAM_SIDE, camLift = 0, flameClock = 0, first = true;
export function render(v) {
  const tr = v.course.track;
  // The wheel, on the track's frame; it lies over when it slides.
  place(wheel, tr, v.s, v.x, v.y - v.slide * 0.45, v.branch);
  wheel.rotateZ(-v.lean - v.slide * 1.35);
  spinner.rotation.x = -v.ang;
  wheel.visible = !v.invisible;
  // The shadow under it, smaller and fainter as it rises.
  const sh = shadow.userData.holder;
  sh.visible = Number.isFinite(v.ground);
  if (sh.visible) {
    place(sh, tr, v.s, v.x, v.ground + 0.03, v.branch);
    const up = Math.max(0, v.y - 1 - v.ground);
    shadow.scale.setScalar(Math.max(0.35, 1 - up * 0.1)); shadow.material.opacity = Math.max(0.05, 0.18 - up * 0.02);
  }
  // Boost: a fire behind the wheel, bigger with each level, and flames shed in its wake.
  fire.visible = v.turbo > 0;
  if (fire.visible) {
    fireArt.draw(v.t, v.fireK);
    fire.material.map.needsUpdate = true;
    // Just ahead of the wheel: the wheel hides it where they cross, so it stays in sight.
    const k = 2.6 + v.turbo * 0.6;
    fire.scale.set(k, k, 1);
    fire.position.fromArray(worldAt(tr, v.s - 0.35, v.x, v.y + 0.35 + v.turbo * 0.2, v.branch));
  }
  flameClock -= v.dt;
  if (v.turbo > 0 && flameClock <= 0) {
    flameClock = 0.05 / v.turbo;
    const f = flames.find((q) => q.userData.life <= 0);
    if (f) { f.userData = { life: 0.45, s: v.s + 0.5, x: v.x + (Math.random() - 0.5) * 0.9, y: v.y + 0.3, b: v.branch, rise: 1.5 + Math.random() * 2 }; f.visible = true; }
  }
  for (const f of flames) {
    const d = f.userData;
    if (d.life <= 0) { f.visible = false; continue; }
    d.life -= v.dt; d.y += d.rise * v.dt;
    const k = Math.max(0, d.life / 0.45);
    f.position.fromArray(worldAt(tr, d.s, d.x, d.y, d.b)); f.scale.set(0.9 * k + 0.2, 1.35 * k + 0.3, 1); f.material.opacity = k;
  }
  // Tokens spin and bob; taken ones vanish.
  const c = v.course;
  const turn = 0.2 + 0.6 * Math.abs(Math.cos(v.t * 3));
  c.coins.forEach((b, i) => { const sp = c.coinSprites[i]; sp.visible = !b.taken; if (sp.visible && Math.abs(b.s - v.s) < 120) sp.scale.x = turn; });
  for (const o of c.obs) if (o.mesh) o.mesh.visible = !o.gone;
  c.turbos.forEach((b, i) => { c.turboMeshes[i].material.opacity = b.taken ? 0.2 : 1; });
  // Dust, sparks and debris.
  const pos = dust.geometry.getAttribute('position'), n = Math.min(240, v.parts.length);
  for (let i = 0; i < 240; i++) {
    if (i < n) { const p = v.parts[i]; pos.setXYZ(i, ...worldAt(tr, p.s, p.x, p.y, p.b)); } else pos.setXYZ(i, 0, -999, 0);
  }
  pos.needsUpdate = true;
  // Burnt rubber behind the wheel.
  if (trail) { scene.remove(trail); trail.geometry.dispose(); trail = null; }
  if (v.trail.length > 1) {
    const pts = [];
    for (let i = 0; i + 1 < v.trail.length; i++) {
      const a = v.trail[i], b = v.trail[i + 1];
      if (b.gap || Math.abs(a.s - b.s) > 3) continue;
      pts.push(...worldAt(tr, a.s, a.x, a.y + 0.03, a.b), ...worldAt(tr, b.s, b.x, b.y + 0.03, b.b));
    }
    if (pts.length) { trail = segments(pts, INK_TRAIL); scene.add(trail); }
  }
  // The camera: behind and above, easing after the wheel, wider and shaking at speed.
  // Centred behind the wheel.
  camX += (v.x * 0.65 + CAM_SIDE - camX) * Math.min(1, v.dt * 7);
  camLift += (Math.max(0, v.y - 1) * 0.5 - camLift) * Math.min(1, v.dt * 6);
  const look = v.s + 9, lookBranch = v.branch || (forkAt(tr, look) ? (v.x < 0 ? 'A' : 'B') : null);
  tmp.fromArray(worldAt(tr, v.s - 7.4, camX, 4 + camLift, v.branch || (forkAt(tr, v.s - 7.4) ? v.branchPrev : null)));
  const k = first ? 1 : Math.min(1, v.dt * 9);
  camPos.lerp(tmp, k);
  tmp.fromArray(worldAt(tr, look, camX, 1.3 + camLift * 0.6, lookBranch));
  camLook.lerp(tmp, k);
  first = false;
  camera.position.copy(camPos);
  if (v.shake > 0) camera.position.add(tmp.set((Math.random() - 0.5) * v.shake, (Math.random() - 0.5) * v.shake, (Math.random() - 0.5) * v.shake));
  camera.lookAt(camLook);
  const fov = 62 + Math.min(16, v.speed * 0.45) + v.turbo * 3;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, v.dt * 4); camera.updateProjectionMatrix(); }
  // The ground follows the camera; its grid slides, so it looks endless.
  ground.position.x = camera.position.x; ground.position.z = camera.position.z;
  ground.material.map.offset.set(camera.position.x / 20, -camera.position.z / 20);
  renderer.render(scene, camera);
}
export function resetCamera() { first = true; }
