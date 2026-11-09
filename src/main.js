// Roue libre, the standalone game: the rules of the 2D game (mockup M45)
// on a 3D track. Courses that grow longer, always 2 boosts and 2 bonuses,
// lives that carry over from one course to the next, points to spend after
// each finish line (speed, boost length, repairs), a record kept on this
// computer. New in 3D: the wheel steers across three lanes.

import * as SCENE from './scene.js';
import { WHEEL_T } from './scene.js';
import { buildCourse, holeAt, circleRect, M_PER_UNIT, HALF_W } from './course.js';
import { poll, rumble } from './input.js';

const $ = (s) => document.querySelector(s);
const RC = 1, HIT_R = 0.9, HALF_T = WHEEL_T / 2, TEETH = 8, LIVES = 3;
// The 2D game's physics, scaled from its pixels (the wheel was 27.5 px).
const GRAV = 83.6, VJ = 29.1, BASE_V = 9.8, BOOST_X = 1.6, SPIN_MAX = 19, STEER_V = 8.5;
const X_MAX = HALF_W - HALF_T - 0.05;
const KEY = 'sindry.roueLibre.full';
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const sec = (n) => n.toFixed(1).replace('.', ',');
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/* ---------- Progress, kept on this computer ---------- */
function fresh(record = 0) {
  return { total: 0, record, course: 1, points: 0, lives: LIVES, broken: [], seed: (Math.random() * 1e9) | 0, stats: { speed: 0, turbo: 0 } };
}
let save = fresh();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.stats) save = Object.assign(fresh(), s); } catch { /* a first game */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* kept for this session only */ } }
const speedOf = () => BASE_V * (1 + 0.08 * save.stats.speed);
const turboOf = () => 2.5 + 0.6 * save.stats.turbo;

/* ---------- A run along one course ---------- */
let T = 0, state = 'accueil', run = null, screenAt = 0, lastRecap = null;
function makeRun() {
  const c = buildCourse(save.course, save.seed);
  SCENE.setCourse(c);
  const missing = new Set(save.broken);
  SCENE.setMissing(missing);
  return { c, s: 0, x: 0, y: RC, vx: 0, vy: 0, ang: 0, lean: 0, ground: true, coyote: 0, buffer: 0, holding: false, hits: 0, missing,
    invul: 0, slow: 1, boost: 0, falling: false, fallHole: null, t: 0, time: 0, endT: 0, bonusN: 0, boostN: 0, parts: [] };
}
const meters = (s) => Math.max(0, Math.round(s * M_PER_UNIT));
const liveScore = (r) => meters(Math.min(r.s, r.c.L)) + r.bonusN * 250;
const fireOf = (r) => clamp01(Math.min(r.boost / 0.5, (turboOf() - r.boost) / 0.25));

function burst(r, x, y, s, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, m = sp * (0.4 + Math.random());
    r.parts.push({ x, y, s, vx: Math.cos(a) * m * 0.6, vy: Math.abs(Math.sin(a)) * m + 3, vs: (Math.random() - 0.5) * m, life: 0.5 + Math.random() * 0.3 });
  }
}
// What holds the wheel up here: a platform under it, the track, or nothing.
function supportUnder(r) {
  let best = holeAt(r.c, r.s) ? -10 : 0;
  for (const p of r.c.plats) {
    if (r.s > p.s0 && r.s < p.s1 && r.x > p.x0 - 0.15 && r.x < p.x1 + 0.15 && r.y - RC >= p.y - 0.05) best = Math.max(best, p.y);
  }
  return best;
}

function hit(r) {
  // The tooth facing forward breaks, and stays broken until repaired.
  const step = (Math.PI * 2) / TEETH;
  let i = ((Math.round((Math.PI / 2 - r.ang) / step) % TEETH) + TEETH) % TEETH;
  for (let k = 0; k < TEETH && r.missing.has(i); k++) i = (i + 1) % TEETH;
  r.missing.add(i); r.hits++;
  save.lives--; save.broken = [...r.missing]; persist();
  SCENE.setMissing(r.missing);
  burst(r, r.x, r.y, r.s - 0.8, 10, 9);
  rumble(save.lives <= 0 ? 420 : 180, save.lives <= 0 ? 1 : 0.6);
  if (save.lives <= 0) { state = 'panne'; r.endT = 0; r.vy = 12; r.ground = false; say('EN PANNE'); return; }
  r.invul = 1.1; r.slow = 0.45;
  if (r.ground) { r.vy = 11; r.ground = false; }
  say('− 1 dent');
}

