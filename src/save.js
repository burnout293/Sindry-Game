// The save: everything the game keeps between two sessions, in one versioned
// object. In this browser (localStorage), and in a file the player can take
// away and bring back (export, import).

const KEY = 'sindry.roueLibre.v2', OLD = 'sindry.roueLibre.full';
export const VERSION = 3;

/** A game in progress: the course reached, the score, the teeth left. */
export function freshGame(lives = 3) {
  return { total: 0, course: 1, lives, broken: [], seed: (Math.random() * 1e9) | 0 };
}
export function blank() {
  // Coins, items and skins outlive a game: only the course, the score and the teeth start over.
  return { version: VERSION, record: 0, game: null, played: 0, metres: 0, savedAt: null,
    coins: 0, items: {}, mode: null, dare: null, skins: ['origine'], skin: 'origine' };
}
// Only what the game knows, with the right types: a file from elsewhere
// cannot slip anything else in.
function clean(d) {
  const out = blank();
  if (!d || typeof d !== 'object') return out;
  out.record = Math.max(0, Number(d.record) || 0);
  out.played = Math.max(0, Math.floor(Number(d.played) || 0));
  out.metres = Math.max(0, Number(d.metres) || 0);
  out.savedAt = typeof d.savedAt === 'string' ? d.savedAt : null;
  const g = d.game;
  if (g && typeof g === 'object') {
    const f = freshGame(), n = (v, lo, hi, dflt) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt; };
    out.game = {
      total: Math.max(0, Number(g.total) || 0), course: n(g.course, 1, 999, 1), lives: n(g.lives, 0, 6, 3),
      broken: Array.isArray(g.broken) ? [...new Set(g.broken.map((t) => n(t, 0, 7, 0)))].slice(0, 6) : [],
      seed: n(g.seed, 0, 2 ** 31, f.seed),
    };
    if (out.game.lives <= 0) out.game = null;
  }
  out.coins = Math.max(0, Math.floor(Number(d.coins) || 0));
  if (d.items && typeof d.items === 'object') for (const [k, v] of Object.entries(d.items)) if (/^[a-z]+$/.test(k)) out.items[k] = Math.max(0, Math.min(5, Math.floor(Number(v) || 0)));
  out.mode = ['rapide', 'tranquille'].includes(d.mode) ? d.mode : null;
  out.dare = ['travaux', 'quitte'].includes(d.dare) ? d.dare : null;
  if (Array.isArray(d.skins)) out.skins = [...new Set(['origine', ...d.skins.filter((k) => typeof k === 'string' && /^[a-z]+$/.test(k))])];
  out.skin = out.skins.includes(d.skin) ? d.skin : 'origine';
  return out;
}

export function load() {
  try {
    const now = localStorage.getItem(KEY);
    if (now) return clean(JSON.parse(now));
    // The first version kept the game in progress under another name.
    const old = JSON.parse(localStorage.getItem(OLD) || 'null');
    if (old && old.stats) return clean({ record: old.record, game: old });
  } catch { /* nothing readable: a new save */ }
  return blank();
}
export function store(d) {
  d.savedAt = new Date().toISOString();
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}

/** Hands the save over as a file. */
export function exportFile(d) {
  const blob = new Blob([JSON.stringify({ ...d, jeu: 'Roue libre' }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `roue-libre-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** Reads a save from a file; null if it is not one. */
export async function importFile(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d || d.jeu !== 'Roue libre') return null;
    return clean(d);
  } catch { return null; }
}
