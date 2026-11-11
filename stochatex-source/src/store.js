// Project storage in IndexedDB. One record per project: { id, name, main, files, created, updated }.
// files maps a path to { t: string } (text) or { b: Uint8Array } (binary).
const DB = 'texbench', VER = 1;
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const rq = fn(t.objectStore(store)); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); });
}
export const store = {
  list: async () => (await tx('projects', 'readonly', s => s.getAll())).map(({ id, name, updated }) => ({ id, name, updated })).sort((a, b) => b.updated - a.updated),
  get: (id) => tx('projects', 'readonly', s => s.get(id)),
  put: (p) => tx('projects', 'readwrite', s => s.put(p)),
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