function update(dt, inp) {
  T += dt;
  const r = run;
  for (const p of r.parts) { p.vy -= GRAV * 0.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.vs * dt; p.life -= dt; }
  r.parts = r.parts.filter((p) => p.life > 0 && p.y > -5);
  if (state !== 'course' && state !== 'arrivee' && state !== 'panne') return;
  r.t += dt;
  let v = speedOf() * r.slow * (r.boost > 0 ? BOOST_X : 1);
  if (state === 'arrivee') { r.endT += dt; v *= Math.max(0.15, 1 - r.endT / 1.3); if (r.endT > 1.1) { finishRun(); return; } }
  if (state === 'panne') { r.endT += dt; v *= Math.max(0, 1 - r.endT * 1.5); if (r.endT > 1) { gameOver(); return; } }
  r.slow = Math.min(1, r.slow + dt * 0.45);
  r.boost = Math.max(0, r.boost - dt);
  r.invul = Math.max(0, r.invul - dt);
  // Steering eases in and out; the wheel leans into its turns.
  const target = state === 'course' ? inp.steer * STEER_V : 0;
  r.vx += (target - r.vx) * Math.min(1, dt * 10);
  r.x = Math.max(-X_MAX, Math.min(X_MAX, r.x + r.vx * dt));
  r.lean = (r.vx / STEER_V) * 0.22;
  r.s += v * dt; r.ang += Math.min(v / RC, SPIN_MAX) * dt;
  if (state === 'course') {
    r.holding = inp.jump;
    r.buffer = Math.max(0, r.buffer - dt);
    if (r.buffer > 0 && (r.ground || r.coyote > 0) && !r.falling) { r.vy = VJ; r.ground = false; r.coyote = 0; r.buffer = 0; }
  }
  const prevBottom = r.y - RC;
  // Released early, the jump is cut short: stronger gravity on the way up.
  r.vy -= GRAV * dt * (!r.holding && r.vy > 0 ? 2.4 : 1);
  r.y += r.vy * dt;
  const bottom = r.y - RC, vyBefore = r.vy, wasGround = r.ground;
  r.ground = false;
  if (!r.falling && r.vy <= 0) {
    for (const p of r.c.plats) {
      if (r.s > p.s0 && r.s < p.s1 && r.x > p.x0 - 0.15 && r.x < p.x1 + 0.15 && prevBottom >= p.y - 0.05 && bottom <= p.y) { r.y = p.y + RC; r.vy = 0; r.ground = true; break; }
    }
    if (!r.ground) {
      const hole = holeAt(r.c, r.s);
      if (!hole && bottom <= 0) { r.y = RC; r.vy = 0; r.ground = true; }
      else if (hole && bottom < -0.25) { r.falling = true; r.fallHole = hole; }
    }
  }
  if (r.ground && !wasGround && vyBefore < -18) burst(r, r.x, 0.1, r.s, 6, 4);
  r.coyote = r.ground ? 0.09 : Math.max(0, r.coyote - dt);
  if (state !== 'course') return;
  if (r.falling && r.y < -9) {
    r.s = r.fallHole.s1 + 1.8; r.y = RC; r.vy = 0; r.falling = false; r.ground = true;
    hit(r);
    if (state === 'course') r.invul = 1.4;
    return;
  }
  if (r.invul <= 0 && !r.falling) {
    for (const o of r.c.obs) {
      if (o.s0 > r.s + 2 || o.s1 < r.s - 2 || r.x + HALF_T <= o.x0 || r.x - HALF_T >= o.x1) continue;
      const hitIt = o.t === 'pics' ? circleRect(r.s, r.y, HIT_R, o.s0 + 0.1, o.s1 - 0.1, 0, o.h - 0.25) : circleRect(r.s, r.y, HIT_R, o.s0, o.s1, 0, o.h);
      if (hitIt) { hit(r); if (state !== 'course') return; break; }
    }
  }
  if (!r.falling) {
    for (const b of r.c.boosts) {
      if (!b.taken && Math.abs(r.x - b.x) < 1.1 && Math.abs(r.s - b.s) < 0.9 && r.y < RC + 0.8) {
        b.taken = true; r.boost = turboOf(); r.boostN++; say('TURBO !'); rumble(120, 0.3);
      }
    }
    for (const b of r.c.bonus) {
      if (!b.taken && Math.hypot(r.x - b.x, r.y - b.y, r.s - b.s) < 1.4) {
        b.taken = true; r.bonusN++; say('+ 250'); burst(r, b.x, b.y, b.s, 10, 6);
      }
    }
  }
  if (r.s >= r.c.L) { state = 'arrivee'; r.endT = 0; r.time = r.t; say('LIGNE FRANCHIE'); }
}

