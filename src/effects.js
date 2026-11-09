// The grunge layer, painted over the 3D scene on a 2D canvas: speed streaks,
// rough ink at the edges of the screen, splashes when a boost catches, a
// splatter on a hit, and the speedometer. The lines « boil »: they are
// re-jittered twelve times a second, like a drawing animated by hand.

const INK = '#141A24';
let canvas, x, W = 1, H = 1, dpr = 1;
const streaks = Array.from({ length: 70 }, () => spawn({}, true));
const bursts = [];                              // { type, age, life, seed }
let boilStep = -1, boilSeed = 1;

function spawn(st, anywhere) {
  st.a = Math.random() * Math.PI * 2;
  st.d = anywhere ? Math.random() : 0.02 + Math.random() * 0.1;
  st.len = 0.4 + Math.random() * 0.8;
  st.w = 0.8 + Math.random() * 1.8;
  st.v = 0.7 + Math.random() * 0.6;
  return st;
}
// Random numbers that hold still between two boils.
let seed = 1;
const jr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
function rough(pts, w, alpha) {
  x.globalAlpha = alpha;
  for (let pass = 0; pass < 2; pass++) {
    x.lineWidth = w * (pass ? 0.5 : 1);
    x.beginPath();
    pts.forEach(([px, py], i) => { const j = pass ? jr() * w * 1.6 : jr() * w * 0.5; if (i) x.lineTo(px + j, py + j); else x.moveTo(px + j, py + j); });
    x.stroke();
  }
  x.globalAlpha = 1;
}
function blot(cx, cy, r, alpha) {
  x.globalAlpha = alpha; x.beginPath();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, rr = r * (0.7 + (jr() + 0.5) * 0.6); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
  for (let i = 0; i < 4; i++) { const a = (jr() + 0.5) * Math.PI * 2, d = r * (1.2 + (jr() + 0.5)); x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * 0.12 * (1 + jr()), 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 1;
}

export function init(el) { canvas = el; x = canvas.getContext('2d'); resize(); }
export function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
}
/** Something happened: 'turbo' (a boost caught), 'hit', 'land', 'token'. */
export function fx(type) { bursts.push({ type, age: 0, life: type === 'turbo' ? 0.7 : type === 'hit' ? 0.55 : 0.3, seed: (Math.random() * 1e9) | 0 }); }

