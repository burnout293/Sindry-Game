// Roue libre, the standalone game (0.3): a runner through a city of ink.
//
// Three lanes: switch, jump, slide. Long courses that bend, climb and fork;
// teeth (lives) that carry over from one course to the next. Coins on the road
// buy items in the shop (crusher, AI, interest, marker, more teeth…) and skins
// in another; a dare can raise the stakes of the next course. A boost lasts a
// few seconds, stacks up to x3: faster, and the distance counts double, triple,
// fourfold. Coins, items and skins outlive a game; the course and the score
// start over. The save can be taken away as a file.

import * as SCENE from './scene.js';
import { WHEEL_T } from './scene.js';
import * as FX from './effects.js';
import * as SAVE from './save.js';
import * as ART from './art.js';
import { ITEMS, REPAIR, DARES, SKINS, level, priceOf } from './shop.js';
import { buildCourse, holeAt, supportAt, hazardsNear, circleRect, M_PER_UNIT, LANES } from './course.js';
import { forkAt } from './track.js';
import { poll, rumble, listenTouch } from './input.js';

const $ = (s) => document.querySelector(s);
const RC = 1, HIT_R = 0.9, HALF_T = WHEEL_T / 2, TEETH = 8;
const GRAV = 83.6, VJ = 29.1, DIVE = -42, BASE_V = 15, SPIN_MAX = 22, SLIDE_S = 0.62;
const TURBO_MAX = 3, TURBO_V = 0.22, TURBO_S = 4;   // each level: +22 % speed, +1 to the distance's multiplier
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const sec = (n) => n.toFixed(1).replace('.', ',');
const clamp01 = (u) => Math.max(0, Math.min(1, u));

/* ---------- The save ---------- */
let data = SAVE.load();
let game = data.game || SAVE.freshGame(maxLives());
function maxLives() { return 3 + level(data.items, 'dent'); }
const persist = () => { data.game = game.lives > 0 ? game : null; SAVE.store(data); };
const modeSpeed = () => (data.mode === 'rapide' ? 1.25 : data.mode === 'tranquille' ? 0.8 : 1);
const modeCoins = () => (data.mode === 'rapide' ? 1.5 : data.mode === 'tranquille' ? 0.6 : 1);
const speedOf = (r) => BASE_V * modeSpeed() * (1 + 0.2 * clamp01(r.s / r.c.L)) * (1 + TURBO_V * r.turbo);

/* ---------- A run along one course ---------- */
let T = 0, state = 'menu', run = null, screenAt = 0;
function makeRun() {
  const dare = data.dare, blocked = dare === 'travaux' ? Math.floor(Math.random() * 3) : null;
  const c = buildCourse(game.course, game.seed, { blocked, coins: modeCoins() });
  SCENE.setMarker(level(data.items, 'marqueur') > 0);
  SCENE.setSkin(data.skin);
  SCENE.setCourse(c); SCENE.resetCamera();
  const missing = new Set(game.broken);
  SCENE.setMissing(missing);
  const lane = blocked === 1 ? 0 : 1;
  return { c, dare, s: 0, lane, x: LANES[lane], y: RC, vy: 0, ground: true, coyote: 0, buffer: 0, holding: false, slide: 0, slideK: 0, slideNext: false,
    hits: 0, missing, invul: 0, slow: 1, branch: null, lastBranch: null, t: 0, time: 0, endT: 0, score: 0, coins: 0, coinAt: 0,
    turbo: 0, turboT: 0, ia: level(data.items, 'ia'), iaWait: 0, shield: level(data.items, 'bouclier'), interest: 0, livesBefore: game.lives,
    parts: [], trail: [], trailAt: 0, shake: 0, ang: 0, lean: 0, support: 0, started: false };
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
  if (r.shield > 0) { r.shield--; r.invul = 1.2; r.slow = 0.7; FX.fx('land'); say('BOUCLIER'); rumble(120, 0.4); return; }
  // The tooth facing forward breaks, and stays broken until repaired; the boost goes out.
  const step = (Math.PI * 2) / TEETH;
  let i = ((Math.round((Math.PI / 2 - r.ang) / step) % TEETH) + TEETH) % TEETH;
  for (let k = 0; k < TEETH && r.missing.has(i); k++) i = (i + 1) % TEETH;
  r.missing.add(i); r.hits++; r.turbo = 0; r.turboT = 0;
  game.lives--; game.broken = [...r.missing]; persist();
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
  if (r.slideK > 0.5) { const yb = r.y - RC; return r.s + 0.95 > o.s0 && r.s - 0.95 < o.s1 && yb + 0.95 > o.y0 && yb < o.y1; }
  return circleRect(r.s, r.y, HIT_R, o.s0, o.s1, o.y0, o.y1);
}
// The AI item: now and then, it dodges for you what is about to hit.
function assist(r, v) {
  if (r.ia <= 0 || r.iaWait > 0 || !r.ground || r.slide > 0) return;
  const reach = r.s + v * 0.24;
  const hole = holeAt(r.c, reach, r.branch) && !holeAt(r.c, r.s, r.branch);
  const o = !hole && hazardsNear(r.c, reach, r.branch).find((q) => q.s0 > r.s && q.s0 < reach && r.x + HALF_T > q.x0 && r.x - HALF_T < q.x1 && q.y0 < r.y + RC && !(q.t === 'caisse' && level(data.items, 'broyeur')));
  if (!hole && !o) return;
  if (o && o.t === 'portique') r.slide = SLIDE_S; else { r.vy = VJ; r.ground = false; r.holding = true; }
  r.ia--; r.iaWait = 3; r.iaHold = true; say('IA : ESQUIVE');
}

