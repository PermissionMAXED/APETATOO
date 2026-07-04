// APETATO ui/dom — tiny DOM helpers + shared UI formatting utilities.
// Everything in src/ui builds DOM through these; no innerHTML with
// interpolated data anywhere (text nodes only), so content strings are safe.

/**
 * Create an element.
 * @param {string} tag
 * @param {string} [cls] space-separated class list
 * @param {string} [text] textContent
 */
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** Append child to parent, returning the child. */
export function mount(parent, child) {
  parent.appendChild(child);
  return child;
}

/** Remove every child of a node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Create a chunky UI button. Buttons are natively focusable, which the nav
 * manager in ui.js relies on.
 * @param {string} label
 * @param {string} [cls] extra classes
 * @param {Function} [onClick]
 */
export function btn(label, cls, onClick) {
  const b = el('button', 'ui-btn' + (cls ? ' ' + cls : ''), label);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// ---------------------------------------------------------------------------
// Rarity helpers (0 Common, 1 Rare, 2 Epic, 3 Legendary, 4 Mythic).
// ---------------------------------------------------------------------------

export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const RARITY_COLORS = ['#b8c5b0', '#4f9dff', '#b45cff', '#ff9a3d', '#ff4f6e'];

export function rarityName(r) {
  return RARITY_NAMES[clampRarity(r)];
}

export function rarityColor(r) {
  return RARITY_COLORS[clampRarity(r)];
}

/** CSS class 'rar-0'..'rar-4' used by styles.css for borders/tints. */
export function rarityClass(r) {
  return 'rar-' + clampRarity(r);
}

function clampRarity(r) {
  const n = typeof r === 'number' ? Math.round(r) : 0;
  return n < 0 ? 0 : n > 4 ? 4 : n;
}

// ---------------------------------------------------------------------------
// Stat key -> short label mapping (the 28 keys of core/statmodel.js).
// ---------------------------------------------------------------------------

export const STAT_LABELS = {
  maxHp: 'Max HP',
  hpRegen: 'HP Regen',
  lifesteal: 'Lifesteal',
  damagePct: '% Damage',
  meleeDamage: 'Melee Dmg',
  rangedDamage: 'Ranged Dmg',
  elementalDamage: 'Elemental',
  engineering: 'Engineering',
  attackSpeed: 'Atk Speed',
  critChance: 'Crit %',
  critDamage: 'Crit Dmg',
  range: 'Range',
  armor: 'Armor',
  dodge: 'Dodge',
  speed: 'Speed',
  luck: 'Luck',
  harvesting: 'Harvest',
  pickupRange: 'Pickup',
  xpGain: 'XP Gain',
  coinGain: 'Coin Gain',
  knockback: 'Knockback',
  projectileSpeed: 'Proj Speed',
  extraProjectiles: '+Projectiles',
  explosionSize: 'Explosion',
  effectDuration: 'Duration',
  thorns: 'Thorns',
  shieldMax: 'Shield',
  curse: 'Curse',
};

/** Keys whose values read as percentages in the UI. */
const PCT_KEYS = new Set([
  'damagePct', 'attackSpeed', 'critChance', 'critDamage', 'dodge', 'lifesteal',
  'speed', 'pickupRange', 'xpGain', 'coinGain', 'projectileSpeed',
  'explosionSize', 'effectDuration', 'curse',
]);

export function statLabel(key) {
  return STAT_LABELS[key] || key;
}

/** "+5%" / "-10" style signed value string for a stat key. */
export function fmtStatVal(key, v) {
  const n = typeof v === 'number' ? v : 0;
  const rounded = Math.round(n * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return sign + rounded + (PCT_KEYS.has(key) ? '%' : '');
}

/**
 * Build a compact list of stat-mod rows (label + signed colored value).
 * @param {object} mods partial stat map
 * @returns {HTMLElement}
 */
export function statModsList(mods) {
  const wrap = el('div', 'stat-mods');
  if (!mods || typeof mods !== 'object') return wrap;
  for (const key of Object.keys(mods)) {
    const v = mods[key];
    if (typeof v !== 'number' || v === 0) continue;
    const row = el('div', 'stat-row');
    mount(row, el('span', 'stat-name', statLabel(key)));
    mount(row, el('span', 'stat-val ' + (v > 0 ? 'pos' : 'neg'), fmtStatVal(key, v)));
    mount(wrap, row);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Misc formatting
// ---------------------------------------------------------------------------

/** Seconds -> "m:ss". Negative/NaN clamp to 0:00. */
export function fmtTime(sec) {
  let s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  s -= m * 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** Integer with thousands separators for big lifetime numbers. */
export function fmtInt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

/** Local date key 'YYYY-MM-DD' used for the daily challenge. */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Defensive Content access.
// The registry exposes arrays + byId maps but sibling packages are built in
// parallel — never assume an exact shape or that an id resolves.
// ---------------------------------------------------------------------------

/** Array of defs for a collection ('characters', 'weapons', ...). */
export function contentList(content, key) {
  if (!content) return [];
  const v = content[key];
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.list)) return v.list;
  return [];
}

/** Resolve one def by id; tries byId maps then falls back to a scan. */
export function contentById(content, key, id) {
  if (!content || !id) return null;
  const maps = [
    content[key + 'ById'],
    content[key] && content[key].byId,
    content.byId && content.byId[key],
  ];
  for (const m of maps) {
    if (!m) continue;
    const hit = typeof m.get === 'function' ? m.get(id) : m[id];
    if (hit) return hit;
  }
  const list = contentList(content, key);
  for (const d of list) if (d && d.id === id) return d;
  return null;
}

/** Human text for a def.unlock condition. */
export function unlockHint(unlock) {
  if (!unlock || unlock.type === 'default') return '';
  if (unlock.type === 'wins') return `Win ${unlock.count || 1} run${(unlock.count || 1) > 1 ? 's' : ''}`;
  if (unlock.type === 'buy') return `Buy for ${unlock.cost || '?'} golden bananas`;
  if (unlock.type === 'achievement') return `Achievement: ${unlock.name || unlock.id || '???'}`;
  return 'Locked';
}
