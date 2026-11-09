// The 3D scene: white, unlit surfaces and thick black outlines, the 2D game's
// line drawing given depth. The track runs towards -z (world z = -s), the
// camera follows behind the wheel and above it.

import * as THREE from 'three';
import { LineSegments2 } from '../vendor/three/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/lines/LineSegmentsGeometry.js';
import { LineMaterial } from '../vendor/three/lines/LineMaterial.js';
import * as ART from './art.js';
import { HALF_W, BLOCK, PLAT_T, M_PER_UNIT } from './course.js';

// Sindry's gear (design/icon, M49 T3): tip radius 100, roots 82, ring 57,
// hub 34, one tooth straight up. The wheel is this path, extruded.
const GEAR_D = 'M-21.13 -82.56L-16.2 -95.18Q-14.75 -98.91 -10.78 -99.42A100 100 0 0 1 10.78 -99.42Q14.75 -98.91 16.2 -95.18L21.13 -82.56Q22.58 -78.83 26.4 -77.63A82 82 0 0 1 36.23 -73.56Q39.77 -71.71 43.44 -73.32L55.85 -78.76Q59.51 -80.36 62.68 -77.92A100 100 0 0 1 77.92 -62.68Q80.36 -59.51 78.76 -55.85L73.32 -43.44Q71.71 -39.77 73.56 -36.23A82 82 0 0 1 77.63 -26.4Q78.83 -22.58 82.56 -21.13L95.18 -16.2Q98.91 -14.75 99.42 -10.78A100 100 0 0 1 99.42 10.78Q98.91 14.75 95.18 16.2L82.56 21.13Q78.83 22.58 77.63 26.4A82 82 0 0 1 73.56 36.23Q71.71 39.77 73.32 43.44L78.76 55.85Q80.36 59.51 77.92 62.68A100 100 0 0 1 62.68 77.92Q59.51 80.36 55.85 78.76L43.44 73.32Q39.77 71.71 36.23 73.56A82 82 0 0 1 26.4 77.63Q22.58 78.83 21.13 82.56L16.2 95.18Q14.75 98.91 10.78 99.42A100 100 0 0 1 -10.78 99.42Q-14.75 98.91 -16.2 95.18L-21.13 82.56Q-22.58 78.83 -26.4 77.63A82 82 0 0 1 -36.23 73.56Q-39.77 71.71 -43.44 73.32L-55.85 78.76Q-59.51 80.36 -62.68 77.92A100 100 0 0 1 -77.92 62.68Q-80.36 59.51 -78.76 55.85L-73.32 43.44Q-71.71 39.77 -73.56 36.23A82 82 0 0 1 -77.63 26.4Q-78.83 22.58 -82.56 21.13L-95.18 16.2Q-98.91 14.75 -99.42 10.78A100 100 0 0 1 -99.42 -10.78Q-98.91 -14.75 -95.18 -16.2L-82.56 -21.13Q-78.83 -22.58 -77.63 -26.4A82 82 0 0 1 -73.56 -36.23Q-71.71 -39.77 -73.32 -43.44L-78.76 -55.85Q-80.36 -59.51 -77.92 -62.68A100 100 0 0 1 -62.68 -77.92Q-59.51 -80.36 -55.85 -78.76L-43.44 -73.32Q-39.77 -71.71 -36.23 -73.56A82 82 0 0 1 -26.4 -77.63Q-22.58 -78.83 -21.13 -82.56Z';
export const WHEEL_T = 0.6;                     // the wheel's thickness
const INK = new THREE.Color(ART.INK), PAPER = new THREE.Color(ART.PAPER);

let renderer, scene, camera, courseGroup, wheel, spinner, gearMeshes, shadow, fireSprite, fireArt, backdrop, dust;
const lineMats = [];

/* ---------- Materials and outlines ---------- */
const textures = {};
function tex(name, make, repeat) {
  if (!textures[name]) {
    const t = new THREE.CanvasTexture(make());
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    textures[name] = t;
  }
  return textures[name];
}
// Surfaces sit a hair behind their outlines, so the lines always win.
const surface = (opts = {}) => new THREE.MeshBasicMaterial({ color: PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, ...opts });
const PAPER_MAT = surface();
function inkMat(width, opts = {}) {
  const m = new LineMaterial({ color: INK, linewidth: width, ...opts });
  m.fog = true;
  lineMats.push(m);
  return m;
}
const INK_THICK = inkMat(2.4), INK_THIN = inkMat(1.4);
const INK_DASH = inkMat(1.4, { dashed: true, dashSize: 0.9, gapSize: 1.1, transparent: true, opacity: 0.35 });
const INK_FAR = inkMat(1.6, { transparent: true, opacity: 0.3 });
function outline(geometry, mat = INK_THICK, angle = 25) {
  return new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry, angle)), mat);
}
function segments(points, mat) {                // [x0,y0,z0, x1,y1,z1, …] pairs
  const l = new LineSegments2(new LineSegmentsGeometry().setPositions(points), mat);
  if (mat.dashed) l.computeLineDistances();
  return l;
}
function loop(points3) {                        // a closed polyline as segment pairs
  const out = [];
  for (let i = 0; i < points3.length; i++) { const a = points3[i], b = points3[(i + 1) % points3.length]; out.push(...a, ...b); }
  return out;
}
function drawn(geometry, material = PAPER_MAT, mat = INK_THICK, angle = 25) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geometry, material), outline(geometry, mat, angle));
  return g;
}