function update(dt, inp) {
  T += dt;
  const r = run;
  for (const p of r.parts) { p.vy -= GRAV * 0.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.vs * dt; p.life -= dt; }
  r.parts = r.parts.filter((p) => p.life > 0 && p.y > -8);
  r.shake = Math.max(0, r.shake - dt * 2.2);
  if (state !== 'course' && state !== 'arrivee' && state !== 'panne') return;
  r.t += dt;
  r.turboT = Math.max(0, r.turboT - dt);
  if (r.turboT <= 0) r.turbo = 0;
  let v = speedOf(r) * r.slow;
  if (state === 'arrivee') { r.endT += dt; v *= Math.max(0.15, 1 - r.endT / 1.3); if (r.endT > 1.1) { finishRun(); return; } }
  if (state === 'panne') { r.endT += dt; v *= Math.max(0, 1 - r.endT * 1.5); if (r.endT > 1) { gameOver(); return; } }
  r.speed = v;
  r.slow = Math.min(1, r.slow + dt * 0.5);
  r.invul = Math.max(0, r.invul - dt);
  r.iaWait = Math.max(0, r.iaWait - dt);
  const tx = LANES[r.lane], dx = tx - r.x;
  r.x += dx * Math.min(1, dt * 14);
  if (Math.abs(dx) < 0.01) r.x = tx;
  r.lean = Math.max(-0.35, Math.min(0.35, dx * 0.25));
  const s0 = r.s;
  r.s += v * dt; r.ang += Math.min(v / RC, SPIN_MAX) * dt;
  const fork = forkAt(r.c.track, r.s);
  if (fork && !(s0 >= fork.s0 && s0 <= fork.s1)) { r.branch = r.x < 0 ? 'A' : 'B'; r.lastBranch = r.branch; }
  if (!fork) r.branch = null;
  if (state === 'course') {
    r.score += (r.s - s0) * M_PER_UNIT * (1 + r.turbo);
    r.holding = inp.jump || (r.iaHold && r.vy > 0);   // the AI holds its jumps all the way up
    r.buffer = Math.max(0, r.buffer - dt);
    if (r.buffer > 0 && (r.ground || r.coyote > 0) && !r.falling) { r.vy = VJ; r.ground = false; r.coyote = 0; r.buffer = 0; r.slide = 0; }
    assist(r, v);
  }
  r.slide = Math.max(0, r.slide - dt);
  r.slideK += ((r.slide > 0 ? 1 : 0) - r.slideK) * Math.min(1, dt * 18);
  const prevBottom = r.y - RC;
  r.vy -= GRAV * dt * (!r.holding && r.vy > 0 ? 2.4 : 1);
  r.y += r.vy * dt;
  const vyBefore = r.vy, wasGround = r.ground;
  const support = supportAt(r.c, r.s, r.x, Math.max(prevBottom, r.y - RC), r.branch);
  r.support = support;
  r.ground = false;
  if (!r.falling) {
    if (r.vy <= 0 && r.y - RC <= support + 0.02) {
      r.y = support + RC; r.vy = 0; r.ground = true; r.iaHold = false;
      if (r.slideNext) { r.slide = SLIDE_S; r.slideNext = false; }
    } else if (support === -Infinity && r.y - RC < -0.3) { r.falling = true; r.fallHole = holeAt(r.c, r.s, r.branch); }
  }
  if (r.ground && !wasGround && vyBefore < -18) { burst(r, r.s, r.x, r.y - RC + 0.1, 8, 4); FX.fx('land'); r.shake = Math.max(r.shake, 0.25); rumble(60, 0.25); }
  r.coyote = r.ground ? 0.09 : Math.max(0, r.coyote - dt);
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
  if (!r.falling) {
    for (const o of hazardsNear(r.c, r.s, r.branch)) {
      if (!hits(r, o)) continue;
      if (o.t === 'caisse' && level(data.items, 'broyeur')) {   // the crusher: crates fly to bits
        o.gone = true; r.c.obs.splice(r.c.obs.indexOf(o), 1);
        burst(r, o.s0, (o.x0 + o.x1) / 2, 0.8, 16, 9); FX.fx('land'); r.shake = Math.max(r.shake, 0.3); say('CRAC'); rumble(90, 0.5);
        continue;
      }
      if (r.invul <= 0) { hit(r); if (state !== 'course') return; }
      break;
    }
    for (const b of r.c.turbos) {
      if (!b.taken && (b.branch === null || b.branch === r.branch) && Math.abs(r.x - b.x) < 1.1 && Math.abs(r.s - b.s) < 1 && r.y - RC < support + 0.8) {
        b.taken = true; r.turbo = Math.min(TURBO_MAX, r.turbo + 1); r.turboT = TURBO_S + 2 * level(data.items, 'turbo');
        say(`TURBO ×${r.turbo}`); FX.fx('turbo'); r.shake = 0.55; rumble(220, 0.5);
      }
    }
    // Coins: in reach of the wheel (or of the magnet).
    const reachX = level(data.items, 'aimant') ? 2.6 : 0.95, coins = r.c.coins;
    while (r.coinAt < coins.length && coins[r.coinAt].s < r.s - 4) r.coinAt++;
    for (let i = r.coinAt; i < coins.length && coins[i].s < r.s + 1.3; i++) {
      const b = coins[i];
      if (b.taken || (b.branch !== null && b.branch !== r.branch)) continue;
      if (Math.abs(r.s - b.s) < 1.1 && Math.abs(r.x - b.x) < reachX && Math.abs(r.y - b.y) < (reachX > 1 ? 3 : 1.4)) { b.taken = true; r.coins++; }
    }
  }
  if (r.s >= r.c.L) { state = 'arrivee'; r.endT = 0; r.time = r.t; say('LIGNE FRANCHIE'); }
}