/** v: { dt, t, kmh, rush (0..1: how fast it feels), turbo (0..3), playing } */
export function draw(v) {
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  x.strokeStyle = x.fillStyle = INK; x.lineCap = x.lineJoin = 'round';
  const step = Math.floor(v.t * 12);
  if (step !== boilStep) { boilStep = step; boilSeed = (step * 7919) % 2147483647 || 1; }
  seed = boilSeed;
  const vx = W / 2, vy = H * 0.42, diag = Math.hypot(W, H) / 2;
  const k = v.playing ? v.rush : 0;
  // Speed streaks, out from the point the road runs to.
  if (k > 0.02) {
    for (const st of streaks) {
      st.d += v.dt * st.v * (0.55 + k * 1.6);
      if (st.d > 1.05) spawn(st, false);
      const r1 = (0.18 + st.d * 0.95) * diag, r2 = r1 + st.len * diag * (0.08 + k * 0.32);
      const ca = Math.cos(st.a), sa = Math.sin(st.a);
      const px1 = vx + ca * r1, py1 = vy + sa * r1, px2 = vx + ca * r2, py2 = vy + sa * r2;
      // Keep the wheel clear: nothing low in the middle.
      if (Math.abs(px1 - W / 2) < W * 0.16 && py1 > H * 0.55) continue;
      rough([[px1, py1], [(px1 + px2) / 2, (py1 + py2) / 2], [px2, py2]], st.w * (0.6 + k * 1.6), Math.min(0.85, st.d * 1.4) * Math.min(1, k * 1.4));
    }
  }
  // Rough ink round the edges when it really goes fast, or burns.
  const edge = Math.max(0, k - 0.45) * 1.6 + v.turbo * 0.12;
  if (v.playing && edge > 0.02) {
    const strokes = 26;
    for (let i = 0; i < strokes; i++) {
      const side = i % 4, u = (i >> 2) / (strokes / 4), w = 6 + (jr() + 0.5) * 14 * edge;
      const inset = 4 + (jr() + 0.5) * 22 * edge;
      const pts = side === 0 ? [[u * W, inset], [(u + 0.22) * W, inset * 0.6]] : side === 1 ? [[W - inset, u * H], [W - inset * 0.6, (u + 0.25) * H]]
        : side === 2 ? [[u * W, H - inset], [(u + 0.22) * W, H - inset * 0.6]] : [[inset, u * H], [inset * 0.6, (u + 0.25) * H]];
      rough(pts, w, Math.min(0.7, edge * 0.55));
    }
  }
  // Bursts: splashes for a boost, a splatter for a hit.
  for (const b of bursts) {
    b.age += v.dt;
    const u = b.age / b.life, fade = Math.max(0, 1 - u);
    seed = b.seed;
    if (b.type === 'turbo') {
      for (let i = 0; i < 18; i++) {
        const a = (jr() + 0.5) * Math.PI * 2, d = diag * (0.55 + (jr() + 0.5) * 0.45) * (0.85 + u * 0.3);
        blot(vx + Math.cos(a) * d, vy + Math.sin(a) * d * 0.8, 10 + (jr() + 0.5) * 26, 0.75 * fade);
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + jr() * 0.2, r1 = diag * (0.1 + u * 0.5), r2 = r1 + diag * 0.25 * fade;
        rough([[vx + Math.cos(a) * r1, vy + Math.sin(a) * r1], [vx + Math.cos(a) * r2, vy + Math.sin(a) * r2]], 3 + 4 * fade, 0.8 * fade);
      }
    } else if (b.type === 'hit') {
      const cx = W / 2, cy = H * 0.72;
      blot(cx, cy, 34 * (0.8 + u), 0.55 * fade);
      for (let i = 0; i < 9; i++) {
        const a = (jr() + 0.5) * Math.PI * 2, len = diag * (0.15 + (jr() + 0.5) * 0.25);
        rough([[cx, cy], [cx + Math.cos(a) * len * 0.5 + jr() * 20, cy + Math.sin(a) * len * 0.5 + jr() * 20], [cx + Math.cos(a) * len, cy + Math.sin(a) * len]], 2.5, 0.8 * fade);
      }
    } else if (b.type === 'land') {
      const cx = W / 2, cy = H * 0.8;
      for (let i = 0; i < 6; i++) blot(cx + jr() * 120, cy + jr() * 16, 4 + (jr() + 0.5) * 6, 0.5 * fade);
    }
  }
  for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].age >= bursts[i].life) bursts.splice(i, 1);
  seed = boilSeed;
  if (v.playing) speedometer(v);
}

// An ink gauge, bottom right: 0 to 300 km/h, a needle, the number, the flames of the boost.
function speedometer(v) {
  const R = Math.min(78, W * 0.09), cx = W - R - 26, cy = H - R - 20;
  const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2, max = 300;
  const at = (kmh) => a0 + (a1 - a0) * Math.min(1, kmh / max);
  x.fillStyle = '#FFFFFF'; x.globalAlpha = 0.85; x.beginPath(); x.arc(cx, cy, R + 8, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1; x.fillStyle = INK;
  const arc = [];
  for (let i = 0; i <= 30; i++) { const a = a0 + (a1 - a0) * (i / 30); arc.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  rough(arc, 3, 1);
  for (let kmh = 0; kmh <= max; kmh += 20) {
    const a = at(kmh), big = kmh % 60 === 0, r1 = R - (big ? 13 : 7);
    rough([[cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1)]], big ? 2.6 : 1.5, 1);
    if (big) { x.font = "600 10px 'Sindry Mono', Consolas, monospace"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(kmh), cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24)); }
  }
  // The red zone, in ink: hatched past 240.
  for (let kmh = 240; kmh < max; kmh += 6) { const a = at(kmh); rough([[cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2)], [cx + Math.cos(a + 0.05) * (R + 7), cy + Math.sin(a + 0.05) * (R + 7)]], 1.6, 1); }
  const na = at(v.kmh) + jr() * 0.02 * (1 + v.turbo);
  rough([[cx - Math.cos(na) * 10, cy - Math.sin(na) * 10], [cx + Math.cos(na) * (R - 8), cy + Math.sin(na) * (R - 8)]], 3.4, 1);
  x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.fill();
  x.font = "800 20px 'Sindry Mono', Consolas, monospace"; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillText(String(Math.round(v.kmh)), cx, cy + R * 0.55);
  x.font = "600 9.5px 'Sindry Mono', Consolas, monospace"; x.fillText('KM/H', cx, cy + R * 0.55 + 12);
  if (v.turbo > 0) {
    x.font = "800 11px 'Sindry Mono', Consolas, monospace";
    x.fillText(`TURBO ×${v.turbo}`, cx, cy - R * 0.38);
  }
}
