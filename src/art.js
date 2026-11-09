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
