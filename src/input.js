// Keyboard and gamepad, read once per frame.
//
// Keys go by their place on the keyboard (event.code), so W A S D is also
// Z Q S D on a French keyboard. The gamepad is the browser's standard mapping
// (Xbox names): stick or pad to steer, A or the right trigger to jump, Start
// to pause; on the settings screen X, Y and LB buy speed, boost and repairs.

const ACTIONS = {
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', Enter: 'ok',
  Escape: 'pause', KeyP: 'pause', Digit1: 'speed', Digit2: 'turbo', Digit3: 'repair',
};
const GAME_KEYS = new Set([...Object.keys(ACTIONS), 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'KeyA', 'KeyD', 'KeyS']);
const PAD_ACTIONS = { 0: 'jump', 9: 'pause', 2: 'speed', 3: 'turbo', 4: 'repair' };
const DEAD = 0.2;

const held = new Set();
let queued = [], previous = [], padName = null;

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
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
 * The state of the controls for this frame: steer in [-1, 1], jump held, the
 * actions pressed since the last frame, and whether a gamepad is plugged in.
 */
export function poll() {
  let steer = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
  let jump = held.has('Space') || held.has('ArrowUp') || held.has('KeyW');
  const gp = firstPad();
  if (gp) {
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > DEAD) steer += Math.sign(ax) * (Math.abs(ax) - DEAD) / (1 - DEAD);
    steer += (pressed(gp, 15) ? 1 : 0) - (pressed(gp, 14) ? 1 : 0);
    jump = jump || pressed(gp, 0) || (gp.buttons[7]?.value ?? 0) > 0.5;
    gp.buttons.forEach((b, i) => { if (b.pressed && !previous[i] && PAD_ACTIONS[i]) queued.push(PAD_ACTIONS[i]); });
    if ((gp.buttons[7]?.value ?? 0) > 0.5 && !previous[7]) queued.push('jump');
    previous = gp.buttons.map((b, i) => (i === 7 ? b.value > 0.5 : b.pressed));
    padName = gp.id;
  } else { previous = []; padName = null; }
  const actions = queued; queued = [];
  return { steer: Math.max(-1, Math.min(1, steer)), jump, actions, pad: padName };
}

/** A short shake of the gamepad, where it can. */
export function rumble(ms = 160, strength = 0.6) {
  const gp = firstPad();
  gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })?.catch?.(() => {});
}
