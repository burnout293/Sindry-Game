// Roue libre, the standalone game (0.2): a runner through a city of ink.
//
// Three lanes: switch, jump, slide. Courses that grow longer, bend, climb and
// fork; lives (teeth) that carry over from one course to the next; points to
// spend after each finish line (speed, boost length, repairs), and réglages to
// pick up on the way. A boost lasts until a tooth breaks, and stacks up to x3:
// faster, and the distance counts double, triple, fourfold. The save keeps
// the game in progress and the record; it can be taken away as a file.

import * as SCENE from './scene.js';
import { WHEEL_T } from './scene.js';
import * as FX from './effects.js';
import * as SAVE from './save.js';
import { buildCourse, holeAt, supportAt, hazardsNear, circleRect, M_PER_UNIT, LANES } from './course.js';
import { forkAt } from './track.js';
import { poll, rumble } from './input.js';

const $ = (s) => document.querySelector(s);
const RC = 1, HIT_R = 0.9, HALF_T = WHEEL_T / 2, TEETH = 8, LIVES = 3;
const GRAV = 83.6, VJ = 29.1, DIVE = -42, BASE_V = 15, SPIN_MAX = 22, SLIDE_S = 0.62;
const TURBO_MAX = 3, TURBO_V = 0.22;            // each boost level: +22 % speed, +1 to the distance's multiplier
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const sec = (n) => n.toFixed(1).replace('.', ',');
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/* ---------- The save ---------- */
let data = SAVE.load();
let game = data.game || SAVE.freshGame();
const persist = () => { data.game = game.lives > 0 ? game : null; SAVE.store(data); };
const speedOf = (r) => BASE_V * (1 + 0.08 * game.stats.speed) * (1 + 0.2 * clamp01(r.s / r.c.L)) * (1 + TURBO_V * game.turbo);

/* ---------- A run along one course ---------- */
let T = 0, state = 'accueil', run = null, screenAt = 0, lastRecap = null;
function makeRun() {
  const c = buildCourse(game.course, game.seed);
  SCENE.setCourse(c); SCENE.resetCamera();
  const missing = new Set(game.broken);
  SCENE.setMissing(missing);
  return { c, s: 0, lane: 1, x: 0, y: RC, vy: 0, ground: true, coyote: 0, buffer: 0, holding: false, slide: 0, slideK: 0, slideNext: false,
    hits: 0, missing, invul: 0, slow: 1, branch: null, lastBranch: null, t: 0, time: 0, endT: 0, tokens: 0, score: 0,
    parts: [], trail: [], trailAt: 0, shake: 0, ang: 0, lean: 0, support: 0 };
}
const meters = (s) => Math.max(0, Math.round(s * M_PER_UNIT));
const kmh = (v) => v * M_PER_UNIT * 3.6;

function burst(r, s, x, y, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, m = sp * (0.4 + Math.random());
    r.parts.push({ s, x, y, b: r.branch, vx: Math.cos(a) * m * 0.6, vy: Math.abs(Math.sin(a)) * m + 3, vs: (Math.random() - 0.5) * m, life: 0.5 + Math.random() * 0.3 });
  }
}
function hit(r) {
  // The tooth facing forward breaks, and stays broken until repaired; the boost goes out.
  const step = (Math.PI * 2) / TEETH;
  let i = ((Math.round((Math.PI / 2 - r.ang) / step) % TEETH) + TEETH) % TEETH;
  for (let k = 0; k < TEETH && r.missing.has(i); k++) i = (i + 1) % TEETH;
  r.missing.add(i); r.hits++;
  game.lives--; game.broken = [...r.missing]; game.turbo = 0; persist();
  SCENE.setMissing(r.missing);
  burst(r, r.s - 0.6, r.x, r.y, 14, 10);
  FX.fx('hit'); r.shake = 0.7;
  rumble(game.lives <= 0 ? 450 : 200, game.lives <= 0 ? 1 : 0.7);
  if (game.lives <= 0) { state = 'panne'; r.endT = 0; r.vy = 12; r.ground = false; say('EN PANNE'); return; }
  r.invul = 1.2; r.slow = 0.5;
  if (r.ground) { r.vy = 11; r.ground = false; }
  say('− 1 dent');
}
function hits(r, o) {
  if (r.x + HALF_T <= o.x0 || r.x - HALF_T >= o.x1) return false;
  if (r.slideK > 0.5) {                          // lying on its side: low and long
    const yb = r.y - RC;
    return r.s + 0.95 > o.s0 && r.s - 0.95 < o.s1 && yb + 0.95 > o.y0 && yb < o.y1;
  }
  return circleRect(r.s, r.y, HIT_R, o.s0, o.s1, o.y0, o.y1);
}

