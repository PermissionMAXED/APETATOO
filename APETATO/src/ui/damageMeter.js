// APETATO ui/damageMeter — per-weapon damage bar chart.
// Builds a DOM fragment from runStats.dpsLog (Map of weaponId -> damage
// dealt), sorted descending, each row showing damage + % of total.

import { el, mount, fmtInt, contentById } from './dom.js';
import { Content } from '../content/registry.js';

/**
 * @param {Map|object} dpsLog weaponId -> number (or {damage}/{total})
 * @returns {HTMLElement}
 */
export function createDamageMeter(dpsLog) {
  const wrap = el('div', 'dmg-meter');

  const rows = [];
  const push = (key, val) => {
    let n = 0;
    if (typeof val === 'number') n = val;
    else if (val && typeof val === 'object') {
      n = typeof val.damage === 'number' ? val.damage
        : typeof val.total === 'number' ? val.total
          : typeof val.dps === 'number' ? val.dps : 0;
    }
    if (n > 0) rows.push({ key, damage: n });
  };

  if (dpsLog) {
    if (typeof dpsLog.forEach === 'function' && typeof dpsLog.get === 'function') {
      dpsLog.forEach((val, key) => push(key, val));
    } else if (typeof dpsLog === 'object') {
      for (const key of Object.keys(dpsLog)) push(key, dpsLog[key]);
    }
  }

  rows.sort((a, b) => b.damage - a.damage);
  const total = rows.reduce((acc, r) => acc + r.damage, 0);
  const top = rows.length ? rows[0].damage : 0;

  if (rows.length === 0) {
    mount(wrap, el('div', 'empty-note', 'No damage dealt. Pacifist ape.'));
    return wrap;
  }

  for (const r of rows) {
    const def = contentById(Content, 'weapons', r.key);
    const name = (def && def.name) || String(r.key);
    const pctOfTotal = total > 0 ? Math.round((r.damage / total) * 100) : 0;

    const row = mount(wrap, el('div', 'dmg-row'));
    mount(row, el('div', 'dmg-name', name));
    const bar = mount(row, el('div', 'dmg-bar'));
    const fill = mount(bar, el('div', 'dmg-fill'));
    fill.style.width = (top > 0 ? Math.max(2, Math.round((r.damage / top) * 100)) : 0) + '%';
    mount(row, el('div', 'dmg-num', `${fmtInt(r.damage)} · ${pctOfTotal}%`));
  }

  return wrap;
}
