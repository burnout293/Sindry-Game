// The drawings the 3D scene wears as textures: one ink on white, as in the 2D
// game. Each is drawn once on a canvas, except the wheel's fire, redrawn as it
// flickers.

export const INK = '#141A24', PAPER = '#FFFFFF';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.lineCap = x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = INK;
  return [c, x];
}

/** Sindry's flame (the 2D bonus), white with a black outline. */
export function flameBonus() {
  const [c, x] = canvas(128, 160);
  const path = (cx, cy, s) => {
    x.moveTo(cx, cy - 16 * s);
    x.bezierCurveTo(cx + 5 * s, cy - 8 * s, cx + 11 * s, cy - 3 * s, cx + 11 * s, cy + 4 * s);
    x.arc(cx, cy + 4 * s, 11 * s, 0, Math.PI);
    x.bezierCurveTo(cx - 11 * s, cy - 3 * s, cx - 5 * s, cy - 8 * s, cx, cy - 16 * s);
    x.closePath();
  };
  x.beginPath(); path(64, 92, 4.2); x.fillStyle = PAPER; x.fill(); x.lineWidth = 7; x.stroke();
  x.beginPath(); path(64, 116, 1.8); x.lineWidth = 5; x.stroke();
  return c;
}

/** A locked file: the front of a block. */
export function padlock() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 128, 128);
  x.lineWidth = 6;
  x.beginPath(); x.arc(64, 54, 18, Math.PI, 0); x.stroke();
  x.strokeRect(38, 54, 52, 38);
  x.beginPath(); x.moveTo(64, 66); x.lineTo(64, 80); x.stroke();
  return c;
}

/** Diagonal hatching: the sides of slabs and the walls of holes. */
export function hatching() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = PAPER; x.fillRect(0, 0, 64, 64);
  x.lineWidth = 3;
  x.beginPath();
  for (let k = -64; k < 128; k += 16) { x.moveTo(k, 64); x.lineTo(k + 64, 0); }
  x.stroke();
  return c;
}

/** The finish: a checkerboard. */
export function checker() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = PAPER; x.fillRect(0, 0, 64, 64);
  x.fillStyle = INK; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
  return c;
}

/** A boost pad: two chevrons pointing ahead (up the texture). */
export function chevrons() {
  const [c, x] = canvas(128, 128);
  x.lineWidth = 12;
  x.beginPath();
  for (const y of [48, 88]) { x.moveTo(30, y + 18); x.lineTo(64, y - 16); x.lineTo(98, y + 18); }
  x.stroke();
  x.lineWidth = 6; x.strokeRect(6, 6, 116, 116);
  return c;
}

/** A label, for the marks every 100 m. */
export function label(text) {
  const [c, x] = canvas(256, 64);
  x.font = "600 34px 'Sindry Mono', Consolas, monospace";
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  return c;
}

// The fire behind the wheel on boost (the 2D turbo): tongues rising, merged
// into one flame by stroking them twice as thick and filling over.
const TONGUES = [[-0.42, 0.1, 2.3, -0.38, 0.28], [0, 0, 2.7, 0, 0.22], [0.42, 0.1, 2.3, 0.38, -0.28], [-0.2, 0.3, 1.7, -0.2, 0.2], [0.22, 0.3, 1.8, 0.24, -0.2]];
function tongue(x, h, b) {
  const r0 = 0.27 * h;
  x.moveTo(r0, 0);
  x.bezierCurveTo(r0, -0.45 * h, 0.1 * h - b * h * 0.3, -0.72 * h, -b * h, -h);
  x.bezierCurveTo(-0.1 * h - b * h * 0.5, -0.66 * h, -r0, -0.42 * h, -r0, 0);
  x.arc(0, 0, r0, Math.PI, 0, true);
  x.closePath();
}
export function fire() {
  const [c, x] = canvas(256, 256);
  return {
    canvas: c,
    draw(t, k) {
      x.clearRect(0, 0, 256, 256);
      if (k <= 0) return;
      const unit = 46, cx = 128, cy = 214;
      const add = (scale) => {
        x.beginPath();
        TONGUES.forEach(([dx, dy, hh, lean, bend], i) => {
          const h = hh * unit * scale * (0.55 + 0.45 * k) * (1 + 0.08 * Math.sin(t * 15 + i * 2.3));
          x.save(); x.translate(cx + dx * unit, cy + dy * unit); x.rotate(lean + 0.09 * Math.sin(t * 11 + i * 1.9));
          tongue(x, h, bend + 0.08 * Math.sin(t * 9 + i * 2.7)); x.restore();
        });
      };
      add(1); x.lineWidth = 12; x.stroke(); x.fillStyle = PAPER; x.fill();
      add(0.55); x.lineWidth = 8; x.stroke(); x.fill();
    },
  };
}