/* ---------- Screens ---------- */
const ov = $('#ecran');
// A key on the keyboard and its button on the gamepad: the page shows the one in use.
const k = (key, pad) => `<kbd class="kb">${key}</kbd>${pad ? `<kbd class="pad">${pad}</kbd>` : ''}`;
const livesHtml = (n) => `<span class="vies">${Array.from({ length: LIVES }, (_, j) => `<i class="${j < n ? 'on' : ''}"></i>`).join('')}</span>`;
function show(html) { ov.innerHTML = html; ov.hidden = false; screenAt = T; }
function hide() { ov.hidden = true; ov.innerHTML = ''; }
const screenWelcome = () => `<div class="carte centre">
  <div class="titre">ROUE LIBRE</div>
  <p>${k('← →', 'Stick')} pour te décaler · ${k('Espace', 'A')} pour sauter, maintenir pour sauter plus haut</p>
  <p class="pale">Course ${save.course} · total ${fmt(save.total)}${save.record ? ` · record ${fmt(save.record)}` : ''}</p>
  <p>${livesHtml(save.lives)}</p>
  <div class="boutons"><button class="primaire" data-act="go">Rouler ${k('Espace', 'A')}</button>${save.points ? `<button data-act="reglages">Réglages <b>${save.points}</b></button>` : ''}</div>
</div>`;
function screenSettings(recap) {
  const rows = recap ? recap.rows.map(([a, b, n]) => `<tr><td>${a}</td><td class="pale">${b}</td><td class="num">${n ? '+ ' + fmt(n) : '—'}</td></tr>`).join('') : '';
  const left = recap ? `<div class="recap"><table>${rows}
      <tr class="somme"><td>Cette course</td><td></td><td class="num">${fmt(recap.total)}</td></tr>
      <tr class="total"><td>Score total</td><td></td><td class="num">${fmt(recap.grand)}</td></tr></table></div>` : '';
  const can = save.points > 0, canFix = can && save.lives < LIVES;
  const row = (key, pad, name, level, act, ok, desc) => `<div class="regl"><span>${k(key, pad)}</span><span>${name}</span><span class="niv">${level}</span>
    <button data-act="${act}" ${ok ? '' : 'disabled'} aria-label="${name}">+</button><span class="pale">${desc}</span></div>`;
  return `<div class="carte reglages">
    <div class="entete"><b>${recap ? 'Ligne franchie' : 'Réglages'}</b><span class="pale">${recap ? `Course ${recap.course} · ${fmt(recap.meters)} m` : `Course ${save.course} à venir`}</span></div>
    <div class="cols${recap ? '' : ' seule'}">${left}<div>
      <div class="points">${save.points ? `<b>${save.points}</b> réglage${save.points > 1 ? 's' : ''} à placer` : 'Aucun réglage à placer'} <span class="pale">· +1 par ligne, +1 sans faute</span></div>
      ${row('1', 'X', 'Vitesse', `niv. ${save.stats.speed}`, 'speed', can, '+8 % de vitesse de croisière')}
      ${row('2', 'Y', 'Turbo', `niv. ${save.stats.turbo}`, 'turbo', can, '+0,6 s à chaque turbo')}
      <div class="sep"></div>
      ${row('3', 'LB', 'Réparer', livesHtml(save.lives), 'repair', canFix, save.lives < LIVES ? 'rend toutes les dents cassées' : 'aucune dent à rendre')}
    </div></div>
    <div class="boutons"><button class="primaire" data-act="go">${recap ? 'Course suivante' : 'Rouler'} ${k('Espace', 'A')}</button></div>
  </div>`;
}
const screenPause = () => `<div class="carte centre"><div class="titre">PAUSE</div><p>${k('Échap', 'Start')} ou ${k('Espace', 'A')} pour reprendre</p></div>`;
const screenOver = (p) => `<div class="carte centre">
  <div class="titre">EN PANNE</div>
  <p>Plus de dent de réserve, à ${fmt(p.meters)} m sur ${fmt(p.totalM)} : partie terminée à la course ${p.course}.</p>
  <p>Total de la partie : <b>${fmt(p.total)}</b>${p.best ? ' · nouveau record !' : ` · record ${fmt(p.record)}`}</p>
  <p class="pale">Tout repart de zéro : course 1, réglages à zéro, ${LIVES} dents de réserve.</p>
  <div class="boutons"><button class="primaire" data-act="go">Nouvelle partie ${k('Espace', 'A')}</button></div>
</div>`;