function update(dt, inp) {
  T += dt;
  const r = run;
  for (const p of r.parts) { p.vy -= GRAV * 0.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.vs * dt; p.life -= dt; }
  r.parts = r.parts.filter((p) => p.life > 0 && p.y > -8);
  r.shake = Math.max(0, r.shake - dt * 2.2);
  if (state !== 'course' && state !== 'arrivee' && state !== 'panne') return;
  r.t += dt;
  let v = speedOf(r) * r.slow;
  if (state === 'arrivee') { r.endT += dt; v *= Math.max(0.15, 1 - r.endT / 1.3); if (r.endT > 1.1) { finishRun(); return; } }
  if (state === 'panne') { r.endT += dt; v *= Math.max(0, 1 - r.endT * 1.5); if (r.endT > 1) { gameOver(); return; } }
  r.speed = v;
  r.slow = Math.min(1, r.slow + dt * 0.5);
  r.invul = Math.max(0, r.invul - dt);
  // Lanes: a quick, eased switch; the wheel leans into it.
  const tx = LANES[r.lane], dx = tx - r.x;
  r.x += dx * Math.min(1, dt * 14);
  if (Math.abs(dx) < 0.01) r.x = tx;
  r.lean = Math.max(-0.35, Math.min(0.35, dx * 0.25));
  // Forward; the branch is chosen as the fork begins, by the side the wheel is on.
  const s0 = r.s;
  r.s += v * dt; r.ang += Math.min(v / RC, SPIN_MAX) * dt;
  const fork = forkAt(r.c.track, r.s);
  if (fork && !(s0 >= fork.s0 && s0 <= fork.s1)) { r.branch = r.x < 0 ? 'A' : 'B'; r.lastBranch = r.branch; }
  if (!fork) r.branch = null;
  if (state === 'course') {
    r.score += (r.s - s0) * M_PER_UNIT * (1 + game.turbo);
    r.holding = inp.jump;
    r.buffer = Math.max(0, r.buffer - dt);
    if (r.buffer > 0 && (r.ground || r.coyote > 0) && !r.falling) { r.vy = VJ; r.ground = false; r.coyote = 0; r.buffer = 0; r.slide = 0; }
  }
  r.slide = Math.max(0, r.slide - dt);
  r.slideK += ((r.slide > 0 ? 1 : 0) - r.slideK) * Math.min(1, dt * 18);
  // Gravity; released early, a jump is cut short.
  const prevBottom = r.y - RC;
  r.vy -= GRAV * dt * (!r.holding && r.vy > 0 ? 2.4 : 1);
  r.y += r.vy * dt;
  const vyBefore = r.vy, wasGround = r.ground;
  const support = supportAt(r.c, r.s, r.x, Math.max(prevBottom, r.y - RC), r.branch);
  r.support = support;
  r.ground = false;
  if (!r.falling) {
    if (r.vy <= 0 && r.y - RC <= support + 0.02) {
      r.y = support + RC; r.vy = 0; r.ground = true;
      if (r.slideNext) { r.slide = SLIDE_S; r.slideNext = false; }
    } else if (support === -Infinity && r.y - RC < -0.3) { r.falling = true; r.fallHole = holeAt(r.c, r.s, r.branch); }
  }
  if (r.ground && !wasGround && vyBefore < -18) { burst(r, r.s, r.x, r.y - RC + 0.1, 8, 4); FX.fx('land'); r.shake = Math.max(r.shake, 0.25); rumble(60, 0.25); }
  r.coyote = r.ground ? 0.09 : Math.max(0, r.coyote - dt);
  // Burnt rubber: where the wheel touched, the last few metres.
  if (r.s - r.trailAt > 0.35) {
    r.trailAt = r.s;
    r.trail.push(r.ground ? { s: r.s, x: r.x, y: support, b: r.branch } : { gap: true, s: r.s });
    while (r.trail.length > 46) r.trail.shift();
  }
  if (state !== 'course') return;
  if (r.falling && r.y < -10) {
    r.s = (r.fallHole ? r.fallHole.s1 : r.s) + 1.8; r.y = RC; r.vy = 0; r.falling = false; r.ground = true; r.trail = [];
    hit(r);
    if (state === 'course') r.invul = 1.5;
    return;
  }
  if (r.invul <= 0 && !r.falling) {
    for (const o of hazardsNear(r.c, r.s, r.branch)) if (hits(r, o)) { hit(r); if (state !== 'course') return; break; }
  }
  if (!r.falling) {
    for (const b of r.c.turbos) {
      if (!b.taken && (b.branch === null || b.branch === r.branch) && Math.abs(r.x - b.x) < 1.1 && Math.abs(r.s - b.s) < 1 && r.y - RC < support + 0.8) {
        b.taken = true; game.turbo = Math.min(TURBO_MAX, game.turbo + 1); persist();
        say(`TURBO ×${game.turbo}`); FX.fx('turbo'); r.shake = 0.55; rumble(220, 0.5);
      }
    }
    for (const b of r.c.reglages) {
      if (!b.taken && (b.branch === null || b.branch === r.branch) && Math.hypot(r.x - b.x, r.y - b.y, r.s - b.s) < 1.5) {
        b.taken = true; r.tokens++; game.points++; persist();
        say('+1 RÉGLAGE'); burst(r, b.s, b.x, b.y, 12, 6); rumble(80, 0.3);
      }
    }
  }
  if (r.s >= r.c.L) { state = 'arrivee'; r.endT = 0; r.time = r.t; say('LIGNE FRANCHIE'); }
}