/* ---------- Screens ---------- */
const ov = $('#ecran');
const k = (key, pad) => `<kbd class="kb">${key}</kbd>${pad ? `<kbd class="pad">${pad}</kbd>` : ''}`;
const livesHtml = (n, max = maxLives()) => `<span class="vies">${Array.from({ length: max }, (_, j) => `<i class="${j < n ? 'on' : ''}"></i>`).join('')}</span>`;
const coinHtml = (n) => `<span class="piece"></span><b>${fmt(n)}</b>`;
function show(html) {
  ov.innerHTML = html; ov.hidden = false; screenAt = T;
  const first = ov.querySelector('button.primaire:not(:disabled)') || ov.querySelector('button:not(:disabled)');
  focusOn(first);
}
function hide() { ov.hidden = true; ov.innerHTML = ''; }
function focusOn(b) { ov.querySelectorAll('.focus').forEach((q) => q.classList.remove('focus')); if (b) { b.classList.add('focus'); b.scrollIntoView({ block: 'nearest' }); } }
// The directions move between the buttons of a screen, by their place on it.
function moveFocus(dir) {
  const all = [...ov.querySelectorAll('button:not(:disabled), label.bouton')], cur = ov.querySelector('.focus');
  if (!cur) return focusOn(all[0]);
  const a = cur.getBoundingClientRect(), cx = a.x + a.width / 2, cy = a.y + a.height / 2;
  let best = null, bestD = Infinity;
  for (const b of all) {
    if (b === cur) continue;
    const q = b.getBoundingClientRect(), x = q.x + q.width / 2 - cx, y = q.y + q.height / 2 - cy;
    const along = dir === 'left' ? -x : dir === 'right' ? x : dir === 'up' ? -y : y, across = dir === 'left' || dir === 'right' ? Math.abs(y) : Math.abs(x);
    if (along <= 4) continue;
    const d = along + across * 2.5;
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) focusOn(best);
}