/* ---------- The city and its signs (0.2) ---------- */
// A rough line: drawn twice, slightly off, so the ink looks laid by hand.
function rough(x, pts, w) {
  for (let pass = 0; pass < 2; pass++) {
    x.lineWidth = w * (pass ? 0.55 : 1);
    x.beginPath();
    pts.forEach(([px, py], i) => { const j = pass ? (Math.random() - 0.5) * w * 0.8 : 0; if (i) x.lineTo(px + j, py + j); else x.moveTo(px + j, py + j); });
    x.stroke();
  }
}

/** Building windows: a grid of frames, some dark, slightly uneven. */
export function windows() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const ox = 14 + i * 64, oy = 12 + j * 64, dark = (i + j) % 3 === 0;
    if (dark) { x.fillStyle = INK; x.globalAlpha = 0.45; x.fillRect(ox, oy, 36, 44); x.globalAlpha = 1; }
    rough(x, [[ox, oy], [ox + 36, oy], [ox + 36, oy + 44], [ox, oy + 44], [ox, oy]], 4);
  }
  return c;
}

/** The side of a wagon: a band of windows over a plain skirt. */
export function wagonSide() {
  const [c, x] = canvas(256, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 4; i++) rough(x, [[14 + i * 62, 22], [56 + i * 62, 22], [56 + i * 62, 62], [14 + i * 62, 62], [14 + i * 62, 22]], 5);
  rough(x, [[0, 84], [256, 84]], 4);
  return c;
}

/** Hazard stripes: walls and gantries. */
export function stripes() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = PAPER; x.fillRect(0, 0, 64, 64);
  x.fillStyle = INK;
  for (let k = -64; k < 128; k += 32) { x.beginPath(); x.moveTo(k, 64); x.lineTo(k + 16, 64); x.lineTo(k + 80, 0); x.lineTo(k + 64, 0); x.closePath(); x.fill(); }
  return c;
}

/** The sign before a fork: which side goes where. */
export function forkSign(kind) {
  const [c, x] = canvas(512, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 512, 128);
  x.lineWidth = 8; x.strokeRect(6, 6, 500, 116); rough(x, [[256, 10], [256, 118]], 6);
  const arrow = (cx, dir) => {
    x.save(); x.translate(cx, 64); x.rotate(dir); x.beginPath();
    x.moveTo(-34, 0); x.lineTo(10, -34); x.lineTo(10, -14); x.lineTo(36, -14); x.lineTo(36, 14); x.lineTo(10, 14); x.lineTo(10, 34); x.closePath();
    x.fillStyle = INK; x.fill(); x.restore();
  };
  if (kind === 'lr') { arrow(128, 0); arrow(384, Math.PI); }
  else { arrow(128, Math.PI / 2); arrow(384, -Math.PI / 2); }
  return c;
}

/** A réglage to pick up: a little gear with « +1 ». */
export function reglageToken() {
  const [c, x] = canvas(128, 128);
  x.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 46 : 58; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  x.closePath(); x.fillStyle = PAPER; x.fill(); x.lineWidth = 7; x.stroke();
  x.font = "800 40px 'Sindry Mono', Consolas, monospace"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK;
  x.fillText('+1', 64, 67);
  return c;
}