/* ---------- Screens ---------- */
const ov = $('#ecran');
const k = (key, pad) => `<kbd class="kb">${key}</kbd>${pad ? `<kbd class="pad">${pad}</kbd>` : ''}`;
const livesHtml = (n) => `<span class="vies">${Array.from({ length: LIVES }, (_, j) => `<i class="${j < n ? 'on' : ''}"></i>`).join('')}</span>`;
function show(html) { ov.innerHTML = html; ov.hidden = false; screenAt = T; }
function hide() { ov.hidden = true; ov.innerHTML = ''; }
const screenWelcome = () => `<div class="carte centre">
  <div class="titre">ROUE LIBRE</div>
  <p class="pale">Un jeu de Sindry</p>
  <p>${k('← →', 'Stick')} changer de voie · ${k('↑ Espace', 'A')} sauter · ${k('↓', 'B')} glisser</p>
  ${data.game ? `<p>Partie en cours : course ${game.course} · total ${fmt(game.total)} · ${livesHtml(game.lives)}</p>` : ''}
  ${data.record ? `<p class="pale">Record : ${fmt(data.record)}</p>` : ''}
  <div class="boutons">
    <button class="primaire" data-act="go">${data.game ? 'Continuer' : 'Rouler'} ${k('Espace', 'A')}</button>
    ${data.game ? '<button data-act="neuf">Nouvelle partie</button>' : ''}
    ${data.game && game.points ? `<button data-act="reglages">Réglages <b>${game.points}</b></button>` : ''}
  </div>
  <div class="boutons petits"><button data-act="exporter">Exporter la sauvegarde</button><label class="bouton">Importer…<input type="file" accept=".json,application/json" data-act="importer" hidden></label></div>
  <p class="pale petit">${data.savedAt ? `Sauvegardé le ${new Date(data.savedAt).toLocaleString('fr-FR')}` : 'Rien de sauvegardé pour l’instant'} · gardé dans ce navigateur</p>
</div>`;
function screenSettings(recap) {
  const rows = recap ? recap.rows.map(([a, b, n]) => `<tr><td>${a}</td><td class="pale">${b}</td><td class="num">${n ? '+ ' + fmt(n) : '—'}</td></tr>`).join('') : '';
  const left = recap ? `<div class="recap"><table>${rows}
      <tr class="somme"><td>Cette course</td><td></td><td class="num">${fmt(recap.total)}</td></tr>
      <tr class="total"><td>Score total</td><td></td><td class="num">${fmt(recap.grand)}</td></tr></table></div>` : '';
  const can = game.points > 0, canFix = can && game.lives < LIVES;
  const row = (key, pad, name, level, act, ok, desc) => `<div class="regl"><span>${k(key, pad)}</span><span>${name}</span><span class="niv">${level}</span>
    <button data-act="${act}" ${ok ? '' : 'disabled'} aria-label="${name}">+</button><span class="pale">${desc}</span></div>`;
  return `<div class="carte reglages">
    <div class="entete"><b>${recap ? 'Ligne franchie' : 'Réglages'}</b><span class="pale">${recap ? `Course ${recap.course} · ${fmt(recap.meters)} m` : `Course ${game.course} à venir`}</span></div>
    <div class="cols${recap ? '' : ' seule'}">${left}<div>
      <div class="points">${game.points ? `<b>${game.points}</b> réglage${game.points > 1 ? 's' : ''} à placer` : 'Aucun réglage à placer'} <span class="pale">· +1 par ligne, +1 sans faute, et ceux qu’on ramasse</span></div>
      ${row('1', 'X', 'Vitesse', `niv. ${game.stats.speed}`, 'speed', can, '+8 % de vitesse de croisière')}
      ${row('2', 'Y', 'Turbo', `niv. ${game.stats.turbo}`, 'turbo', can, 'part avec un turbo de plus à chaque course')}
      <div class="sep"></div>
      ${row('3', 'LB', 'Réparer', livesHtml(game.lives), 'repair', canFix, game.lives < LIVES ? 'rend toutes les dents cassées' : 'aucune dent à rendre')}
    </div></div>
    <div class="boutons"><button class="primaire" data-act="go">${recap ? 'Course suivante' : 'Rouler'} ${k('Espace', 'A')}</button></div>
  </div>`;
}
const screenPause = () => `<div class="carte centre"><div class="titre">PAUSE</div><p>${k('Échap', 'Start')} ou ${k('Espace', 'A')} pour reprendre</p>
  <div class="boutons"><button class="primaire" data-act="go">Reprendre</button><button data-act="quitter">Revenir au menu</button></div>
  <p class="pale petit">La partie est sauvegardée à chaque ligne franchie et à chaque dent perdue.</p></div>`;