const header = (title, back = true) => `<div class="entete"><b>${title}</b><span>${coinHtml(data.coins)}${back ? ` <button data-act="menu">Retour ${k('Retour', 'B')}</button>` : ''}</span></div>`;
function screenMenu() {
  const dare = DARES.find((d) => d.id === data.dare);
  return `<div class="carte centre menu">
  <div class="titre">ROUE LIBRE</div>
  <p class="pale">Un jeu de Sindry</p>
  <p class="aide">${k('← →', 'Stick')} changer de voie · ${k('↑ Espace', 'A')} sauter · ${k('↓', '↓')} glisser · <span class="tactile">sur téléphone : glisse le doigt, touche pour sauter</span></p>
  <p>${coinHtml(data.coins)} ${data.record ? ` · record ${fmt(data.record)}` : ''}</p>
  ${data.game ? `<p>Partie en cours : course ${game.course} · total ${fmt(game.total)} · ${livesHtml(game.lives)}</p>` : ''}
  <div class="boutons"><button class="primaire" data-act="go">${data.game ? 'Continuer' : 'Rouler'} ${k('Espace', 'A')}</button>${data.game ? '<button data-act="neuf">Nouvelle partie</button>' : ''}</div>
  <div class="boutons"><button data-act="boutique">Boutique</button><button data-act="skins">Skins</button></div>
  <div class="defis"><span class="pale">Défi pour la prochaine course :</span>
    <button data-act="defi-" class="${data.dare ? '' : 'choisi'}">Aucun</button>
    ${DARES.map((d) => `<button data-act="defi-${d.id}" class="${data.dare === d.id ? 'choisi' : ''}" title="${d.desc}">${d.name} · pièces ×${String(d.gain).replace('.', ',')}</button>`).join('')}
    ${dare ? `<span class="pale petit">${dare.desc}</span>` : ''}</div>
  <div class="boutons petits"><button data-act="exporter">Exporter la sauvegarde</button><label class="bouton">Importer…<input type="file" accept=".json,application/json" data-act="importer" hidden></label></div>
  <p class="pale petit">${data.savedAt ? `Sauvegardé le ${new Date(data.savedAt).toLocaleString('fr-FR')}` : 'Rien de sauvegardé pour l’instant'} · gardé dans ce navigateur</p>
</div>`;
}
function screenShop() {
  const rows = ITEMS.map((it) => {
    const lvl = level(data.items, it.id), price = priceOf(it, lvl), max = it.prices.length;
    const owned = lvl > 0, on = it.mode && data.mode === it.id;
    const right = it.mode && owned
      ? `<button data-act="mode-${it.id}">${on ? 'Retirer' : 'Équiper'}</button>`
      : price === null ? '<span class="pale">au maximum</span>' : `<button data-act="achat-${it.id}" ${data.coins >= price ? '' : 'disabled'}>${coinHtml(price)}</button>`;
    return `<div class="article${on ? ' actif' : ''}"><div><b>${it.name}</b>${max > 1 ? ` <span class="niv">${lvl}/${max}</span>` : owned && !it.mode ? ' <span class="niv">acquis</span>' : ''}<p class="pale">${it.desc}</p></div>${right}</div>`;
  }).join('');
  const canFix = data.game && game.lives < maxLives();
  return `<div class="carte boutique">${header('Boutique')}
    <div class="articles">${rows}
      <div class="article"><div><b>${REPAIR.name}</b><p class="pale">${REPAIR.desc}</p></div><button data-act="reparer" ${canFix && data.coins >= REPAIR.price ? '' : 'disabled'}>${coinHtml(REPAIR.price)}</button></div>
    </div>
    <p class="pale petit">Les modes rapide et tranquille ne s'équipent pas ensemble.</p></div>`;
}
const skinImg = {};
function skinPreview(id) {
  if (!skinImg[id]) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const x = c.getContext('2d'), face = ART.skin(id);
    x.save(); x.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 36 : 44; x.lineTo(48 + Math.cos(a - 0.15) * r, 48 + Math.sin(a - 0.15) * r); x.lineTo(48 + Math.cos(a + 0.15) * r, 48 + Math.sin(a + 0.15) * r); }
    x.closePath(); x.clip(); x.drawImage(face, 0, 0, 96, 96); x.restore();
    x.lineWidth = 3.5; x.strokeStyle = ART.INK; x.stroke(); x.beginPath(); x.arc(48, 48, 12, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.stroke();
    skinImg[id] = c.toDataURL();
  }
  return skinImg[id];
}
function screenSkins() {
  const cards = SKINS.map((s) => {
    const owned = data.skins.includes(s.id), on = data.skin === s.id;
    const act = on ? '<span class="pale">équipé</span>' : owned ? `<button data-act="skin-${s.id}">Équiper</button>` : `<button data-act="skin-${s.id}" ${data.coins >= s.price ? '' : 'disabled'}>${coinHtml(s.price)}</button>`;
    return `<div class="skin${on ? ' actif' : ''}"><img src="${skinPreview(s.id)}" alt=""><b>${s.name}</b>${act}</div>`;
  }).join('');
  return `<div class="carte boutique">${header('Skins')}<div class="skins">${cards}</div></div>`;
}
const screenPause = () => `<div class="carte centre"><div class="titre">PAUSE</div><p>${k('Échap', 'Start')} ou ${k('Espace', 'A')} pour reprendre</p>
  <div class="boutons"><button class="primaire" data-act="go">Reprendre</button><button data-act="menu">Revenir au menu</button></div>
  <p class="pale petit">La partie est sauvegardée à chaque ligne franchie et à chaque dent perdue.</p></div>`;
