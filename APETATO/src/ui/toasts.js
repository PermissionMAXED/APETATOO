// APETATO ui/toasts — bottom-right notification queue.
// Listens forever on bus 'achievement:unlock' {id}, 'unlock:new' {kind, id}
// and 'chaos:modifier' {id, name, description}; each toast lives ~4s and
// they stack upward.

import { el, mount, contentById } from './dom.js';
import { Content } from '../content/registry.js';
import { ACHIEVEMENT_DEFS } from '../meta/achievements.js';

const TOAST_MS = 4000;
const LEAVE_MS = 260;
const MAX_TOASTS = 5;

export function initToasts(ctx, layer) {
  const { bus } = ctx;

  function achievementName(id) {
    const defs = Array.isArray(ACHIEVEMENT_DEFS) ? ACHIEVEMENT_DEFS : [];
    for (const d of defs) {
      if (d && d.id === id) return d.name || id;
    }
    return id;
  }

  /** Resolve an unlockable's display name from the content registry. */
  function unlockName(kind, id) {
    const KEYS = {
      character: 'characters', characters: 'characters',
      weapon: 'weapons', weapons: 'weapons',
      arena: 'arenas', arenas: 'arenas',
      mode: 'modes', modes: 'modes',
      item: 'items', items: 'items',
    };
    const key = KEYS[kind];
    if (key) {
      const def = contentById(Content, key, id);
      if (def && def.name) return def.name;
    }
    return id;
  }

  function show(kindLabel, name, desc) {
    // Oldest toast makes room when the stack is full.
    while (layer.children.length >= MAX_TOASTS) {
      layer.removeChild(layer.firstChild);
    }
    const toast = mount(layer, el('div', 'toast'));
    mount(toast, el('div', 'toast-kind', kindLabel));
    mount(toast, el('div', 'toast-name', name));
    if (desc) mount(toast, el('div', 'toast-desc', desc));

    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => {
        if (toast.parentNode === layer) layer.removeChild(toast);
      }, LEAVE_MS);
    }, TOAST_MS);
  }

  bus.on('achievement:unlock', (payload) => {
    const id = payload && payload.id;
    if (!id) return;
    const defs = Array.isArray(ACHIEVEMENT_DEFS) ? ACHIEVEMENT_DEFS : [];
    const def = defs.find((d) => d && d.id === id);
    show('🏆 Achievement', achievementName(id), def && !def.secret ? def.description : '');
  });

  bus.on('unlock:new', (payload) => {
    if (!payload) return;
    const kind = payload.kind || 'unlock';
    const id = payload.id;
    if (!id) return;
    const pretty = String(kind).replace(/s$/, '');
    show('🔓 New ' + pretty, unlockName(kind, id), '');
  });

  // Chaos Run rolls a modifier each wave — make sure players actually see it
  // (the HUD also shows a persistent badge; this is the loud announcement).
  bus.on('chaos:modifier', (payload) => {
    if (!payload || !payload.name) return;
    show('🌀 Chaos modifier', payload.name, payload.description || '');
  });

  return { show };
}