/* ---------- The wheel ---------- */
// The icon's path in shape units (y up), its broken teeth replaced by jagged stumps.
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
      // From the tooth's left base to its right base, close to the root.
      const end = endOf(seq[4]), a0 = Math.atan2(cur[1], cur[0]), a1 = Math.atan2(end[1], end[0]);
      for (const [f, r] of [[0.22, 0.9], [0.42, 0.86], [0.6, 0.92], [0.8, 0.87]]) { const a = a0 + (a1 - a0) * f; sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      sh.lineTo(...end); cur = end;
      seq.slice(5).forEach(apply);
    } else seq.forEach(apply);
  }
  return sh;
}
function circleYZ(r, x, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x, Math.cos(a) * r, Math.sin(a) * r]); }
  return loop(pts);
}
function buildGear(missing) {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(gearShape(missing), { depth: WHEEL_T, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -WHEEL_T / 2); geo.rotateY(Math.PI / 2);   // its faces look along ±x
  g.add(drawn(geo, PAPER_MAT, INK_THICK, 20));
  const face = WHEEL_T / 2 + 0.004;
  g.add(segments([...circleYZ(0.57, face), ...circleYZ(0.57, -face), ...circleYZ(0.34, face), ...circleYZ(0.34, -face)], INK_THIN));
  const hub = new THREE.CylinderGeometry(0.2, 0.2, WHEEL_T + 0.24, 24);
  hub.rotateZ(Math.PI / 2);
  g.add(drawn(hub, PAPER_MAT, INK_THIN, 30));
  return g;
}
let missingKey = '';
export function setMissing(missing) {
  const key = [...missing].sort().join(',');
  if (key === missingKey && gearMeshes) return;
  missingKey = key;
  if (gearMeshes) { spinner.remove(gearMeshes); disposeTree(gearMeshes); }
  gearMeshes = buildGear(missing);
  spinner.add(gearMeshes);
}

/* ---------- The course ---------- */
function disposeTree(o) {
  o.traverse((n) => { n.geometry?.dispose?.(); });
}
const sOf = (s) => -s;
function spikeField(o) {
  // Square pyramids, a row every 0.75 along the track, one every 0.6 across.
  const cone = new THREE.ConeGeometry(0.34, o.h, 4, 1).toNonIndexed();
  cone.rotateY(Math.PI / 4); cone.translate(0, o.h / 2, 0);
  const across = Math.max(1, Math.round((o.x1 - o.x0) / 0.6)), along = Math.max(1, Math.round((o.s1 - o.s0) / 0.75));
  const src = cone.getAttribute('position').array, out = new Float32Array(src.length * across * along);
  let k = 0;
  for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
    const x = o.x0 + (i + 0.5) * (o.x1 - o.x0) / across, z = sOf(o.s0 + (j + 0.5) * (o.s1 - o.s0) / along);
    for (let v = 0; v < src.length; v += 3) { out[k++] = src[v] + x; out[k++] = src[v + 1]; out[k++] = src[v + 2] + z; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return drawn(geo, PAPER_MAT, INK_THIN, 20);
}
let BLOCK_GEO = null, BLOCK_MATS = null;
function block(xc, y0, s0) {
  if (!BLOCK_GEO) {
    BLOCK_GEO = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    const front = surface({ map: tex('padlock', ART.padlock) });
    BLOCK_MATS = [PAPER_MAT, PAPER_MAT, PAPER_MAT, PAPER_MAT, front, PAPER_MAT];   // +z faces the camera
  }
  const g = drawn(BLOCK_GEO, BLOCK_MATS);
  g.position.set(xc, y0 + BLOCK / 2, sOf(s0 + BLOCK / 2));
  return g;
}
export function setCourse(c) {
  if (courseGroup) { scene.remove(courseGroup); disposeTree(courseGroup); }
  courseGroup = new THREE.Group();
  const hatch = surface({ map: tex('hatch', ART.hatching, true) });
  // The track: slabs between the holes.
  const cuts = [...c.holes].sort((a, b) => a.s0 - b.s0);
  let from = -30;
  const slabs = [];
  for (const h of cuts) { slabs.push([from, h.s0]); from = h.s1; }
  slabs.push([from, c.L + 80]);
  for (const [a, b] of slabs) {
    const geo = new THREE.BoxGeometry(HALF_W * 2, 0.3, b - a);
    const slab = drawn(geo);
    slab.position.set(0, -0.15, sOf((a + b) / 2));
    courseGroup.add(slab);
    // Lane lines, dashed.
    courseGroup.add(segments([-1, 0.01, sOf(a), -1, 0.01, sOf(b), 1, 0.01, sOf(a), 1, 0.01, sOf(b)], INK_DASH));
  }
  // The far wall of each hole, hatched.
  for (const h of cuts) {
    const wall = new THREE.PlaneGeometry(HALF_W * 2, 6);
    const t = hatch.map.clone(); t.needsUpdate = true; t.repeat.set(6, 6);
    const m = new THREE.Mesh(wall, surface({ map: t }));
    m.position.set(0, -3.3, sOf(h.s1) + 0.001);
    courseGroup.add(m, segments(loop([[-HALF_W, -0.3, sOf(h.s1)], [HALF_W, -0.3, sOf(h.s1)], [HALF_W, -6.3, sOf(h.s1)], [-HALF_W, -6.3, sOf(h.s1)]]), INK_THIN));
  }
  // A mark every 100 m.
  for (let m = 100; m / M_PER_UNIT < c.L; m += 100) {
    const s = m / M_PER_UNIT;
    if (c.holes.some((h) => s > h.s0 - 0.5 && s < h.s1 + 0.5)) continue;
    courseGroup.add(segments([-HALF_W, 0.012, sOf(s), HALF_W, 0.012, sOf(s)], INK_THIN));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(`m${m}`, () => ART.label(`${m} m`)), transparent: true, depthWrite: false }));
    sp.scale.set(2.4, 0.6, 1); sp.position.set(-HALF_W - 1.5, 0.45, sOf(s));
    courseGroup.add(sp);
  }
  // Platforms: slabs with hatched sides.
  const hatched = (across) => { const t = hatch.map.clone(); t.needsUpdate = true; t.repeat.set(across, 1); return surface({ map: t }); };
  for (const p of c.plats) {
    const geo = new THREE.BoxGeometry(p.x1 - p.x0, PLAT_T, p.s1 - p.s0);
    const side = hatched(Math.round(p.s1 - p.s0)), front = hatched(Math.round(p.x1 - p.x0));
    const slab = drawn(geo, [side, side, PAPER_MAT, PAPER_MAT, front, front]);
    slab.position.set((p.x0 + p.x1) / 2, p.y - PLAT_T / 2, sOf((p.s0 + p.s1) / 2));
    courseGroup.add(slab);
  }
  // Hazards.
  for (const o of c.obs) {
    if (o.t === 'pics') courseGroup.add(spikeField(o));
    else {
      const xc = (o.x0 + o.x1) / 2;
      courseGroup.add(block(xc, 0, o.s0));
      if (o.t === 'pile') courseGroup.add(block(xc, BLOCK, o.s0));
    }
  }
  // Boosts: chevrons on the track.
  c.boostMeshes = c.boosts.map((b) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: tex('chevrons', ART.chevrons), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(b.x, 0.02, sOf(b.s));
    courseGroup.add(m);
    return m;
  });
  // Bonuses: Sindry's flame, floating.
  c.bonusSprites = c.bonus.map((b) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('flame', ART.flameBonus), transparent: true }));
    sp.scale.set(1.05, 1.3, 1); sp.position.set(b.x, b.y, sOf(b.s));
    courseGroup.add(sp);
    return sp;
  });
  // The finish: two posts, a checked banner, a checked strip on the track.
  const post = new THREE.BoxGeometry(0.4, 5, 0.4);
  for (const sx of [-1, 1]) { const g = drawn(post); g.position.set(sx * (HALF_W + 0.3), 2.5, sOf(c.L)); courseGroup.add(g); }
  const chk = tex('checker', ART.checker, true).clone(); chk.needsUpdate = true; chk.repeat.set(8, 1);
  const banner = drawn(new THREE.BoxGeometry(HALF_W * 2 + 1, 0.9, 0.3), surface({ map: chk }));
  banner.position.set(0, 5.2, sOf(c.L)); courseGroup.add(banner);
  const chk2 = tex('checker', ART.checker, true).clone(); chk2.needsUpdate = true; chk2.repeat.set(6, 1);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 1), surface({ map: chk2 }));
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.015, sOf(c.L)); courseGroup.add(strip);
  scene.add(courseGroup);
}