function welcome() { state = 'accueil'; run = makeRun(); show(screenWelcome()); }
function start() { if (state !== 'course') { if (state !== 'accueil') run = makeRun(); state = 'course'; hide(); run.holding = false; run.buffer = 0; } }
function pause() { if (state === 'course') { state = 'pause'; show(screenPause()); } }
function resume() { state = 'course'; hide(); run.holding = false; }
function openSettings(recap) { lastRecap = recap; state = 'reglages'; show(screenSettings(recap)); }
function finishRun() {
  const r = run, c = r.c, m = meters(c.L), par = c.L / BASE_V;
  const clean = r.hits === 0, chrono = Math.max(0, Math.round((par - r.time) * 25));
  const rows = [
    ['Distance', `${fmt(m)} m`, m],
    ['Bonus', `${r.bonusN} / 2`, r.bonusN * 250],
    ['Ligne franchie', '', 500],
    ['Sans faute', clean ? 'aucune dent perdue' : `${r.hits} dent${r.hits > 1 ? 's' : ''} perdue${r.hits > 1 ? 's' : ''}`, clean ? 300 : 0],
    ['Chrono', `${sec(r.time)} s pour ${sec(par)} s`, chrono],
  ];
  const total = rows.reduce((a, q) => a + q[2], 0);
  save.total += total; save.points += clean ? 2 : 1; save.course = c.n + 1; persist();
  openSettings({ rows, total, grand: save.total, meters: m, course: c.n });
}
// Out of teeth: the game is over, its total becomes the record to beat.
function gameOver() {
  const r = run, m = meters(r.s), score = m + r.bonusN * 250;
  const total = save.total + score, best = total > save.record;
  const p = { meters: m, totalM: meters(r.c.L), course: r.c.n, total, best, record: Math.max(save.record, total) };
  save = fresh(p.record); persist();
  state = 'fin'; show(screenOver(p));
}
function buy(stat) {
  if (state !== 'reglages' || save.points <= 0) return;
  save.stats[stat]++; save.points--; persist(); show(screenSettings(lastRecap));
}
function repair() {
  if (state !== 'reglages' || save.points <= 0 || save.lives >= LIVES) return;
  save.lives = LIVES; save.broken = []; save.points--; persist();
  SCENE.setMissing(new Set());
  show(screenSettings(lastRecap));
}
// One action, from a key, a button or a click.
function act(a) {
  if (state === 'course') { if (a === 'jump') { run.buffer = 0.12; } else if (a === 'pause') pause(); return; }
  if (T - screenAt < 0.45 && (a === 'jump' || a === 'ok')) return;   // a mashed jump never skips a screen
  if (state === 'pause') { if (a === 'pause' || a === 'jump' || a === 'ok' || a === 'go') resume(); return; }
  if (state === 'reglages') {
    if (a === 'speed' || a === 'turbo') buy(a); else if (a === 'repair') repair();
    else if (a === 'jump' || a === 'ok' || a === 'go') start();
    return;
  }
  if (state === 'accueil' && a === 'reglages') { openSettings(null); return; }
  if ((state === 'accueil' || state === 'fin') && (a === 'jump' || a === 'ok' || a === 'go')) start();
}
ov.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) { screenAt = -1; act(b.dataset.act); } });

/* ---------- HUD ---------- */
let sayTimer = 0;
function say(text) { const m = $('#message'); m.textContent = text; m.classList.remove('vu'); void m.offsetWidth; m.classList.add('vu'); clearTimeout(sayTimer); sayTimer = setTimeout(() => m.classList.remove('vu'), 1200); }
function hud() {
  const r = run, c = r.c;
  $('#course').textContent = `COURSE ${c.n}`;
  $('#distance').textContent = `${fmt(meters(Math.min(r.s, c.L)))} / ${fmt(meters(c.L))} m`;
  $('#vies').innerHTML = livesHtml(save.lives);
  $('#score').textContent = fmt(liveScore(r));
  $('#total').textContent = `TOTAL ${fmt(save.total)}${save.record ? ` · RECORD ${fmt(save.record)}` : ''}`;
  $('#compteurs').textContent = `BONUS ${r.bonusN}/2 · TURBO ${r.boostN}/2`;
  $('#avance').style.width = `${clamp01(r.s / c.L) * 100}%`;
  const tb = $('#turbo');
  tb.hidden = r.boost <= 0;
  if (r.boost > 0) tb.querySelector('i').style.width = `${(r.boost / turboOf()) * 100}%`;
}

/* ---------- The loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
  last = now;
  const inp = poll();
  document.body.classList.toggle('manette', !!inp.pad);
  for (const a of inp.actions) act(a);
  update(dt, inp);
  const r = run, ground = r.falling ? -10 : supportUnder(r);
  SCENE.render({ s: r.s, x: r.x, y: r.y, ang: r.ang, lean: r.lean, ground, boost: r.boost > 0 ? fireOf(r) : 0,
    invisible: r.invul > 0 && Math.floor(T * 12) % 2 === 1, t: T, parts: r.parts, course: r.c });
  hud();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => SCENE.resize());
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

SCENE.init($('#scene'));
welcome();
requestAnimationFrame(frame);
// For tests only: ?debug in the address shows the game's state to the console.
if (new URLSearchParams(location.search).has('debug')) window.__roueLibre = { get run() { return run; }, get state() { return state; }, get save() { return save; }, act };