function screenRecap(rc) {
  const rows = rc.rows.map(([a, b, n]) => `<tr><td>${a}</td><td class="pale">${b}</td><td class="num">${n ? '+ ' + fmt(n) : '—'}</td></tr>`).join('');
  return `<div class="carte reglages">
    <div class="entete"><b>Ligne franchie</b><span class="pale">Course ${rc.course} · ${fmt(rc.meters)} m</span></div>
    <div class="recap"><table>${rows}
      <tr class="somme"><td>Cette course</td><td></td><td class="num">${fmt(rc.total)}</td></tr>
      <tr class="total"><td>Score total</td><td></td><td class="num">${fmt(game.total)}</td></tr>
      <tr><td>Pièces</td><td class="pale">${rc.coinsNote}</td><td class="num">+ ${fmt(rc.coins)}</td></tr></table></div>
    <p>${livesHtml(game.lives)} · ${coinHtml(data.coins)}</p>
    <div class="boutons"><button class="primaire" data-act="go">Course suivante ${k('Espace', 'A')}</button><button data-act="menu">Menu ${k('Retour', 'B')}</button></div>
  </div>`;
}
const screenOver = (p) => `<div class="carte centre">
  <div class="titre">EN PANNE</div>
  <p>Plus de dent de réserve, à ${fmt(p.meters)} m sur ${fmt(p.totalM)} : partie terminée à la course ${p.course}.</p>
  <p>Total de la partie : <b>${fmt(p.total)}</b>${p.best ? ' · nouveau record !' : ` · record ${fmt(p.record)}`}</p>
  <p>${coinHtml(data.coins)} <span class="pale">· les pièces, les objets et les skins sont gardés</span></p>
  <div class="boutons"><button class="primaire" data-act="go">Nouvelle partie ${k('Espace', 'A')}</button><button data-act="menu">Menu</button></div>
</div>`;