/* ---------- Backdrop: big wheels drawn faintly on the horizon ---------- */
function cogLoop(r, th, n, cx, cy) {
  const pts = [], step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) for (const [rr, f] of [[r, 0], [r, 0.2], [r + th, 0.34], [r + th, 0.66], [r, 0.8]]) {
    const a = (i + f) * step; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0]);
  }
  return loop(pts);
}
function buildBackdrop() {
  const g = new THREE.Group();
  const wheels = [[-46, 9, 16], [-20, 22, 9], [30, 12, 20], [62, 26, 12], [-78, 20, 14]];
  g.userData.wheels = wheels.map(([x, y, r], i) => {
    const w = new THREE.Group();
    w.add(segments([...cogLoop(r, r * 0.16, Math.max(10, Math.round(r * 1.1)), 0, 0), ...loop(Array.from({ length: 40 }, (_, k) => [Math.cos(k / 40 * Math.PI * 2) * r * 0.42, Math.sin(k / 40 * Math.PI * 2) * r * 0.42, 0]))], INK_FAR));
    w.position.set(x, y, 0); w.userData.dir = i % 2 ? 1 : -1; w.userData.r = r;
    g.add(w);
    return w;
  });
  return g;
}

/* ---------- Setup, resize, frame ---------- */
export function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(PAPER, 1);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PAPER, 45, 150);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  wheel = new THREE.Group(); spinner = new THREE.Group();
  wheel.add(spinner); scene.add(wheel);
  setMissing(new Set());
  shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.16, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  fireArt = ART.fire();
  const fireTex = new THREE.CanvasTexture(fireArt.canvas); fireTex.colorSpace = THREE.SRGBColorSpace;
  fireSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false }));
  fireSprite.scale.set(3.6, 3.6, 1); fireSprite.visible = false; scene.add(fireSprite);
  backdrop = buildBackdrop(); scene.add(backdrop);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 200), 3));
  dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: INK, size: 0.12, sizeAttenuation: true }));
  dust.frustumCulled = false; scene.add(dust);
  resize();
}
export function resize() {
  const w = renderer.domElement.clientWidth || window.innerWidth, h = renderer.domElement.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  for (const m of lineMats) m.resolution.set(w, h);   // each line material keeps its own copy
}

