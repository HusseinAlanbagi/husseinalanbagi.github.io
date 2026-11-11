// The module host. Every optional feature is a module: one JavaScript file whose default export is
//   { id, name, description, category, defaultEnabled, activate(ctx) }
// A module only talks to the editor through `ctx`; everything it registers is removed when it is switched off.
import { prefs, store } from './store.js';

export function createModuleHost(app) {
  const mods = new Map();     // id -> { mod, source, enabled, dispose[] , error }
  const scope = (id) => {
    const rec = mods.get(id), track = (off) => (rec.dispose.push(off), off);
    const wrap = (obj, names) => Object.fromEntries(names.map(n => [n, (...a) => track(obj[n](...a))]));
    return {
      app: { name: app.name, version: app.version },
      cm: app.editor.cm, h: app.ui.h,
      editor: { ...app.editor, ...wrap(app.editor, ['addCompletionSource', 'addExtension', 'addKeymap']) },
      project: app.project,
      ui: { ...app.ui, ...wrap(app.ui, ['addPanel', 'addToolbarButton', 'addCommand', 'addStatusItem']) },
      compile: { run: app.compile, last: () => app.lastResult },
      pdf: app.pdf,
      goto: app.goto,
      problems: { set: (list) => app.setProblems(id, list), clear: () => app.setProblems(id, []) },
      on: (name, fn) => track(app.events.on(name, fn)),
      settings: { get: (k, d) => prefs.get(`m:${id}:${k}`, d), set: (k, v) => prefs.set(`m:${id}:${k}`, v) },
      onDispose: (fn) => track(fn),
    };
  };
  async function load(url, source, fileName) {
    try {
      const mod = (await import(/* @vite-ignore */ url)).default;
      if (!mod || !mod.id || typeof mod.activate !== 'function') throw new Error('not a module (needs a default export with id and activate)');
      if (mods.has(mod.id) && mods.get(mod.id).enabled) disable(mod.id, false);
      mods.set(mod.id, { mod, source, fileName, enabled: false, dispose: [] });
      if (prefs.get('mod:' + mod.id, mod.defaultEnabled !== false)) enable(mod.id, false);
      return mod;
    } catch (e) { console.error('Module failed to load:', fileName || url, e); app.ui.toast(`Module ${fileName || url} could not be loaded: ${e.message}`, 'err'); return null; }
  }
  function enable(id, remember = true) {
    const rec = mods.get(id); if (!rec || rec.enabled) return;
    rec.dispose = []; rec.error = null;
    try { const off = rec.mod.activate(scope(id)); if (typeof off === 'function') rec.dispose.push(off); rec.enabled = true; }
    catch (e) { rec.error = e.message; console.error(`Module ${id} failed to start`, e); rec.dispose.splice(0).reverse().forEach(f => { try { f(); } catch {} }); }
    if (remember) prefs.set('mod:' + id, true);
    app.events.emit('modules');
  }
  function disable(id, remember = true) {
    const rec = mods.get(id); if (!rec || !rec.enabled) return;
    rec.dispose.splice(0).reverse().forEach(f => { try { f(); } catch (e) { console.error(e); } });
    app.setProblems(id, []);
    rec.enabled = false;
    if (remember) prefs.set('mod:' + id, false);
    app.events.emit('modules');
  }
  return {
    async loadAll() {
      let names = [];
      try { names = await (await fetch(new URL('./modules/index.json', document.baseURI), { cache: 'no-cache' })).json(); } catch (e) { console.error('modules/index.json missing', e); }
      await Promise.all(names.map(n => load(new URL('./modules/' + n, document.baseURI).href, 'built-in', n)));
      for (const u of (await store.kvGet('userModules')) || []) await loadUser(u);
    },
    list: () => [...mods.values()].map(r => ({ id: r.mod.id, name: r.mod.name || r.mod.id, description: r.mod.description || '', category: r.mod.category || 'Other', enabled: r.enabled, source: r.source, fileName: r.fileName, error: r.error })),
    enable, disable, isEnabled: (id) => !!mods.get(id)?.enabled,
    async addUser(fileName, code) {
      const mod = await loadUser({ fileName, code });
      if (!mod) return null;
      const all = ((await store.kvGet('userModules')) || []).filter(u => u.fileName !== fileName);
      all.push({ fileName, code }); await store.kvSet('userModules', all);
      return mod;
    },
    async removeUser(id) {
      const rec = mods.get(id); if (!rec || rec.source !== 'user') return;
      disable(id); mods.delete(id);
      await store.kvSet('userModules', ((await store.kvGet('userModules')) || []).filter(u => u.fileName !== rec.fileName));
      app.events.emit('modules');
    },
  };
  function loadUser(u) {
    const url = URL.createObjectURL(new Blob([u.code], { type: 'text/javascript' }));
    return load(url, 'user', u.fileName);
  }
}
