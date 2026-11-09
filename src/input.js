// Keyboard, gamepad and touch, read once per frame, as in a runner: left and
// right switch lanes, up jumps, down slides (or dives, in the air). On the
// screens the same directions move between buttons, A or Space presses one.
//
// Keys go by their place on the keyboard (event.code), so W A S D is also
// Z Q S D on a French keyboard. The gamepad uses the browser's standard
// mapping (Xbox names): stick flick or pad for lanes, A, the right trigger or
// up to jump, down to slide, Start to pause, B to go back on the screens.

const ACTIONS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', Space: 'jump', ArrowDown: 'down', KeyS: 'down',
  Enter: 'ok', Escape: 'pause', KeyP: 'pause', Backspace: 'back',
};
const PAD_ACTIONS = { 0: 'jump', 1: 'back', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const FLICK = 0.6, BACK = 0.35;                 // a stick flick, and how far back it must come

const held = new Set();
let queued = [], previous = [], stick = { x: 0, y: 0 }, padName = null;

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (ACTIONS[e.code]) e.preventDefault();
  held.add(e.code);
  if (!e.repeat && ACTIONS[e.code]) queued.push(ACTIONS[e.code]);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

const pressed = (gp, i) => !!gp.buttons[i]?.pressed;
function firstPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  return pads.find((p) => p && p.connected) || null;
}

/**
 * The controls for this frame: the actions since the last one, the jump held
 * (a longer press jumps higher), and the gamepad's name when one is in use.
 */
export function poll() {
  let jump = held.has('Space') || held.has('ArrowUp') || held.has('KeyW');
  const gp = firstPad();
  if (gp) {
    gp.buttons.forEach((b, i) => { if (b.pressed && !previous[i] && PAD_ACTIONS[i]) queued.push(PAD_ACTIONS[i]); });
    const rt = (gp.buttons[7]?.value ?? 0) > 0.5;
    if (rt && !previous[7]) queued.push('jump');
    jump = jump || pressed(gp, 0) || pressed(gp, 12) || rt;
    previous = gp.buttons.map((b, i) => (i === 7 ? rt : b.pressed));
    // The stick: one flick, one action; it must come back before the next.
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.abs(ax) > FLICK && Math.abs(stick.x) < BACK) queued.push(ax < 0 ? 'left' : 'right');
    if (ay > FLICK && stick.y < BACK) queued.push('down');
    if (ay < -FLICK && stick.y > -BACK) queued.push('up');
    jump = jump || ay < -FLICK;
    stick = { x: Math.abs(ax) > BACK ? ax : 0, y: Math.abs(ay) > BACK ? ay : 0 };
    padName = gp.id;
  } else { previous = []; padName = null; }
  const actions = queued; queued = [];
  return { actions, jump, pad: padName };
}

/** A shake of the gamepad, where it can. */
export function rumble(ms = 160, strength = 0.6) {
  const gp = firstPad();
  gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })?.catch?.(() => {});
}

// Touch screens: swipe left, right, up or down; a tap jumps. Only on the scene
// (the screens' buttons answer on their own).
let touch = null;
export function listenTouch(el) {
  el.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY, at: performance.now() }; e.preventDefault(); }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    // A swipe acts as soon as it is long enough, not when the finger lifts.
    if (Math.hypot(dx, dy) > 34) { queued.push(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')); touch = null; }
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchend', (e) => { if (touch && performance.now() - touch.at < 300) queued.push('jump'); touch = null; e.preventDefault(); }, { passive: false });
}