/**
 * One frame. v: { s, x, y, ang, lean, ground (the height under the wheel),
 * boost (0..1, the fire), invisible (blinking after a hit), t, parts, course }.
 */
let camX = 0, camY = 3.6;
export function render(v) {
  wheel.position.set(v.x, v.y, sOf(v.s));
  wheel.rotation.z = -v.lean;
  spinner.rotation.x = -v.ang;
  wheel.visible = !v.invisible;
  // A shadow under the wheel, smaller and fainter as it rises.
  const up = Math.max(0, v.y - 1 - v.ground);
  shadow.visible = v.ground > -1;
  shadow.position.set(v.x, v.ground + 0.02, sOf(v.s));
  shadow.scale.setScalar(Math.max(0.35, 1 - up * 0.1));
  shadow.material.opacity = Math.max(0.05, 0.16 - up * 0.02);
  // The fire on boost, behind the wheel and rising.
  fireSprite.visible = v.boost > 0;
  if (v.boost > 0) {
    fireArt.draw(v.t, v.boost);
    fireSprite.material.map.needsUpdate = true;
    fireSprite.position.set(v.x, v.y + 0.75, sOf(v.s) + 0.55);
  }
  // Bonuses spin and bob; taken things vanish.
  const c = v.course;
  if (c?.bonusSprites) c.bonus.forEach((b, i) => { const sp = c.bonusSprites[i]; sp.visible = !b.taken; sp.position.y = b.y + Math.sin(v.t * 3 + b.s) * 0.15; });
  if (c?.boostMeshes) c.boosts.forEach((b, i) => { c.boostMeshes[i].material.opacity = b.taken ? 0.25 : 1; });
  // Dust and debris.
  const pos = dust.geometry.getAttribute('position'), n = Math.min(200, v.parts.length);
  for (let i = 0; i < 200; i++) {
    if (i < n) { const p = v.parts[i]; pos.setXYZ(i, p.x, p.y, sOf(p.s)); } else pos.setXYZ(i, 0, -999, 0);
  }
  pos.needsUpdate = true;
  // The camera: behind and above, easing after the wheel, wider at speed.
  camX += (v.x * 0.7 - camX) * 0.12;
  camY += (3.6 + Math.max(0, v.y - 1) * 0.45 - camY) * 0.12;
  camera.position.set(camX, camY, sOf(v.s) + 7.5);
  camera.lookAt(camX * 0.85, 1 + Math.max(0, v.y - 1) * 0.3, sOf(v.s) - 7);
  const fov = 60 + 9 * v.boost;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
  // The backdrop stays on the horizon and turns slowly.
  backdrop.position.set(camX * 0.3, 0, camera.position.z - 135);
  for (const w of backdrop.userData.wheels) w.rotation.z = w.userData.dir * v.s / w.userData.r * 0.25;
  renderer.render(scene, camera);
}
