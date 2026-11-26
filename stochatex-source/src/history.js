// Version history: snapshots of a project's text files, kept in the browser with the project.
// Automatic snapshots (at most every 5 minutes while the text changes, after a compile or a save) are thinned
// out over time; named versions ("Save a version…") and safety copies made before a restore or a conflict are
// never removed automatically. Compare any version with the current text or with the version before it;
// restore the whole version or one file. Restoring first saves the current state as a version, so nothing is lost.
import { store, uid } from './store.js';
import { h, modal, toast, promptBox, confirmBox } from './ui.js';

const AUTO_GAP = 5 * 60e3, MAX_AUTO = 300;

const textFiles = (p) => {
  const o = {};
  for (const [k, f] of Object.entries(p.files || {})) if (f && f.t != null) o[k] = f.t;
  return o;
};
const words = (files) => Object.entries(files).filter(([k]) => /\.tex$/i.test(k))
  .reduce((n, [, t]) => n + (t.replace(/%.*$/gm, '').replace(/\\[a-zA-Z@]+\*?/g, ' ').match(/[A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*/g) || []).length, 0);
const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => a[k] === b[k]); };

// ---------------------------------------------------------------- line diff (Myers, after trimming the common ends)
export function diffLines(aText, bText) {
  const a = aText.split('\n'), b = bText.split('\n');
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
  const mid = myers(A, B);
  return [...a.slice(0, pre).map(s => ({ t: ' ', s })), ...mid, ...a.slice(a.length - suf).map(s => ({ t: ' ', s }))];
}
function myers(a, b) {
  const n = a.length, m = b.length, max = n + m;
  if (!n) return b.map(s => ({ t: '+', s }));
  if (!m) return a.map(s => ({ t: '-', s }));
  if (max > 40000) return [...a.map(s => ({ t: '-', s })), ...b.map(s => ({ t: '+', s }))];
  const off = max, v = new Int32Array(2 * max + 2), trace = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    if (d > 3000) return [...a.map(s => ({ t: '-', s })), ...b.map(s => ({ t: '+', s }))];     // very different texts
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }
  const out = []; let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d], k = x - y;
    const pk = (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) ? k + 1 : k - 1;
    const px = vv[off + pk], py = px - pk;
    while (x > px && y > py) { out.push({ t: ' ', s: a[x - 1] }); x--; y--; }
    if (d > 0) { if (x === px) out.push({ t: '+', s: b[y - 1] }); else out.push({ t: '-', s: a[x - 1] }); }
    x = px; y = py;
  }
  return out.reverse();
}
// hunks with 3 lines of context
function hunks(ops, ctx = 3) {
  const out = []; let i = 0;
  const idx = []; ops.forEach((o, k) => { if (o.t !== ' ') idx.push(k); });
  if (!idx.length) return out;
  let start = Math.max(0, idx[0] - ctx), end = Math.min(ops.length, idx[0] + ctx + 1);
  for (const k of idx.slice(1)) {
    if (k - ctx <= end) end = Math.min(ops.length, k + ctx + 1);
    else { out.push([start, end]); start = Math.max(0, k - ctx); end = Math.min(ops.length, k + ctx + 1); }
  }
  out.push([start, end]);
  // line numbers in the old and new text at each hunk start
  return out.map(([s, e]) => {
    let ao = 1, bo = 1; for (i = 0; i < s; i++) { if (ops[i].t !== '+') ao++; if (ops[i].t !== '-') bo++; }
    return { a: ao, b: bo, ops: ops.slice(s, e) };
  });
}

