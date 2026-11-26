// Project storage in IndexedDB. One record per project: { id, name, main, files, created, updated }.
// files maps a path to { t: string } (text) or { b: Uint8Array } (binary).
const DB = 'texbench', VER = 2;      // 2: the versions store (version history)
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result, have = (n) => d.objectStoreNames.contains(n);
      if (!have('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!have('kv')) d.createObjectStore('kv');
      // version history: { id, pid, at, name, auto, files: { path: text }, main, words }
      if (!have('versions')) d.createObjectStore('versions', { keyPath: 'id' }).createIndex('pid', 'pid');
    };
    r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; d.onclose = () => { dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error || new Error('The browser storage could not be opened.')); };
    r.onblocked = () => { dbp = null; rej(new Error('The browser storage is in use by another tab with an older version of the app. Close the other tabs and reload.')); };
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  // every save settles: complete, error and abort (quota full, storage cleared, the tab closing) all end the promise
  return new Promise((res, rej) => {
    let t; try { t = d.transaction(store, mode); } catch (e) { dbp = null; return rej(e); }
    let rq; try { rq = fn(t.objectStore(store)); } catch (e) { try { t.abort(); } catch {} return rej(e); }
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error || new Error('The browser did not save.'));
    t.onabort = () => rej(t.error || new Error('Saving was stopped by the browser (storage full or not available).'));
  });
}
export const store = {
  list: async () => (await tx('projects', 'readonly', s => s.getAll())).map(({ id, name, updated }) => ({ id, name, updated })).sort((a, b) => b.updated - a.updated),
  get: (id) => tx('projects', 'readonly', s => s.get(id)),
  put: (p) => tx('projects', 'readwrite', s => s.put(p)),
  // save only if nobody saved a newer revision since this tab read the project (base = the revision it read or
  // last saved). Read and write happen in one transaction, so two tabs cannot both pass the check.
  // Resolves { rev } or { conflict: <the stored, newer project> }; nothing is written on a conflict.
  async save(p, base) {
    const d = await db();
    return new Promise((res, rej) => {
      let t; try { t = d.transaction('projects', 'readwrite'); } catch (e) { dbp = null; return rej(e); }
      const s = t.objectStore('projects'); let out = null;
      const g = s.get(p.id);
      g.onsuccess = () => {
        const cur = g.result;
        if (cur && (cur.rev || 0) > (base || 0)) { out = { conflict: cur }; return; }
        const rev = (cur?.rev || 0) + 1, keep = p.rev; p.rev = rev;
        try { s.put(p); out = { rev }; } catch (e) { p.rev = keep; try { t.abort(); } catch {} }
      };
      t.oncomplete = () => out ? res(out) : rej(new Error('The browser did not save.'));
      t.onerror = () => rej(t.error || new Error('The browser did not save.'));
      t.onabort = () => rej(t.error || new Error('Saving was stopped by the browser (storage full or not available).'));
    });
  },
  versions: {
    add: (v) => tx('versions', 'readwrite', s => s.put(v)),
    get: (id) => tx('versions', 'readonly', s => s.get(id)),
    del: (id) => tx('versions', 'readwrite', s => s.delete(id)),
    // newest first; without the file texts when light (for the list)
    list: async (pid, light = true) => (await tx('versions', 'readonly', s => s.index('pid').getAll(pid))).map(v => light ? { ...v, files: undefined, paths: Object.keys(v.files || {}) } : v).sort((a, b) => b.at - a.at),
    delAll: async (pid) => { for (const v of await store.versions.list(pid)) await store.versions.del(v.id); },
  },
  del: (id) => tx('projects', 'readwrite', s => s.delete(id)),
  kvGet: (k) => tx('kv', 'readonly', s => s.get(k)),
  kvSet: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  kvDel: (k) => tx('kv', 'readwrite', s => s.delete(k)),
};
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('tb:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tb:' + k, JSON.stringify(v)); } catch {} },
};
const TEXT_EXT = /\.(tex|bib|sty|cls|bst|txt|md|mod|csv|tsv|dat|json|bbx|cbx|def|cfg|clo|ltx|tikz|m|py|jl|r|inc|dyn|yaml|yml)$/i;
export const isTextPath = (p) => TEXT_EXT.test(p) || !/\.[a-z0-9]+$/i.test(p);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