/** A blot of ink, for sparks, dust and the grunge of the effects. */
export function blot() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = INK; x.beginPath();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 18 + Math.random() * 12; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 6; x.beginPath(); x.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + Math.random() * 2.5, 0, Math.PI * 2); x.fill(); }
  return c;
}

/** The ground of the city: a street grid, drawn faintly. */
export function groundGrid() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = PAPER; x.fillRect(0, 0, 256, 256);
  x.globalAlpha = 0.5; x.lineWidth = 3;
  x.strokeRect(0, 0, 256, 256);
  x.globalAlpha = 0.25; x.lineWidth = 2;
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  return c;
}

/** One flame of the boost's trail: a tongue, white with its outline. */
export function flameParticle() {
  const [c, x] = canvas(64, 96);
  x.beginPath(); tongue2(x, 32, 88, 76, 0.15); x.fillStyle = PAPER; x.fill(); x.lineWidth = 6; x.stroke();
  return c;
}
function tongue2(x, cx, cy, h, b) { x.save(); x.translate(cx, cy); tongue(x, h, b); x.restore(); }

/** Fine, pale hatching: the inside of tunnels, seen up close. */
export function hatchingFine() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = PAPER; x.fillRect(0, 0, 64, 64);
  x.globalAlpha = 0.45; x.lineWidth = 1.6;
  x.beginPath();
  for (let k = -64; k < 128; k += 16) { x.moveTo(k, 64); x.lineTo(k + 64, 0); }
  x.stroke();
  return c;
}

/* ---------- 0.3: crates, coins, roadworks, skins ---------- */
export const BLUE = '#2B6CF0';                  // the Marqueur's colour, the only one besides the ink

/** A wooden crate: planks, a frame, a cross brace. */
export function crate() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 128, 128);
  x.lineWidth = 2; x.globalAlpha = 0.6;
  for (let y = 26; y < 120; y += 25) rough(x, [[10, y], [118, y]], 2);
  x.globalAlpha = 1;
  rough(x, [[8, 8], [120, 8], [120, 120], [8, 120], [8, 8]], 9);
  rough(x, [[12, 12], [116, 116]], 8); rough(x, [[116, 12], [12, 116]], 8);
  for (const [px, py] of [[16, 16], [112, 16], [16, 112], [112, 112]]) { x.beginPath(); x.arc(px, py, 3, 0, Math.PI * 2); x.fill(); }
  return c;
}

/** A coin, edge-on or not: a disc with a gear tooth stamped in it. */
export function coin(color = INK) {
  const [c, x] = canvas(64, 64);
  x.strokeStyle = x.fillStyle = color;
  x.beginPath(); x.arc(32, 32, 27, 0, Math.PI * 2); x.fillStyle = PAPER; x.fill(); x.lineWidth = 6; x.stroke();
  x.beginPath(); x.arc(32, 32, 18, 0, Math.PI * 2); x.lineWidth = 2.5; x.stroke();
  x.fillStyle = color; x.beginPath(); x.moveTo(25, 40); x.lineTo(28, 22); x.lineTo(36, 22); x.lineTo(39, 40); x.closePath(); x.fill();
  return c;
}

/** The faces of the wheel, for each skin. */
export function skin(id) {
  const [c, x] = canvas(128, 128);
  x.fillStyle = PAPER; x.fillRect(0, 0, 128, 128);
  if (id === 'rouille') { x.lineWidth = 3; x.globalAlpha = 0.6; x.beginPath(); for (let k = -128; k < 256; k += 14) { x.moveTo(k, 128); x.lineTo(k + 128, 0); } x.stroke(); x.globalAlpha = 1; for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 0, Math.PI * 2); x.fill(); } }
  else if (id === 'pois') { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 8, 0, Math.PI * 2); x.fill(); } }
  else if (id === 'rayures') { for (let k = 0; k < 128; k += 32) x.fillRect(0, k, 128, 16); }
  else if (id === 'damier') { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 32, j * 32, 32, 32); }
  else if (id === 'nuit') { x.fillStyle = INK; x.fillRect(0, 0, 128, 128); x.strokeStyle = PAPER; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke(); }
  return c;
}