// ---------------------------------------------------------------- the history object used by main.js
export function createHistory({ getProject, restoreFiles, canWrite }) {
  let lastAutoAt = 0, lastAutoFiles = null, lastPid = null;

  async function snapshot(p, { name = null, auto = false, reason = '' } = {}) {
    if (!p) return null;
    const files = textFiles(p);
    if (auto) {
      if (lastPid !== p.id) { lastPid = p.id; const l = await store.versions.list(p.id).catch(() => []); const top = l[0] ? await store.versions.get(l[0].id) : null; lastAutoFiles = top?.files || null; lastAutoAt = top?.at || 0; }
      if (Date.now() - lastAutoAt < AUTO_GAP) return null;
      if (lastAutoFiles && same(lastAutoFiles, files)) return null;
    }
    const v = { id: uid(), pid: p.id, at: Date.now(), name, auto, reason, main: p.main || null, files, words: words(files) };
    await store.versions.add(v);
    lastPid = p.id; lastAutoFiles = files; if (auto) lastAutoAt = v.at;
    if (auto) thin(p.id).catch(() => {});
    return v;
  }
  // keep every automatic snapshot of the last 2 hours, one per hour for a week, then one per day (never named ones)
  async function thin(pid) {
    const list = (await store.versions.list(pid)).filter(v => v.auto && !v.name);
    const now = Date.now(), keep = new Set();
    for (const v of list) {
      const age = now - v.at;
      const slot = age < 2 * 3600e3 ? 'r' + v.id : age < 7 * 86400e3 ? 'h' + Math.floor(v.at / 3600e3) : 'd' + Math.floor(v.at / 86400e3);
      if (!keep.has(slot)) { keep.add(slot); v.keep = true; }
    }
    let kept = 0;
    for (const v of list) { if (v.keep && kept < MAX_AUTO) { kept++; continue; } await store.versions.del(v.id); }
  }
  const auto = (reason) => { const p = getProject(); if (p && canWrite()) return snapshot(p, { auto: true, reason }).catch(() => null); };

  // ---------------------------------------------------------------- the window
  async function open() {
    const p = getProject(); if (!p) return;
    let list = await store.versions.list(p.id);
    let sel = null, mode = 'current', cache = new Map();
    const get = async (id) => cache.get(id) || (cache.set(id, await store.versions.get(id)), cache.get(id));
    const listEl = h('div', { class: 'hist-list', role: 'listbox', 'aria-label': 'Versions' });
    const right = h('div', { class: 'hist-right' });
    const fmt = (t) => { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return (today ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })) + ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    const label = (v) => v.name || (v.reason ? v.reason : 'Automatic');
    function drawList() {
      listEl.replaceChildren(
        h('button', { class: 'hist-item cur' + (sel === null ? ' on' : ''), role: 'option', onClick: () => { sel = null; drawList(); drawRight(); } },
          h('b', {}, 'Now'), h('span', {}, `${words(textFiles(p)).toLocaleString()} words · the text as it is`)),
        ...list.map(v => h('button', { class: 'hist-item' + (sel === v.id ? ' on' : '') + (v.name ? ' named' : ''), role: 'option', 'aria-selected': String(sel === v.id), onClick: () => { sel = v.id; drawList(); drawRight(); } },
          h('b', {}, fmt(v.at)), h('span', {}, label(v) + ` · ${(v.words || 0).toLocaleString()} words`))),
        list.length ? '' : h('p', { class: 'muted', style: { padding: '8px' } }, 'No versions yet. They are saved automatically while you work (at most every 5 minutes), or with “Save a version…”.'));
    }
    async function drawRight() {
      if (sel === null) { right.replaceChildren(h('p', { class: 'muted' }, 'Choose a version on the left to see what changed and to restore it.')); return; }
      const v = await get(sel); if (!v) return;
      const idx = list.findIndex(x => x.id === sel), prev = list[idx + 1] ? await get(list[idx + 1].id) : null;
      const base = mode === 'current' ? textFiles(getProject()) : (prev?.files || {});
      const from = mode === 'current' ? v.files : (prev?.files || {}), to = mode === 'current' ? base : v.files;
      // in "current" mode: what changed from the version to now; in "previous": from the version before to this one
      const paths = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
      const changed = paths.filter(k => from[k] !== to[k]);
      const head = h('div', { class: 'hist-head' },
        h('div', {}, h('b', {}, label(v)), ' · ', fmt(v.at)),
        h('div', { class: 'hist-seg', role: 'group' },
          h('button', { class: mode === 'current' ? 'on' : '', onClick: () => { mode = 'current'; drawRight(); } }, 'This version → now'),
          h('button', { class: mode === 'prev' ? 'on' : '', disabled: !prev, title: prev ? '' : 'This is the oldest version', onClick: () => { mode = 'prev'; drawRight(); } }, 'Previous → this version')),
        h('div', { class: 'hist-acts' },
          h('button', { class: 'primary small', onClick: () => restore(v, null) }, 'Restore this version'),
          h('button', { class: 'small', onClick: async () => { const n = await promptBox(v.name ? 'Rename version' : 'Name this version', 'Name', v.name || ''); if (n == null) return; const full = await get(v.id); full.name = n.trim() || null; await store.versions.add(full); cache.set(v.id, full); list = await store.versions.list(p.id); drawList(); drawRight(); } }, v.name ? 'Rename' : 'Name it'),
          h('button', { class: 'small ghost', onClick: async () => { if (!await confirmBox('Delete this version?', `${label(v)}, ${fmt(v.at)}. The current text is not affected.`, 'Delete')) return; await store.versions.del(v.id); list = await store.versions.list(p.id); sel = null; drawList(); drawRight(); } }, 'Delete')));
      const body = h('div', { class: 'hist-diff' });
      if (!changed.length) body.append(h('p', { class: 'muted' }, mode === 'current' ? 'No differences: the text is the same as in this version.' : 'No differences from the version before.'));
      for (const k of changed) {
        const ops = diffLines(from[k] ?? '', to[k] ?? '');
        const add = ops.filter(o => o.t === '+').length, del = ops.filter(o => o.t === '-').length;
        const file = h('details', { class: 'hist-file', open: changed.length <= 4 },
          h('summary', {}, h('code', {}, k), ` `, h('span', { class: 'hist-add' }, '+' + add), ' ', h('span', { class: 'hist-del' }, '−' + del),
            from[k] == null ? ' (new file)' : to[k] == null ? ' (file removed)' : '',
            h('button', { class: 'small ghost', style: { marginLeft: 'auto' }, onClick: (e) => { e.preventDefault(); restore(v, k); } }, 'Restore this file')));
        const pre = h('div', { class: 'hist-hunks' });
        const hs = hunks(ops);
        hs.slice(0, 60).forEach(hk => {
          pre.append(h('div', { class: 'hist-at' }, `line ${hk.a} → ${hk.b}`));
          let la = hk.a, lb = hk.b;
          for (const o of hk.ops) {
            pre.append(h('div', { class: 'hist-ln ' + (o.t === '+' ? 'ins' : o.t === '-' ? 'del' : '') }, h('span', { class: 'hist-no' }, o.t === '+' ? '' : String(la)), h('span', { class: 'hist-no' }, o.t === '-' ? '' : String(lb)), h('span', { class: 'hist-sg' }, o.t === ' ' ? '' : o.t === '-' ? '−' : '+'), h('span', { class: 'hist-tx' }, o.s || ' ')));
            if (o.t !== '+') la++; if (o.t !== '-') lb++;
          }
        });
        if (hs.length > 60) pre.append(h('p', { class: 'muted' }, `… and ${hs.length - 60} more places.`));
        file.append(pre); body.append(file);
      }
      const same = paths.filter(k => from[k] === to[k]).length;
      if (same && changed.length) body.append(h('p', { class: 'muted' }, `${same} other file${same > 1 ? 's' : ''} unchanged.`));
      right.replaceChildren(head, body);
    }
    async function restore(v, path) {
      const full = await get(v.id); if (!full) return;
      const what = path ? `the file ${path}` : 'every text file of this version';
      if (!await confirmBox(path ? 'Restore this file?' : 'Restore this version?', `This puts back ${what} as it was on ${fmt(v.at)}. The current text is saved first as a version (“Before restoring”), so you can come back to it.` + (path ? '' : ' Files added since then stay; pictures and other non-text files are not changed.'), 'Restore')) return;
      await snapshot(getProject(), { reason: 'Before restoring ' + fmt(v.at) });
      const files = path ? { [path]: full.files[path] } : full.files;
      restoreFiles(files);
      toast(path ? `Restored ${path} from ${fmt(v.at)}.` : `Restored the version from ${fmt(v.at)}.`);
      list = await store.versions.list(p.id); cache = new Map(); sel = null; mode = 'current'; drawList(); drawRight();
    }
    const saveBtn = h('button', { class: 'small', onClick: async () => { const n = await promptBox('Save a version', 'Name (for example “Sent to supervisor”)', ''); if (n == null) return; await snapshot(getProject(), { name: n.trim() || 'Saved version' }); list = await store.versions.list(p.id); drawList(); } }, 'Save a version…');
    drawList(); drawRight();
    modal({ title: 'Version history', wide: true, body: h('div', { class: 'hist' }, h('div', { class: 'hist-left' }, saveBtn, listEl), right), buttons: [{ label: 'Close' }] });
  }

  return { snapshot, auto, open, name: async () => { const n = await promptBox('Save a version', 'Name (for example “Sent to supervisor”)', ''); if (n != null) { await snapshot(getProject(), { name: n.trim() || 'Saved version' }); toast('Version saved. See it in Version history.'); } } };
}