const screenOver = (p) => `<div class="carte centre">
  <div class="titre">EN PANNE</div>
  <p>Plus de dent de réserve, à ${fmt(p.meters)} m sur ${fmt(p.totalM)} : partie terminée à la course ${p.course}.</p>
  <p>Total de la partie : <b>${fmt(p.total)}</b>${p.best ? ' · nouveau record !' : ` · record ${fmt(p.record)}`}</p>
  <div class="boutons"><button class="primaire" data-act="go">Nouvelle partie ${k('Espace', 'A')}</button></div>
</div>`;

function welcome() { state = 'accueil'; run = makeRun(); show(screenWelcome()); }
function start() {
  if (state === 'fin' || state === 'reglages') run = makeRun();
  // The Turbo setting: each level starts a course with one boost already burning.
  if (run.t === 0 && game.stats.turbo > 0 && game.turbo < Math.min(TURBO_MAX, game.stats.turbo)) { game.turbo = Math.min(TURBO_MAX, game.stats.turbo); FX.fx('turbo'); }
  state = 'course'; hide(); run.holding = false; run.buffer = 0;
  data.game = game; SAVE.store(data);
}
function pause() { if (state === 'course') { state = 'pause'; show(screenPause()); } }
function resume() { state = 'course'; hide(); run.holding = false; }
function openSettings(recap) { lastRecap = recap; state = 'reglages'; show(screenSettings(recap)); }
function finishRun() {
  const r = run, c = r.c, m = meters(c.L), par = c.L / BASE_V;
  const clean = r.hits === 0, chrono = Math.max(0, Math.round((par - r.time) * 25));
  const rows = [
    ['Distance', `${fmt(m)} m`, 0],
    ['Points de route', game.turbo ? `avec le turbo` : '', r.score],
    ['Ligne franchie', '', 500],
    ['Sans faute', clean ? 'aucune dent perdue' : `${r.hits} dent${r.hits > 1 ? 's' : ''} perdue${r.hits > 1 ? 's' : ''}`, clean ? 300 : 0],
    ['Chrono', `${sec(r.time)} s pour ${sec(par)} s`, chrono],
    ['Réglages ramassés', `${r.tokens}`, 0],
  ];
  const total = rows.reduce((a, q) => a + q[2], 0);
  game.total += total; game.points += clean ? 2 : 1; game.course = c.n + 1;
  data.metres += m; persist();
  openSettings({ rows, total, grand: game.total, meters: m, course: c.n });
}
// Out of teeth: the game is over, its total becomes the record to beat.
function gameOver() {
  const r = run, m = meters(r.s);
  const total = game.total + r.score, best = total > data.record;
  const p = { meters: m, totalM: meters(r.c.L), course: r.c.n, total, best, record: Math.max(data.record, total) };
  data.record = p.record; data.played++; data.metres += m;
  game = SAVE.freshGame(); data.game = null; SAVE.store(data);
  state = 'fin'; show(screenOver(p));
}
function buy(stat) {
  if (state !== 'reglages' || game.points <= 0) return;
  game.stats[stat]++; game.points--; persist(); show(screenSettings(lastRecap));
}
function repair() {
  if (state !== 'reglages' || game.points <= 0 || game.lives >= LIVES) return;
  game.lives = LIVES; game.broken = []; game.points--; persist();
  SCENE.setMissing(new Set()); run.missing = new Set();
  show(screenSettings(lastRecap));
}
function newGame() { data.played++; game = SAVE.freshGame(); data.game = null; SAVE.store(data); welcome(); }
// One action, from a key, a button or a click.
function act(a) {
  if (state === 'course') {
    const r = run;
    if (a === 'left') r.lane = Math.max(0, r.lane - 1);
    else if (a === 'right') r.lane = Math.min(2, r.lane + 1);
    else if (a === 'jump') r.buffer = 0.12;
    else if (a === 'down') { if (r.ground) r.slide = SLIDE_S; else { r.vy = Math.min(r.vy, DIVE); r.slideNext = true; } }
    else if (a === 'pause') pause();
    return;
  }
  if (T - screenAt < 0.45 && (a === 'jump' || a === 'ok')) return;   // a mashed jump never skips a screen
  if (state === 'pause') { if (a === 'quitter') { persist(); welcome(); } else if (a === 'pause' || a === 'jump' || a === 'ok' || a === 'go') resume(); return; }
  if (state === 'reglages') {
    if (a === 'speed' || a === 'turbo') buy(a); else if (a === 'repair') repair();
    else if (a === 'jump' || a === 'ok' || a === 'go') start();
    return;
  }
  if (state === 'accueil') {
    if (a === 'reglages') openSettings(null);
    else if (a === 'neuf') newGame();
    else if (a === 'exporter') SAVE.exportFile(data);
    else if (a === 'jump' || a === 'ok' || a === 'go') start();
    return;
  }
  if (state === 'fin' && (a === 'jump' || a === 'ok' || a === 'go')) start();
}
ov.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) { screenAt = -1; act(b.dataset.act); } });
ov.addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'importer' || !e.target.files[0]) return;
  const d = await SAVE.importFile(e.target.files[0]);
  if (!d) { say('FICHIER ILLISIBLE'); return; }
  data = d; game = data.game || SAVE.freshGame(); SAVE.store(data); welcome(); say('SAUVEGARDE CHARGÉE');
});