function menu() { state = 'menu'; run = makeRun(); show(screenMenu()); }
function start() {
  run = makeRun();                              // a fresh course, with the dare chosen in the menu
  const r = run;
  r.started = true;
  // Interest on the coins kept, paid as the course starts.
  const inv = level(data.items, 'invest');
  if (inv) { r.interest = Math.min(250 * inv, Math.floor(data.coins * 0.03 * inv)); data.coins += r.interest; }
  if (r.dare === 'quitte') game.lives = 1;
  state = 'course'; hide(); r.holding = false; r.buffer = 0;
  if (r.interest) say(`+ ${r.interest} PIÈCES D’INTÉRÊT`);
  data.game = game; SAVE.store(data);
}
function pause() { if (state === 'course') { state = 'pause'; show(screenPause()); } }
function resume() { state = 'course'; hide(); run.holding = false; }
function endDare(r) { if (r.dare === 'quitte' && game.lives > 0) game.lives = r.livesBefore; data.dare = null; }
function finishRun() {
  const r = run, c = r.c, m = meters(c.L), par = c.L / BASE_V;
  const clean = r.hits === 0, chrono = Math.max(0, Math.round((par - r.time) * 25));
  const rows = [
    ['Distance', `${fmt(m)} m`, 0],
    ['Points de route', r.turbo ? 'avec le turbo' : '', r.score],
    ['Ligne franchie', '', 500],
    ['Sans faute', clean ? 'aucune dent perdue' : `${r.hits} dent${r.hits > 1 ? 's' : ''} perdue${r.hits > 1 ? 's' : ''}`, clean ? 300 : 0],
    ['Chrono', `${sec(r.time)} s pour ${sec(par)} s`, chrono],
  ];
  const total = rows.reduce((a, q) => a + q[2], 0), dare = DARES.find((d) => d.id === r.dare);
  const coins = Math.round(r.coins * (dare ? dare.gain : 1));
  game.total += total; game.course = c.n + 1;
  data.coins += coins; data.metres += m;
  endDare(r); persist();
  state = 'recap';
  show(screenRecap({ rows, total, meters: m, course: c.n, coins, coinsNote: `${r.coins} ramassées${dare ? ` × ${String(dare.gain).replace('.', ',')} (${dare.name})` : ''}${r.interest ? ` · ${r.interest} d’intérêts au départ` : ''}` }));
}
// Out of teeth: the game is over, its total becomes the record to beat. The coins picked up stay.
function gameOver() {
  const r = run, m = meters(r.s);
  const total = game.total + r.score, best = total > data.record;
  const p = { meters: m, totalM: meters(r.c.L), course: r.c.n, total, best, record: Math.max(data.record, total) };
  const dare = DARES.find((d) => d.id === r.dare);
  data.coins += Math.round(r.coins * (dare ? dare.gain : 1));
  data.record = p.record; data.played++; data.metres += m; data.dare = null;
  game = SAVE.freshGame(maxLives()); data.game = null; SAVE.store(data);
  state = 'fin'; show(screenOver(p));
}
function buy(id) {
  const it = ITEMS.find((q) => q.id === id), lvl = level(data.items, id), price = it && priceOf(it, lvl);
  if (price === null || price === undefined || data.coins < price) return;
  data.coins -= price; data.items[id] = lvl + 1;
  if (id === 'dent' && data.game) game.lives++;
  if (it.mode) data.mode = id;
  if (id === 'dent' && !data.game) game = SAVE.freshGame(maxLives());
  persist(); show(screenShop()); say(`${it.name.toUpperCase()} !`);
}
function act(a) {
  if (state === 'course') {
    const r = run;
    const blocked = (l) => r.c.works && r.c.works.lane === l;
    if (a === 'left' && r.lane > 0 && !blocked(r.lane - 1)) r.lane--;
    else if (a === 'right' && r.lane < 2 && !blocked(r.lane + 1)) r.lane++;
    else if (a === 'jump' || a === 'up') r.buffer = 0.12;
    else if (a === 'down') { if (r.ground) r.slide = SLIDE_S; else { r.vy = Math.min(r.vy, DIVE); r.slideNext = true; } }
    else if (a === 'pause') pause();
    return;
  }
  if (state === 'arrivee' || state === 'panne') return;
  if (['left', 'right', 'up', 'down'].includes(a)) { moveFocus(a); return; }
  if (T - screenAt < 0.4 && (a === 'jump' || a === 'ok')) return;   // a mashed jump never skips a screen
  if (a === 'jump' || a === 'ok') { const f = ov.querySelector('.focus'); if (f) { f.click(); } return; }
  if (a === 'back' || (a === 'pause' && state !== 'pause')) { if (state === 'pause') resume(); else if (state !== 'menu') { persist(); menu(); } return; }
  if (a === 'pause' && state === 'pause') { resume(); return; }
  // Buttons.
  if (a === 'menu') { persist(); menu(); return; }
  if (state === 'pause' && a === 'go') { resume(); return; }
  if (a === 'go') { if (state === 'fin') { menuSilently(); } start(); return; }
  if (a === 'neuf') { data.played++; game = SAVE.freshGame(maxLives()); data.game = null; SAVE.store(data); menu(); return; }
  if (a === 'boutique') { state = 'boutique'; show(screenShop()); return; }
  if (a === 'skins') { state = 'skins'; show(screenSkins()); return; }
  if (a === 'exporter') { SAVE.exportFile(data); return; }
  if (a.startsWith('defi-')) { data.dare = a.slice(5) || null; SAVE.store(data); show(screenMenu()); focusOn(ov.querySelector(`[data-act="${a}"]`)); return; }
  if (a.startsWith('achat-')) { buy(a.slice(6)); focusOn(ov.querySelector(`[data-act="${a}"]`)); return; }
  if (a.startsWith('mode-')) { const id = a.slice(5); data.mode = data.mode === id ? null : id; SAVE.store(data); show(screenShop()); focusOn(ov.querySelector(`[data-act="${a}"]`)); return; }
  if (a === 'reparer') { if (data.coins >= REPAIR.price && game.lives < maxLives()) { data.coins -= REPAIR.price; game.lives = maxLives(); game.broken = []; persist(); SCENE.setMissing(new Set()); say('RÉPARÉ'); show(screenShop()); } return; }
  if (a.startsWith('skin-')) {
    const s = SKINS.find((q) => q.id === a.slice(5));
    if (!s) return;
    if (!data.skins.includes(s.id)) { if (data.coins < s.price) return; data.coins -= s.price; data.skins.push(s.id); }
    data.skin = s.id; SAVE.store(data); SCENE.setSkin(s.id); SCENE.setMissing(run.missing); show(screenSkins()); focusOn(ov.querySelector(`[data-act="${a}"]`));
  }
}
function menuSilently() { state = 'menu'; run = makeRun(); }
ov.addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b && !b.disabled) { screenAt = -1; act(b.dataset.act); } });
ov.addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'importer' || !e.target.files[0]) return;
  const d = await SAVE.importFile(e.target.files[0]);
  if (!d) { say('FICHIER ILLISIBLE'); return; }
  data = d; game = data.game || SAVE.freshGame(maxLives()); SAVE.store(data); menu(); say('SAUVEGARDE CHARGÉE');
});
$('#pauseBtn').addEventListener('click', () => { if (state === 'course') pause(); else if (state === 'pause') resume(); });

