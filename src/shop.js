// What the coins buy: items that change how a game goes (levels, bought for
// good), one consumable, the dares for the next course, and the skins.

export const ITEMS = [
  { id: 'broyeur', name: 'Broyeur', desc: 'Détruit les caisses en bois au contact.', prices: [400] },
  { id: 'ia', name: 'IA', desc: 'Esquive un obstacle à ta place (trou, portique, caisse…), une fois par niveau et par course.', prices: [300, 650, 1000] },
  { id: 'invest', name: 'Investissement', desc: 'Au départ de chaque course, les pièces gardées rapportent 3 % par niveau.', prices: [500, 900, 1400] },
  { id: 'marqueur', name: 'Marqueur', desc: 'Les bonus sont coloriés en bleu : on les voit de loin.', prices: [150] },
  { id: 'dent', name: 'Dent de réserve', desc: 'Une vie de plus.', prices: [600, 1000, 1600] },
  { id: 'aimant', name: 'Aimant', desc: 'Attire les pièces des voies voisines.', prices: [350] },
  { id: 'turbo', name: 'Turbo prolongé', desc: '+2 s à chaque turbo.', prices: [250, 450, 700] },
  { id: 'bouclier', name: 'Bouclier', desc: 'Le premier choc de chaque course est pardonné.', prices: [450] },
  { id: 'rapide', name: 'Mode rapide', desc: '+25 % de vitesse, +50 % de pièces sur la route.', prices: [400], mode: true },
  { id: 'tranquille', name: 'Mode tranquille', desc: '−20 % de vitesse, −40 % de pièces sur la route.', prices: [200], mode: true },
];
export const REPAIR = { id: 'reparer', name: 'Réparation', desc: 'Rend toutes les dents cassées de la partie en cours.', price: 150 };

/** Dares, for the next course only: a risk for more coins. */
export const DARES = [
  { id: 'travaux', name: 'Travaux', desc: 'Une voie fermée par des travaux toute la course.', gain: 1.5 },
  { id: 'quitte', name: 'Quitte ou double', desc: 'Une seule vie pour la course.', gain: 2 },
];

/** Skins: the wheel's faces, always in ink on white. */
export const SKINS = [
  { id: 'origine', name: 'Origine', price: 0 },
  { id: 'rouille', name: 'Rouille', price: 300 },
  { id: 'pois', name: 'Pois', price: 400 },
  { id: 'rayures', name: 'Rayures', price: 500 },
  { id: 'damier', name: 'Damier', price: 500 },
  { id: 'nuit', name: 'Nuit', price: 800 },
];

export const level = (items, id) => items[id] || 0;
export const priceOf = (item, lvl) => item.prices[lvl] ?? null;   // null: at its last level