/* ---------- HUD ---------- */
let sayTimer = 0;
function say(text) { const m = $('#message'); m.textContent = text; m.classList.remove('vu'); void m.offsetWidth; m.classList.add('vu'); clearTimeout(sayTimer); sayTimer = setTimeout(() => m.classList.remove('vu'), 1200); }
function hud() {
  const r = run, c = r.c;
  $('#course').textContent = `COURSE ${c.n}`;
  $('#distance').textContent = `${fmt(meters(Math.min(r.s, c.L)))} / ${fmt(meters(c.L))} m`;
  $('#vies').innerHTML = livesHtml(game.lives);
  $('#score').textContent = fmt(game.total + r.score);
  $('#multi').textContent = game.turbo ? `POINTS ×${1 + game.turbo}` : '';
  $('#total').textContent = `${game.points ? `RÉGLAGES ${game.points} · ` : ''}${data.record ? `RECORD ${fmt(data.record)}` : ''}`;
  $('#avance').style.width = `${clamp01(r.s / c.L) * 100}%`;
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
  const r = run, playing = state === 'course' || state === 'arrivee' || state === 'panne', v = playing ? (r.speed || 0) : 0;
  SCENE.render({ s: r.s, x: r.x, y: r.y, ang: r.ang, lean: r.lean, slide: r.slideK, branch: r.branch, branchPrev: r.lastBranch,
    ground: r.falling ? -Infinity : r.support, turbo: game.turbo, fireK: 1, invisible: r.invul > 0 && Math.floor(T * 12) % 2 === 1,
    t: T, dt, parts: r.parts, trail: r.trail, shake: r.shake, speed: v, course: r.c });
  FX.draw({ dt, t: T, kmh: kmh(v), rush: clamp01((kmh(v) - 110) / 190), turbo: game.turbo, playing });
  hud();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { SCENE.resize(); FX.resize(); });
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

SCENE.init($('#scene'));
FX.init($('#effets'));
welcome();
requestAnimationFrame(frame);
// For tests only: ?debug in the address shows the game's state to the console.
if (new URLSearchParams(location.search).has('debug')) window.__roueLibre = { get run() { return run; }, get state() { return state; }, get game() { return game; }, get data() { return data; }, act };