/* ---------- HUD ---------- */
let sayTimer = 0;
function say(text) { const m = $('#message'); m.textContent = text; m.classList.remove('vu'); void m.offsetWidth; m.classList.add('vu'); clearTimeout(sayTimer); sayTimer = setTimeout(() => m.classList.remove('vu'), 1200); }
function hud() {
  const r = run, c = r.c;
  $('#course').textContent = `COURSE ${c.n}`;
  $('#distance').textContent = `${fmt(meters(Math.min(r.s, c.L)))} / ${fmt(meters(c.L))} m`;
  $('#vies').innerHTML = livesHtml(game.lives);
  $('#score').textContent = fmt(game.total + r.score);
  $('#pieces').innerHTML = coinHtml(data.coins + r.coins);
  $('#multi').textContent = r.turbo ? `TURBO ×${r.turbo} · ${sec(r.turboT)} s` : '';
  $('#objets').textContent = [r.ia ? `IA ${r.ia}` : '', r.shield ? 'BOUCLIER' : '', r.dare ? DARES.find((d) => d.id === r.dare).name.toUpperCase() : ''].filter(Boolean).join(' · ');
  $('#avance').style.width = `${clamp01(r.s / c.L) * 100}%`;
  document.body.classList.toggle('en-course', state === 'course' || state === 'pause' || state === 'arrivee' || state === 'panne');
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
    ground: r.falling ? -Infinity : r.support, turbo: r.turbo, fireK: Math.min(1, r.turboT / 0.6), invisible: r.invul > 0 && Math.floor(T * 12) % 2 === 1,
    t: T, dt, parts: r.parts, trail: r.trail, shake: r.shake, speed: v, course: r.c });
  FX.draw({ dt, t: T, kmh: kmh(v), rush: clamp01((kmh(v) - 110) / 190), turbo: r.turbo, playing });
  hud();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { SCENE.resize(); FX.resize(); });
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

SCENE.init($('#scene'));
FX.init($('#effets'));
listenTouch($('#scene'));
menu();
requestAnimationFrame(frame);
// For tests only: ?debug in the address shows the game's state to the console.
// step(n) plays n frames of 1/60 s by hand: a hidden page has no animation frames.
if (new URLSearchParams(location.search).has('debug')) window.__roueLibre = { get run() { return run; }, get state() { return state; }, get game() { return game; }, get data() { return data; }, act,
  step(n) { for (let i = 0; i < n; i++) { last -= 1000 / 60; frame(performance.now()); } } };
