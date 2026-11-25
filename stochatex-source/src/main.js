// StochaTeX — a free, modular LaTeX editor that runs entirely in the browser.
// Core: project storage, editor, compile, PDF preview, problems. Everything else lives in modules/.
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { store, prefs, isTextPath, uid } from './store.js';
import { duplicates, clashes, tidy } from './packages.js';
import { h, icon, modal, toast, menu, confirmBox, promptBox, splitter, download, pickFiles } from './ui.js';
import { createEditor } from './editor.js';
import { createPdfView } from './pdfview.js';
import { initEngine, compileProject, onEngineLog, engineLog, clearEngineCache } from './engine.js';
import { parseLog } from './logparse.js';
import { explain } from './explain.js';
import { parseSyncTeX, forward, inverse, pageStarts, tagOf } from './synctex.js';
import { createModuleHost } from './modules.js';
import { SAMPLE_MAIN, SAMPLE_BIB, BLANK_MAIN } from './template.js';

const APP_NAME = 'StochaTeX', VERSION = '0.2.0';
const $ = (id) => document.getElementById(id);
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = mac ? '⌘' : 'Ctrl';

// ---------------------------------------------------------------- events
const handlers = new Map();
const events = {
  on(name, fn) { (handlers.get(name) || handlers.set(name, new Set()).get(name)).add(fn); return () => handlers.get(name)?.delete(fn); },
  emit(name, ...a) { handlers.get(name)?.forEach(fn => { try { fn(...a); } catch (e) { console.error(`handler for "${name}" failed`, e); } }); },
};

// ---------------------------------------------------------------- state
let project = null;        // { id, name, main, engine, files }
let active = null;         // path of the file shown in the editor
let saveTimer = null, compileTimer = null, compiling = false, dirty = false, lastResult = null, sync = null;
const problems = new Map();      // source -> [{ severity, file, line, message }]
let quickT = 0;
const commands = new Map();      // id -> { id, name, run, key }

const persist = () => { clearTimeout(saveTimer); if (saveState !== 'unsaved') { const el = document.getElementById('saveState'); if (el) { el.className = 'save-state saving'; el.textContent = 'Saving…'; } } saveTimer = setTimeout(flush, 400); };
const save = () => { persist(); scheduleFolderSync(); };
// Saved / Saving / Not saved, beside the project name. "Saved" only once the browser has committed the save.
let saveState = 'saved', saveErr = null, saveWarned = false;
function setSaveState(st, err) {
  saveState = st; saveErr = err || null;
  let el = document.getElementById('saveState');
  if (!el) { el = h('button', { id: 'saveState', class: 'save-state', onClick: () => saveMenu(el) }); $('projBtn').after(el); }
  el.className = 'save-state ' + st;
  el.textContent = st === 'saving' ? 'Saving…' : st === 'saved' ? 'Saved' : 'Not saved';
  el.title = st === 'unsaved' ? 'This browser did not save your latest changes: ' + (err?.message || 'storage not available') + '. Download a .zip to keep a copy.' : st === 'saved' ? 'Saved in this browser (Ctrl+S saves now). Download a .zip for a copy elsewhere.' : 'Saving in this browser…';
  if (st === 'unsaved' && !saveWarned) { saveWarned = true; toast(h('span', {}, 'This browser could not save your changes (' + (err?.message || 'storage not available') + '). ', h('button', { class: 'small', onClick: () => exportZip() }, 'Download a .zip'), ' ', h('button', { class: 'small', onClick: () => flush() }, 'Try again')), 'err', 0); }
  if (st === 'saved') saveWarned = false;
}
function saveMenu(anchor) {
  menu(anchor, [
    { heading: saveState === 'unsaved' ? 'Not saved: ' + (saveErr?.message || 'storage not available') : saveState === 'saved' ? 'Saved in this browser' : 'Saving…' },
    { label: 'Save now', hint: MOD + '+S', onClick: () => flush() },
    { label: 'Download the project as a .zip', onClick: () => exportZip() },
  ]);
}
const flush = async () => {
  clearTimeout(saveTimer); if (!project) return;
  project.updated = Date.now(); setSaveState('saving');
  try { await store.put(project); setSaveState('saved'); } catch (e) { setSaveState('unsaved', e); }
};
addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
// a newer version of the app was published: offer to reload (the page's files are versioned, so it never mixes old and new)
const APP_V = document.querySelector('meta[name="stx-version"]')?.content || '';
let updateOffered = false, lastCheck = 0;
async function checkUpdate() {
  if (!APP_V || updateOffered || Date.now() - lastCheck < 60000) return; lastCheck = Date.now();
  try {
    const r = await fetch(new URL('./version.json?t=' + Date.now(), document.baseURI), { cache: 'no-store' }); if (!r.ok) return;
    const { v } = await r.json();
    if (v && v !== APP_V) { updateOffered = true; await flush(); toast(h('span', {}, 'A new version of StochaTeX is ready. ', h('button', { class: 'small primary', onClick: async () => { await flush(); location.reload(); } }, 'Reload to update')), '', 0); }
  } catch {}
}
addEventListener('focus', checkUpdate); setInterval(checkUpdate, 15 * 60000); setTimeout(checkUpdate, 20000);
addEventListener('pagehide', () => { flush(); folderSync(); });

// ---------------------------------------------------------------- editor + pdf
const editor = createEditor($('ed'), {
  find: {
    files: () => Object.keys(project?.files || {}), read: (p) => project?.files[p]?.t ?? null, activePath: () => active,
    onOpenFile: (p, from, to) => { if (p !== active) openFile(p); setTimeout(() => { editor.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); }, 30); },
  },
  onChange(path, text) {
    if (!project || !path || !project.files[path]) return;
    project.files[path] = { t: text }; save(); events.emit('change', path, text); scheduleCompile(); checkPackagesSoon(); freshnessSoon(); clearTimeout(mainUiT); mainUiT = setTimeout(refreshMainUI, 600);
  },
  onCursor(state) { const pos = state.selection.main.head, ln = state.doc.lineAt(pos); if (!$('cursorInfo').dataset.note) $('cursorInfo').textContent = `Ln ${ln.number}, Col ${pos - ln.from + 1}`; events.emit('cursor', { line: ln.number, column: pos - ln.from, pos }); crumbsSoon(); },
});
const pdf = createPdfView($('pdf'), {
  onDblClick(page, x, y) { if (!sync) return; const hit = inverse(sync, page, x, y); if (hit && project.files[hit.file]) goto(hit.file, hit.line); },
  onPageInfo(cur, n, zoom) { $('pageInfo').textContent = `${cur} / ${n}`; $('zoomInfo').textContent = zoom + '%'; },
});

// ---------------------------------------------------------------- project api (also used by modules)
const projectApi = {
  get id() { return project?.id; }, get name() { return project?.name; },
  get mainFile() { return mainFile(); }, get activeFile() { return active; },
  files: () => Object.keys(project?.files || {}).sort(pathSort),
  exists: (p) => !!project?.files[p],
  isText: (p) => !!project?.files[p] && project.files[p].t != null,
  read: (p) => { const f = project?.files[p]; return f ? (f.t != null ? f.t : f.b) : null; },
  write(p, content, { open = false } = {}) {
    p = cleanPath(p); if (!p) return;
    const isNew = !project.files[p];
    project.files[p] = typeof content === 'string' ? { t: content } : { b: content };
    if (p === active && typeof content === 'string' && editor.getText() !== content) { const pos = editor.getCursor().pos; editor.open(p, content); editor.setPos(Math.min(pos, content.length)); }
    else if (p !== active) editor.forget(p);
    save(); if (isNew) { renderTree(); events.emit('files'); }
    events.emit('change', p, content); scheduleCompile();
    if (open) openFile(p);
  },
  remove(p) { if (!project.files[p]) return; delete project.files[p]; editor.forget(p); if (project.main === p) project.main = null; if (active === p) { active = null; openFile(mainFile() || projectApi.files()[0]); } save(); renderTree(); events.emit('files'); scheduleCompile(); },
  rename(from, to) { to = cleanPath(to); if (!to || !project.files[from] || project.files[to]) return false; project.files[to] = project.files[from]; delete project.files[from]; editor.rename(from, to); if (project.main === from) project.main = to; if (active === from) { active = to; $('fileName').textContent = to; } save(); renderTree(); events.emit('files'); scheduleCompile(); return true; },
  open: (p) => openFile(p),
  setMain(p) { project.main = p; save(); renderTree(); refreshMainUI(); scheduleCompile(0); toast(`The PDF is now made from ${p}.`); },
};
const cleanPath = (p) => (p || '').replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join('/');
const pathSort = (a, b) => { const da = a.includes('/'), dbb = b.includes('/'); return da === dbb ? a.localeCompare(b) : da ? 1 : -1; };
function mainFile() {
  if (!project) return null;
  if (project.main && project.files[project.main]) return project.main;
  const tex = projectApi.files().filter(p => /\.tex$/i.test(p) && project.files[p].t != null);
  // not chosen yet: main.tex if it has \documentclass, else the \documentclass file that pulls in the most others
  const roots = tex.filter(p => /\\documentclass/.test(project.files[p].t));
  if (roots.length > 1) return roots.find(p => /(^|\/)main\.tex$/i.test(p)) || roots.map(p => [p, partOfMain(p).size]).sort((a, b) => b[1] - a[1])[0][0];
  return roots[0] || tex[0] || null;
}

// ---------------------------------------------------------------- which file makes the PDF
// The files the main file pulls in (\input, \include, \subfile, \import), followed recursively.
function partOfMain(main) {
  const out = new Set(); if (!main) return out;
  const tex = projectApi.files().filter(p => project.files[p]?.t != null);
  const find = (name, from) => {
    const n = name.trim().replace(/^\.\//, ''), dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
    const cands = [n, n + '.tex', dir + n, dir + n + '.tex'].map(x => x.toLowerCase());
    return tex.find(p => cands.includes(p.toLowerCase())) || null;
  };
  const visit = (p) => {
    if (!p || out.has(p)) return; out.add(p);
    const t = (project.files[p].t || '').replace(/(^|[^\\])%.*$/gm, '$1');
    for (const m of t.matchAll(/\\(?:input|include|subfile|subfileinclude)\s*\{([^}]*)\}|\\(?:sub)?import\*?\s*\{([^}]*)\}\s*\{([^}]*)\}/g)) visit(m[1] != null ? find(m[1], p) : find((m[2] || '') + (m[3] || ''), p));
  };
  visit(main); return out;
}
const hasClass = (p) => /\\documentclass/.test((project?.files[p]?.t || '').replace(/(^|[^\\])%.*$/gm, '$1'));
let mainChip = null, mainBar = null, mainBarHidden = new Set();
function refreshMainUI() {
  if (!project) return;
  const main = mainFile();
  if (!mainChip) { mainChip = h('button', { id: 'mainChip', class: 'main-chip', onClick: () => mainMenu(mainChip) }); $('compileBtn').parentNode.prepend(mainChip); }
  mainChip.replaceChildren(h('span', { class: 'mc-l' }, 'PDF from '), h('b', {}, main ? main.split('/').pop() : '—'), icon('chevron', 12));
  mainChip.title = main ? `The PDF is made from ${main}${project.main ? '' : ' (chosen automatically)'}. Click to change the main file.` : 'No .tex file to compile';
  // the open file is not in that PDF: say so where you are working, with the fix
  const notIn = active && /\.tex$/i.test(active) && main && active !== main && !partOfMain(main).has(active) && !mainBarHidden.has(active);
  if (!notIn) { mainBar?.remove(); mainBar = null; return; }
  const own = hasClass(active), name = active.split('/').pop(), mname = main.split('/').pop();
  const bar = h('div', { class: 'main-bar', role: 'status' },
    h('span', {}, h('b', {}, name), ` is not in the PDF: ${mname} does not \\input it.`),
    h('span', { class: 'spacer' }),
    ...(own ? [h('button', { class: 'small primary', onClick: () => projectApi.setMain(active) }, 'Make this the main file'),
      h('button', { class: 'small', title: `Compile ${name} now, keeping ${mname} as the main file`, onClick: () => { onceMain = active; runCompile(); } }, 'Compile this file once')] : []),
    h('button', { class: 'small', onClick: () => openFile(main) }, 'Open ' + mname),
    h('button', { class: 'small ghost icon-only', title: 'Hide this note for this file', 'aria-label': 'Hide', onClick: () => { mainBarHidden.add(active); refreshMainUI(); } }, icon('close')));
  if (mainBar) mainBar.replaceWith(bar); else $('ed').before(bar);
  mainBar = bar;
}
function mainMenu(anchor) {
  const main = mainFile(), tex = projectApi.files().filter(p => /\.tex$/i.test(p) && project.files[p]?.t != null);
  const roots = tex.filter(hasClass), others = tex.filter(p => !hasClass(p));
  menu(anchor, [
    { heading: 'Main file (the PDF is made from it)' },
    ...roots.map(p => ({ label: (p === main ? '✓ ' : ' ') + p, hint: p === main && !project.main ? 'automatic' : '', onClick: () => projectApi.setMain(p) })),
    ...(others.length ? ['-', { heading: 'Files without \\documentclass' }, ...others.slice(0, 12).map(p => ({ label: (p === main ? '✓ ' : ' ') + p, onClick: () => projectApi.setMain(p) }))] : []),
    '-',
    ...(active && active !== main && hasClass(active) ? [{ label: `Compile ${active.split('/').pop()} once`, title: 'Keeps the main file as it is', onClick: () => { onceMain = active; runCompile(); } }] : []),
    { label: 'Open the main file', onClick: () => main && openFile(main) },
  ]);
}
// several files with \documentclass and no choice yet: ask once which one makes the PDF
async function askMainOnce() {
  if (!project || project.main || project.askedMain) return;
  const roots = projectApi.files().filter(p => /\.tex$/i.test(p) && hasClass(p));
  if (roots.length < 2) return;
  project.askedMain = true; save();
  const pick = roots.find(p => /(^|\/)main\.tex$/i.test(p)) || roots.find(p => partOfMain(p).size > 1) || roots[0];
  const sel = h('select', { class: 'grow' }, ...roots.map(p => h('option', { value: p, selected: p === pick }, p)));
  modal({ title: 'Which file makes the PDF?', body: h('div', {}, h('p', {}, `${roots.length} files in this project start with \\documentclass. Choose the main file: the PDF is made from it, and the files it \\inputs.`), h('label', { class: 'field' }, 'Main file', sel), h('p', { class: 'muted' }, 'You can change it any time with “PDF from …” beside Compile.')),
    buttons: [{ label: 'Later' }, { label: 'Use this file', primary: true, onClick: (m) => { m.close(); projectApi.setMain(sel.value); } }] });
}

// ---------------------------------------------------------------- ui api (also used by modules)
const ui = {
  h, modal, toast, menu, confirm: confirmBox, prompt: promptBox, download, pickFiles,
  icon,
  // A panel in the side bar, reached from the rail on the far left.
  addPanel({ id, title, render, icon: ic }) {
    const body = h('div', { class: 'panel-body', 'data-panel': id, hidden: true });
    $('panels').append(body); render(body);
    const off = addRail(id, title, ic || 'outline');
    return () => { off(); body.remove(); };
  },
  // where: 'editor' (the bar above the source, the default) or 'top' (the top bar, icon only)
  addToolbarButton({ label, title, onClick, icon: ic, where = 'editor' }) {
    const top = where === 'top';
    const b = h('button', { class: 'ghost' + (top ? ' icon-only' : ''), title: title || label, 'aria-label': label, onClick }, ic ? icon(ic) : null, top && ic ? null : h('span', { class: 'lbl' }, label));
    $(top ? 'topTools' : 'toolbar').append(b); const off = () => b.remove(); off.el = b; return off;
  },
  // The dock: a strip under the source for a tool that works alongside it. One tool at a time.
  openDock({ title, info = '', body, actions = [], height = 300, onClose }) {
    closeDock();
    $('dockTitle').textContent = title; $('dockInfo').textContent = info;
    $('dockActions').replaceChildren(...actions); $('dockBody').replaceChildren(body);
    document.documentElement.style.setProperty('--dock-h', prefs.get('dockH', height) + 'px');
    $('dock').hidden = false; dockOnClose = onClose || null; editor.view.requestMeasure();
    return { close: closeDock, setInfo: (t) => { $('dockInfo').textContent = t; $('dockInfo').title = t; }, get open() { return !$('dock').hidden && $('dockBody').firstChild === body; } };
  },
  addEditorButton(el) { $('edButtons').append(el); return () => el.remove(); },
  addStatusItem(render) { const el = h('span', { class: 'status-item' }); $('statusItems').append(el); render(el); return () => el.remove(); },
  addCommand(cmd) { commands.set(cmd.id, cmd); clearTimeout(quickT); quickT = setTimeout(() => drawQuick(), 100); return () => { commands.delete(cmd.id); clearTimeout(quickT); quickT = setTimeout(() => drawQuick(), 100); }; },
  runCommand: (id) => commands.get(id)?.run(),
  setTheme(name) { document.documentElement.dataset.theme = name; },
};

let dockOnClose = null;
function closeDock() { if ($('dock').hidden) return; $('dock').hidden = true; $('dockBody').replaceChildren(); const f = dockOnClose; dockOnClose = null; f && f(); editor.view.requestMeasure(); }
// ---------------------------------------------------------------- rail + side panels
const rail = new Map();        // id -> { title, btn }
let sidePanel = null;
function addRail(id, title, ic) {
  const btn = h('button', { class: 'rail-btn', title, 'aria-label': title, onClick: () => showPanel(id, true) }, icon(ic, 19));
  rail.set(id, { title, btn }); $('railPanels').append(btn);
  if (prefs.get('sidePanel', 'files') === id && !document.body.classList.contains('side-off')) showPanel(id);
  return () => { btn.remove(); rail.delete(id); if (sidePanel === id) showPanel('files'); };
}
// Clicking a rail icon opens its panel (and keeps it open if it already is); hiding the side bar is deliberate:
// the « button in its header or Ctrl+\ (setSide).
function setSide(open) { document.body.classList.toggle('side-off', !open); prefs.set('sideOff', !open); for (const [k, r] of rail) r.btn.classList.toggle('on', open && k === sidePanel); editor.view.requestMeasure(); }
function showPanel(id, toggle = false) {
  if (!rail.has(id)) id = 'files';
  const off = false;
  document.body.classList.toggle('side-off', off); prefs.set('sideOff', off);
  sidePanel = id; if (!off) prefs.set('sidePanel', id);
  for (const [k, r] of rail) r.btn.classList.toggle('on', k === id && !off);
  for (const el of $('panels').children) el.hidden = el.dataset.panel !== id;
  $('sideTitle').textContent = rail.get(id).title; $('sideActions').hidden = id !== 'files';
  editor.view.requestMeasure();
}
// ---------------------------------------------------------------- app object
const app = {
  name: APP_NAME, version: VERSION, editor, project: projectApi, ui, events, pdf,
  compile: () => runCompile(), get lastResult() { return lastResult; },
  // page starts in a file from the last compile, with the length of that file's text when it was compiled
  pageStarts: (file) => sync && lastResult?.sizes ? { lines: pageStarts(sync, file), size: lastResult.sizes[file] } : null,
  goto, setProblems(source, list) { problems.set(source, list); if (!list.length) problems.delete(source); renderProblems(); },
};
const modules = createModuleHost(app);
window.texbench = window.stochatex = { app, modules, openFolder: (d) => openFolder(d), linkFolder: (d) => linkFolder(d), folder: () => folder, folderPull: (o) => folderPull(o), folderSync: () => folderSync(), createProject: (n, f) => createProject(n, f) };       // handy for debugging and for module authors

function goto(file, line) {
  if (!project.files[file]) return;
  if (file !== active) openFile(file);
  if (line) editor.gotoLine(line);
}

// ---------------------------------------------------------------- files
function openFile(path) {
  if (!project || !path || !project.files[path]) return;
  if (active && active !== path && project.files[active]) events.emit('leave', active);
  active = path; project.lastOpen = path;
  const f = project.files[path];
  $('fileName').textContent = path;
  const text = f.t != null;
  $('ed').hidden = !text; $('binview').hidden = text;
  if (text) { editor.open(path, f.t); applyDiagnostics(); }
  else showBinary(path, f.b);
  renderTree(); events.emit('open', path); checkPackagesSoon(); crumbsSoon(); refreshMainUI();
}
let binUrl = null;
function showBinary(path, bytes) {
  if (binUrl) URL.revokeObjectURL(binUrl);
  const ext = path.split('.').pop().toLowerCase(), box = $('binview');
  const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', pdf: 'application/pdf' }[ext];
  binUrl = type ? URL.createObjectURL(new Blob([bytes], { type })) : null;
  box.replaceChildren(type === 'application/pdf' ? h('iframe', { src: binUrl, title: path }) : type ? h('img', { src: binUrl, alt: path }) : h('p', { class: 'muted' }, `${path} — ${(bytes.length / 1024).toFixed(1)} KB. This file type cannot be shown here, but it is part of the project and available to LaTeX.`));
}
function renderTree() {
  const main = mainFile(), box = $('tree');
  const rows = [], seen = new Set();
  for (const p of projectApi.files()) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!seen.has(d)) { seen.add(d); rows.push(h('div', { class: 'tree-dir', style: { paddingLeft: 12 + (i - 1) * 14 + 'px' } }, icon('folder', 13), parts[i - 1])); } }
    rows.push(h('div', { class: 'tree-file' + (p === active ? ' on' : ''), style: { paddingLeft: 12 + (parts.length - 1) * 14 + 'px' }, title: p, onClick: () => openFile(p), onContextmenu: (e) => { e.preventDefault(); fileMenu(p, { x: e.clientX, y: e.clientY }); } },
      h('span', { class: 'fname' }, parts[parts.length - 1]), p === main ? h('span', { class: 'star', title: 'Main file (the one that is compiled)' }, 'main') : null,
      h('button', { class: 'ghost icon-only more', title: 'Rename, delete…', 'aria-label': 'File actions for ' + p, onClick: (e) => { e.stopPropagation(); fileMenu(p, e.currentTarget); } }, icon('more', 14))));
  }
  box.replaceChildren(...rows);
}
function fileMenu(p, anchor) {
  menu(anchor, [
    { label: 'Rename…', onClick: async () => { const to = await promptBox('Rename file', 'New name (folders with /)', p); if (to && to !== p && !projectApi.rename(p, to)) toast('A file with that name already exists.', 'err'); } },
    { label: 'Set as main file', disabled: !/\.tex$/i.test(p) || p === mainFile(), onClick: () => projectApi.setMain(p) },
    { label: 'Download', onClick: () => download(new Blob([projectApi.read(p)]), p.split('/').pop()) },
    '-',
    { label: 'Delete', onClick: async () => { if (await confirmBox('Delete file', `Delete ${p}? This cannot be undone.`, 'Delete', true)) projectApi.remove(p); } },
  ]);
}
async function newFile() {
  const name = await promptBox('New file', 'File name (for example sections/intro.tex)', 'untitled.tex');
  if (!name) return;
  const p = cleanPath(name);
  if (project.files[p]) return toast('That file already exists.', 'err');
  projectApi.write(p, '', { open: true });
}
async function addFiles(fileList, prefix = '') {
  let n = 0;
  for (const f of fileList) {
    const p = cleanPath(prefix + (f.webkitRelativePath || f.name));
    if (/\.zip$/i.test(p) && fileList.length === 1) return importZip(f);
    const buf = new Uint8Array(await f.arrayBuffer());
    project.files[p] = isTextPath(p) ? { t: new TextDecoder().decode(buf) } : { b: buf };
    editor.forget(p); n++;
  }
  if (n) { save(); renderTree(); events.emit('files'); scheduleCompile(0); toast(`Added ${n} file${n > 1 ? 's' : ''}.`); if (active && project.files[active]) openFile(active); }
}

// ---------------------------------------------------------------- compile
function scheduleCompile(delay) {
  if (!prefs.get('auto', true) && delay == null) return;
  clearTimeout(compileTimer);
  compileTimer = setTimeout(runCompile, delay ?? prefs.get('delay', 900));
}
let onceMain = null, mainUiT = 0;      // "Compile this file once": the next compile uses this file as main
async function runCompile() {
  clearTimeout(compileTimer);
  if (!project) return;
  if (compiling) { dirty = true; return; }
  const main = onceMain && project.files[onceMain] ? onceMain : mainFile(); onceMain = null;
  if (!main) { setStatus('No .tex file to compile', 'warn'); return; }
  compiling = true; dirty = false;
  setStatus('Compiling…', 'busy');
  const files = new Map(Object.entries(project.files).map(([p, f]) => [p, f.t != null ? f.t : f.b]));
  // the result belongs to this project and this text: if another project is open by the time it comes back, it
  // is thrown away (no errors, PDF, automatic fixes or folder output from the wrong project)
  const proj = project, req = ++compileReq;
  freshness();
  let r;
  try { r = await compileProject(files, main, project.engine || 'pdflatex'); }
  catch (e) { r = { success: false, error: e.message, log: String(e.stack || e), ms: 0 }; }
  compiling = false;
  if (project !== proj || req !== compileReq) { if (project) { setStatus('', ''); runCompile(); } return; }
  lastResult = { ...r, mainFile: main, sizes: Object.fromEntries([...files].map(([p, v]) => [p, typeof v === 'string' ? v.length : 0])) };
  const list = parseLog(r.log, main, Object.keys(project.files));
  if (!r.success && !list.some(p => p.severity === 'error')) list.unshift({ severity: 'error', file: main, line: null, message: r.error || 'Compilation failed. See the log for details.' });
  for (const p of list) if (!p.line && (m => m && (p.key = m[1]))(/database entry for "(.+?)"/.exec(p.message))) {
    for (const f of Object.keys(project.files)) { const t = project.files[f].t; if (t == null || !/\.tex$/i.test(f)) continue; const k = t.split('\n').findIndex(l => new RegExp(`\\\\\\w*cite\\w*\\*?(\\[[^\\]]*\\])*\\{[^}]*\\b${p.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l)); if (k >= 0) { p.file = f; p.line = k + 1; break; } }
  }
  const seen = new Set(list.filter(p => /Citation [`'](.+?)'/.test(p.message)).map(p => /Citation [`'](.+?)'/.exec(p.message)[1]));
  for (let k = list.length - 1; k >= 0; k--) if (list[k].key && seen.has(list[k].key)) list.splice(k, 1);
  problems.set('compile', list); renderProblems();
  if (autoPackages(list)) { compiling = false; dirty = true; }
  $('logText').textContent = r.log || r.error || '';
  const errs = list.filter(p => p.severity === 'error').length, warns = list.filter(p => p.severity === 'warning').length;
  if (r.success && r.pdf) {
    try { await pdf.load(r.pdf); $('pdfEmpty').hidden = true; } catch (e) { console.error(e); }
    if (project !== proj) { pdf.clear(); $('pdfEmpty').hidden = false; if (project) runCompile(); return; }
    lastOk = { files, at: Date.now(), proj };
    sendPdfToTab(); writePdfToFolder(r.pdf);
    sync = r.syncTexData ? parseSyncTeX(r.syncTexData) : null;
    setStatus(`Compiled in ${(r.ms / 1000).toFixed(1)} s` + (errs ? ` · ${errs} error${errs > 1 ? 's' : ''}` : warns ? ` · ${warns} warning${warns > 1 ? 's' : ''}` : ''), errs ? 'err' : 'ok');
  } else {
    setStatus(`${errs || 1} error${errs > 1 ? 's' : ''} — PDF not updated`, 'err');
    if (!pdf.pageCount) showBottom('problems');
  }
  lastFailed = !(r.success && r.pdf) ? (list.find(p => p.severity === 'error') || { file: main }) : null;
  freshness();
  events.emit('compile', lastResult);
  if (dirty) runCompile();
}
// ---------------------------------------------------------------- is the PDF up to date?
// Saved, compiled and up to date are three different things: the PDF pane says when the preview is older than the text
let compileReq = 0, lastOk = null, lastFailed = null, freshT = 0;
function pdfIsStale() {
  if (!lastOk || lastOk.proj !== project) return false;
  const now = Object.entries(project.files);
  if (now.length !== lastOk.files.size) return true;
  for (const [p, f] of now) { const v = f.t != null ? f.t : f.b; if (lastOk.files.get(p) !== v) return true; }
  return false;
}
function freshnessSoon() { clearTimeout(freshT); freshT = setTimeout(freshness, 300); }
function freshness() {
  const bar = $('pdfFresh'); if (!bar) return;
  const at = lastOk && lastOk.proj === project ? new Date(lastOk.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const stale = pdfIsStale();
  let msg = '', kind = '', act = null;
  if (!at) { bar.hidden = true; return; }
  if (lastFailed) {
    msg = `PDF not updated: the last compile failed. It shows the version from ${at}.`; kind = 'err';
    act = lastFailed.line ? ['Go to the error', () => goto(lastFailed.file, lastFailed.line)] : ['Show problems', () => showBottom('problems')];
  } else if (stale) {
    msg = compiling ? 'Updating the PDF…' : `Preview is out of date: the text changed since ${at}.`; kind = 'warn';
    if (!compiling) act = ['Compile now', () => runCompile()];
  } else { bar.hidden = true; bar.title = ''; $('pdfwrap').dataset.fresh = 'yes'; return; }
  $('pdfwrap').dataset.fresh = 'no';
  bar.className = 'pdf-fresh ' + kind; bar.hidden = false;
  bar.replaceChildren(h('span', {}, msg), act ? h('button', { class: 'ghost small', onClick: act[1] }, act[0]) : '');
}
function setStatus(text, kind = '') { const s = $('status'); s.textContent = text; s.className = 'status ' + kind; $('compileBtn').classList.toggle('busy', kind === 'busy'); }

// ---------------------------------------------------------------- problems + log
// ---------------------------------------------------------------- packages loaded twice, and clashes
let pkgTimer = 0;
function checkPackagesSoon() { clearTimeout(pkgTimer); pkgTimer = setTimeout(checkPackages, 900); }
function checkPackages() {
  if (!project) return;
  const list = [];
  for (const [file, f] of Object.entries(project.files)) {
    if (f.t == null || !/\.(tex|ltx)$/i.test(file) || !/\\usepackage/.test(f.t)) continue;
    for (const d of duplicates(f.t)) {
      const lines = d.uses.map(u => u.line);
      list.push({ severity: 'warning', file, line: lines[lines.length - 1],
        message: `${d.name} is loaded ${d.uses.length === 2 ? 'twice' : d.uses.length + ' times'} (lines ${lines.join(' and ')})`,
        why: d.conflict ? `The copies have options that disagree (${d.conflict}); keep the one you want and delete the other.` : `Loading a package twice does nothing useful and can cause “Option clash” errors.${d.merged && d.merged.length ? ' Keeping one with the options [' + d.merged.join(',') + '].' : ''}`,
        fixes: d.conflict ? [{ label: 'Go to the first', goto: { file, line: lines[0] } }] : [{ label: 'Keep one', edit: { file, run: (t) => { const r = tidy(t, d.name); return r.text === t ? null : r.text; } } }] });
    }
    for (const c of clashes(f.t)) list.push({ severity: 'info', file, line: c.lineB, message: `${c.a} (line ${c.lineA}) and ${c.b} (line ${c.lineB}) do the same job and usually clash`, why: 'Keep the one your paper uses (e.g. natbib or biblatex for citations, subcaption rather than subfig).', fixes: [] });
  }
  problems.set('packages', list); renderProblems();
}
function tidyPackages() {
  const file = active && /\.(tex|ltx)$/i.test(active) ? active : mainFile();
  const before = file === active ? editor.getText() : project.files[file]?.t; if (before == null) return;
  const r = tidy(before);
  if (r.text === before) return toast(r.notes.length ? r.notes.join('. ') + '.' : 'No package is loaded twice.');
  editFile(file, () => r.text); checkPackages();
  toast(r.notes.join('. ') + '. (Ctrl+Z undoes it.)', '', 8000);
}
function allProblems() { return [...problems.entries()].flatMap(([source, list]) => list.map(p => ({ ...p, source: source === 'compile' ? 'LaTeX' : source }))); }
// what a fix needs to know about the project
const explainEnv = () => ({
  main: mainFile(), files: Object.keys(project.files), text: (f) => project.files[f]?.t ?? null,
  labels: () => Object.values(project.files).flatMap(f => f.t ? [...f.t.matchAll(/\\label\{([^}]+)\}/g)].map(m => m[1]) : []),
  bibKeys: () => Object.entries(project.files).flatMap(([p, f]) => /\.bib$/i.test(p) && f.t ? [...f.t.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map(m => m[1]) : []),
});
function explained(p) {
  if (p.source !== 'LaTeX') return p;
  let x = null; try { x = explain(p, explainEnv()); } catch (e) { console.warn('explain', e); }
  return x ? { ...p, title: x.title, why: x.why, fixes: x.fixes } : p;
}
// change a file; the open file is changed through the editor so the change can be undone
function editFile(file, fn) {
  const before = file === active ? editor.getText() : project.files[file]?.t;
  if (before == null) return false;
  const after = fn(before);
  if (after == null || after === before) return false;
  if (file === active) {
    let a = 0; while (a < before.length && a < after.length && before[a] === after[a]) a++;
    let b = 0; while (b < before.length - a && b < after.length - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
    editor.view.dispatch({ changes: { from: a, to: before.length - b, insert: after.slice(a, after.length - b) }, userEvent: 'input.fix', scrollIntoView: true });
  } else projectApi.write(file, after);
  return true;
}
const toPreamble = (text, line) => {
  if (text.split('\n').some(l => l.trim() === line)) return text;
  const bd = text.indexOf('\\begin{document}'); if (bd < 0) return line + '\n' + text;
  const pre = text.slice(0, bd), last = [...pre.matchAll(/^\\(usepackage|RequirePackage|newcommand|newtheorem|DeclareMathOperator)\b.*$/gm)].filter(m => /^\\usepackage/.test(line) ? /^\\usepackage/.test(m[0]) : true).pop();
  let at = last ? last.index + last[0].length + 1 : bd;
  // hyperref and cleveref go last: any other package is put before them
  const lateRe = /^\\usepackage\s*(\[[^\]]*\])?\s*\{(hyperref|cleveref)\}/m, late = lateRe.exec(pre);
  if (late && /^\\usepackage/.test(line) && !lateRe.test(line)) at = Math.min(at, late.index);
  else if (/\{cleveref\}/.test(line)) { const hr = /^\\usepackage.*\{hyperref\}.*$/m.exec(pre); if (hr) at = Math.max(at, hr.index + hr[0].length + 1); }
  return text.slice(0, at) + line + '\n' + text.slice(at);
};
function applyFix(fix) {
  if (fix.goto) { goto(fix.goto.file, fix.goto.line); return; }
  const e = fix.edit; if (!e) return;
  let ok;
  if (e.run) ok = editFile(e.file, e.run);
  else if (e.preamble) ok = editFile(e.file, (t) => toPreamble(t, e.preamble));
  else ok = editFile(e.file, (t) => {
    const lines = t.split('\n'), i = (e.line || 1) - 1; if (i >= lines.length) return null;
    if (e.insertAfter != null) { lines.splice(i + 1, 0, e.insertAfter); return lines.join('\n'); }
    const next = typeof e.find === 'string' ? lines[i].replace(e.find, () => e.replace) : lines[i].replace(e.find, e.replace);
    if (next === lines[i]) return null;
    lines[i] = next; if (e.move && !next.trim()) lines.splice(i, 1);
    return lines.join('\n');
  });
  if (ok && e.move) editFile(e.move.file, (t) => toPreamble(t, e.move.preamble));
  if (ok) { toast('Fixed: ' + fix.label.replace(/^(Add|Change|Use|Write|Escape|Remove|Move|Define it:) ?/, (m) => m.toLowerCase())); if (e.line && e.file) goto(e.file, e.line); }
  else toast('That fix no longer applies: the line has changed.', 'warn');
}
// "Add missing packages automatically" (on by default): a command or environment that a known package provides
// gets its \usepackage line in the preamble, with a note and Undo; then the paper is compiled again.
const autoAdded = new Map(); // project id -> Set of lines added this session (never added twice)
function autoPackages(list) {
  if (!prefs.get('autoPkg', true) || !project) return false;
  const main = mainFile(), done = autoAdded.get(project.id) || new Set(); autoAdded.set(project.id, done);
  const lines = [];
  for (const p of list) {
    if (p.severity !== 'error' || !/^(Undefined control sequence|Environment \S+ undefined)/.test(p.message)) continue;
    const x = explained({ ...p, source: 'LaTeX' }), f = x.fixes && x.fixes[0];
    if (f && f.edit && /^\\usepackage/.test(f.edit.preamble || '') && !done.has(f.edit.preamble) && !lines.includes(f.edit.preamble)) lines.push(f.edit.preamble);
  }
  if (!lines.length) return false;
  const before = main === active ? editor.getText() : project.files[main]?.t;
  lines.sort((x, y) => /cleveref|hyperref/.test(x) - /cleveref|hyperref/.test(y));
  if (!editFile(main, (t) => lines.reduce(toPreamble, t))) return false;
  lines.forEach(l => done.add(l));
  const undo = () => { editFile(main, (t) => t.split('\n').filter((l, i, a) => !lines.includes(l.trim()) || (before || '').split('\n').includes(l)).join('\n')); };
  toast(h('span', {}, `Added ${lines.join(', ')} to the preamble. `, h('button', { class: 'small', onClick: (e) => { e.target.closest('.toast')?.remove(); undo(); } }, 'Undo'), ' ', h('button', { class: 'small ghost', title: 'Stop adding packages by itself (you can turn it back on in the command list)', onClick: (e) => { e.target.closest('.toast')?.remove(); prefs.set('autoPkg', false); toast('Packages will no longer be added automatically.'); } }, 'Turn off')), '', 12000);
  return true;
}
function fixButtons(p) {
  return (p.fixes || []).map(f => h('button', { class: 'fix' + (f.edit ? ' do' : ''), title: f.edit ? 'Make this change' : 'Show it', onClick: (ev) => { ev.stopPropagation(); applyFix(f); } }, f.label));
}
function renderProblems() {
  const order = { error: 0, warning: 1, info: 2 };
  const list = allProblems().map(explained).sort((a, b) => order[a.severity] - order[b.severity]);
  const errs = list.filter(p => p.severity === 'error').length;
  $('tabProblems').textContent = `Problems${list.length ? ` (${list.length})` : ''}`;
  $('tabProblems').classList.toggle('has-err', errs > 0);
  $('problemList').replaceChildren(...(list.length ? list.map(p => h('div', { class: 'problem ' + p.severity },
    h('button', { class: 'p-head', title: p.file ? 'Go to the line' : '', onClick: () => p.file && goto(p.file, p.line) },
      h('span', { class: 'sev', title: p.severity }, p.severity === 'error' ? '●' : p.severity === 'warning' ? '▲' : '○'),
      h('span', { class: 'msg' }, p.title || p.message),
      h('span', { class: 'where' }, (p.source !== 'LaTeX' ? p.source + ' · ' : '') + (p.file || '') + (p.line ? ':' + p.line : ''))),
    p.title || p.context ? h('div', { class: 'p-body' },
      p.why ? h('p', { class: 'p-why' }, p.why) : null,
      h('p', { class: 'p-raw' }, h('span', {}, p.title ? p.message : ''), p.context ? h('code', { title: 'Where TeX stopped reading' }, p.context.length > 90 ? '…' + p.context.slice(-90) : p.context) : null),
      p.fixes?.length ? h('div', { class: 'p-fixes' }, ...fixButtons(p)) : null) : null)) : [h('p', { class: 'muted pad' }, 'No problems found.')]));
  applyDiagnostics();
}
function applyDiagnostics() {
  if (!active || !projectApi.isText(active)) return;
  editor.setDiagnostics(allProblems().filter(p => p.file === active).map(explained).map(p => ({ ...p,
    message: p.title ? p.title + (p.why ? ' — ' + p.why : '') : p.message,
    renderMessage: p.title ? () => h('div', { class: 'diag' }, h('div', { class: 'diag-t' }, p.title), p.why ? h('div', { class: 'diag-w' }, p.why) : null, h('div', { class: 'diag-r' }, p.message), p.fixes?.length ? h('div', { class: 'p-fixes' }, ...fixButtons(p)) : null) : undefined })));
}
function showBottom(which) {
  const open = which && !(document.body.dataset.bottom === which);
  document.body.dataset.bottom = open ? which : '';
  $('tabProblems').classList.toggle('on', open && which === 'problems'); $('tabLog').classList.toggle('on', open && which === 'log');
  $('problemList').hidden = !(open && which === 'problems'); $('logText').hidden = !(open && which === 'log');
  $('bottomBody').hidden = !open;
}

// ---------------------------------------------------------------- projects
async function loadProject(p) {
  await flush(); await folderSync();
  project = p; active = null; lastResult = null; sync = null; lastOk = null; lastFailed = null; compileReq++; problems.clear(); pdf.clear(); $('pdfEmpty').hidden = false; freshness();
  $('projName').textContent = p.name; document.title = `${p.name} — ${APP_NAME}`;
  prefs.set('lastProject', p.id);
  renderTree(); renderProblems();
  openFile(p.lastOpen && p.files[p.lastOpen] ? p.lastOpen : mainFile() || projectApi.files()[0]);
  events.emit('project'); events.emit('files'); refreshMainUI(); setTimeout(askMainOnce, 800);
  scheduleCompile(0);
  await folderConnect();
}
// a full copy of the project: files, main file, per-project settings; saved next to the original's folder when it has one
async function duplicateProject() {
  if (!project) return;
  const name = await promptBox('Duplicate project', 'Name for the copy', project.name + ' (copy)'); if (!name) return;
  const old = project, oldDir = folder.dir;
  const files = {};
  for (const [p, f] of Object.entries(old.files)) files[p] = f.t != null ? { t: f.t } : { b: f.b instanceof Uint8Array ? new Uint8Array(f.b) : f.b };
  let parent = null;
  if (oldDir && window.showDirectoryPicker) {
    parent = (await store.kvGet('parentdir:' + old.id).catch(() => null)) || null;
    try { if (parent && (await parent.requestPermission?.({ mode: 'readwrite' })) !== 'granted') parent = null; } catch { parent = null; }
    if (!parent && await confirmBox('Save the copy on this computer too', `“${old.name}” is saved in the folder “${oldDir.name}”. To put the copy next to it (as “${name}”), choose the folder that contains “${oldDir.name}”. Choose “Not now” to keep the copy in the browser only.`, 'Choose the folder…')) {
      try { parent = await window.showDirectoryPicker({ id: 'stochatex-parent', mode: 'readwrite', startIn: oldDir }); await store.kvSet('parentdir:' + old.id, parent); } catch { parent = null; }
    }
  }
  const copy = await createProject(name, files, { main: old.main, engine: old.engine });
  // per-project settings (model check types and names, places, …) keyed by the project id
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('tb:') && k.includes(old.id)) localStorage.setItem(k.split(old.id).join(copy.id), localStorage.getItem(k)); } } catch {}
  if (parent) {
    try { const dir = await parent.getDirectoryHandle(name.replace(/[\\/:*?"<>|]/g, '-'), { create: true }); await linkFolder(dir); toast(`Opened the copy “${name}”, saved in “${parent.name}/${dir.name}”. The original is unchanged.`, '', 6000); return; }
    catch (e) { toast('Could not create the folder for the copy: ' + e.message, 'err'); }
  }
  toast(`Opened the copy “${name}”. The original is unchanged.${oldDir ? ' The copy lives in the browser until you link it to a folder.' : ''}`, '', 6000);
}
async function createProject(name, files, extra = {}) {
  const p = { id: uid(), name, main: null, engine: 'pdflatex', files, created: Date.now(), updated: Date.now(), ...extra };
  try { await store.put(p); } catch (e) { setSaveState('unsaved', e); }      // still open it: the work is in memory and can be downloaded
  await loadProject(p); return p;
}
const sampleFiles = () => ({ 'main.tex': { t: SAMPLE_MAIN }, 'references.bib': { t: SAMPLE_BIB } });
async function projectMenu() {
  const list = await store.list();
  menu($('projBtn'), [
    { label: 'New blank project…', onClick: async () => { const n = await promptBox('New project', 'Project name', 'Untitled paper'); if (n) createProject(n, { 'main.tex': { t: BLANK_MAIN } }); } },
    { label: 'New sample project', onClick: () => createProject('Sample paper', sampleFiles()) },
    { label: 'Import a .zip…', title: 'For example a project downloaded from another LaTeX editor', onClick: async () => { const [f] = await pickFiles('.zip', false); if (f) importZip(f, true); } },
    { label: 'Open a folder on this computer…', disabled: !window.showDirectoryPicker, title: window.showDirectoryPicker ? 'The folder becomes a project, and every change is saved to it. An empty folder starts a new project.' : 'Needs Chrome or Edge on a computer', onClick: () => openFolder() },
    '-',
    { label: 'Duplicate this project…', title: 'A full copy (files and settings); the original stays as it is', onClick: () => duplicateProject() },
    { label: 'Rename this project…', onClick: async () => { const n = await promptBox('Rename project', 'Project name', project.name); if (n) { project.name = n; $('projName').textContent = n; document.title = `${n} — ${APP_NAME}`; save(); } } },
    { label: 'Download as .zip', onClick: exportZip },
    folder.dir ? { label: `Unlink the folder “${folder.dir.name}”`, onClick: unlinkFolder } : { label: 'Link this project to a folder…', disabled: !window.showDirectoryPicker, title: window.showDirectoryPicker ? 'Save every change to a folder on this computer' : 'Needs Chrome or Edge on a computer', onClick: () => linkFolder() },
    { label: 'Delete this project…', onClick: deleteProject },
    ...(list.length > 1 ? ['-', { heading: 'Your projects' }, ...list.filter(p => p.id !== project.id).slice(0, 12).map(p => ({ label: p.name, hint: new Date(p.updated).toLocaleDateString(), onClick: async () => loadProject(await store.get(p.id)) }))] : []),
  ]);
}
async function deleteProject() {
  if (!await confirmBox('Delete project', `Delete “${project.name}” from this browser? This cannot be undone. Download a .zip first if you want a copy.`, 'Delete', true)) return;
  clearTimeout(saveTimer); const id = project.id; project = null; await store.del(id); await store.kvDel('dir:' + id); Object.assign(folder, { dir: null, ok: false }); folderChip('');
  const rest = await store.list();
  if (rest.length) loadProject(await store.get(rest[0].id)); else createProject('Sample paper', sampleFiles());
}
function exportZip() {
  const out = {};
  for (const [p, f] of Object.entries(project.files)) out[p] = f.t != null ? strToU8(f.t) : f.b;
  download(new Blob([zipSync(out, { level: 6 })], { type: 'application/zip' }), project.name.replace(/[^\w.-]+/g, '_') + '.zip');
}
async function importZip(file, asNew = false) {
  let entries;
  try { entries = unzipSync(new Uint8Array(await file.arrayBuffer())); } catch (e) { return toast('That file is not a readable .zip.', 'err'); }
  let paths = Object.keys(entries).filter(p => !p.endsWith('/') && !/(^|\/)(__MACOSX|\.git)\//.test(p) && !/(^|\/)\.DS_Store$/.test(p));
  const top = paths.length && paths.every(p => p.includes('/') && p.split('/')[0] === paths[0].split('/')[0]) ? paths[0].split('/')[0] + '/' : '';
  const files = {};
  for (const p of paths) { const q = cleanPath(p.slice(top.length)); if (q) files[q] = isTextPath(q) ? { t: new TextDecoder().decode(entries[p]) } : { b: entries[p] }; }
  if (!Object.keys(files).length) return toast('The .zip has no files in it.', 'err');
  if (asNew) await createProject(file.name.replace(/\.zip$/i, ''), files);
  else { Object.assign(project.files, files); Object.keys(files).forEach(p => editor.forget(p)); save(); renderTree(); events.emit('files'); if (active) openFile(active); scheduleCompile(0); }
  toast(`Imported ${Object.keys(files).length} files.`);
}
// --- local folders (File System Access API; Chrome and Edge)
// ---------------------------------------------------------------- linked folder
// A project can be linked to a folder on this computer (Chrome and Edge). Every change is then written
// to the folder straight away, and changes made in the folder by other programs are picked up when
// this window gets the focus again. project.sync remembers, per file, what was last written.
const SKIP_DIR = /^(\.git|node_modules|\.svn|__pycache__|_minted.*)$/, SKIP_FILE = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex\.gz|synctex|blg|nav|snm|vrb|bcf|run\.xml|crswap)$|^\.DS_Store$|^~\$/i;
const folder = { dir: null, ok: false, synced: new Map(), timer: null, busy: false, again: false, error: null, state: '' };
async function listFolder(dir, prefix = '', out = []) {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') { if (!SKIP_DIR.test(name)) await listFolder(handle, prefix + name + '/', out); }
    else if (!SKIP_FILE.test(name)) out.push([prefix + name, handle]);
  }
  if (prefix) return out;
  // a PDF next to a .tex file of the same name is the compiled output, not a source file
  const names = new Set(out.map(([p]) => p));
  return out.filter(([p]) => !(/\.pdf$/i.test(p) && names.has(p.replace(/\.pdf$/i, '.tex'))));
}
const isOutput = (p, files) => SKIP_FILE.test(p.split('/').pop()) || (/\.pdf$/i.test(p) && !!files[p.replace(/\.pdf$/i, '.tex')]);
const decodeFile = async (path, file) => { const buf = new Uint8Array(await file.arrayBuffer()); return isTextPath(path) ? { t: new TextDecoder().decode(buf) } : { b: buf }; };
async function readFolder(dir) {
  const files = {}, times = {};
  for (const [path, handle] of await listFolder(dir)) { const f = await handle.getFile(); if (f.size > 30e6) continue; files[path] = await decodeFile(path, f); times[path] = f.lastModified; }
  return { files, times };
}
async function dirOf(dir, path, create) { const parts = path.split('/'); let d = dir; for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create }); return [d, parts[parts.length - 1]]; }
async function fsWrite(dir, path, data) {
  const [d, name] = await dirOf(dir, path, true);
  const fh = await d.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close();
  return (await fh.getFile()).lastModified;
}
async function fsRemove(dir, path) { try { const [d, name] = await dirOf(dir, path, false); await d.removeEntry(name); } catch {} }
function hashFile(f) {
  let h = 2166136261;
  if (f.t != null) { const s = f.t; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) + ':' + s.length; }
  const b = f.b, step = Math.max(1, Math.floor(b.length / 200000)); for (let i = 0; i < b.length; i += step) { h ^= b[i]; h = Math.imul(h, 16777619); } return (h >>> 0) + ':' + b.length;
}
const sameFile = (a, b) => (a.t != null) === (b.t != null) && (a.t != null ? a.t === b.t : a.b.length === b.b.length && hashFile(a) === hashFile(b));
function folderChip(state) {
  if (state != null) folder.state = state;
  const el = $('folderChip'); if (!el) return;
  el.hidden = !folder.dir; if (!folder.dir) return;
  const st = !folder.ok ? 'off' : folder.error ? 'err' : folder.state === 'saving' ? 'saving' : 'ok';
  el.dataset.state = st;
  el.replaceChildren(icon('folder'), h('span', { class: 'chip-name' }, folder.dir.name), h('span', { class: 'chip-state' }, st === 'off' ? 'Reconnect' : st === 'err' ? 'Not saved' : st === 'saving' ? 'Saving…' : 'Saved'));
  el.title = st === 'off' ? `The browser needs your permission again to save to the folder “${folder.dir.name}”. Click to reconnect.` : st === 'err' ? `Could not save to the folder: ${folder.error}` : `Linked to the folder “${folder.dir.name}” on this computer. Every change is saved there.`;
}
function scheduleFolderSync(delay = 600) { if (!folder.dir || !folder.ok) return; clearTimeout(folder.timer); folder.timer = setTimeout(folderSync, delay); folderChip('saving'); }
// Write to the folder whatever changed in the project since the last write.
async function folderSync() {
  clearTimeout(folder.timer);
  if (!folder.dir || !folder.ok || !project) return;
  if (folder.busy) { folder.again = true; return; }
  folder.busy = true; const dir = folder.dir, p = project; let wrote = 0;
  p.sync ||= {};
  try {
    for (const [path, f] of Object.entries(p.files)) {
      if (folder.synced.get(path) === f) continue;
      const m = await fsWrite(dir, path, f.t != null ? f.t : f.b);
      p.sync[path] = { m, h: hashFile(f) }; folder.synced.set(path, f); wrote++;
    }
    for (const path of Object.keys(p.sync)) if (!p.files[path]) { await fsRemove(dir, path); delete p.sync[path]; folder.synced.delete(path); wrote++; }
    folder.error = null;
  } catch (e) { folder.error = e.message; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { folder.ok = false; folder.error = null; } console.error('folder sync', e); }
  folder.busy = false;
  if (wrote && project === p) persist();
  folderChip('');
  if (folder.again) { folder.again = false; folderSync(); }
}
// Compare the folder with the project and bring over what changed on disk. Then write what changed here.
async function folderPull({ quiet = true, prefer = 'disk' } = {}) {
  if (!folder.dir || !folder.ok || !project || folder.busy) return;
  folder.busy = true; const dir = folder.dir, p = project; p.sync ||= {};
  let changed = 0, kept = 0; const removeOnDisk = [];
  try {
    const seen = new Set();
    for (const [path, handle] of await listFolder(dir)) {
      seen.add(path);
      const rec = p.sync[path], f = p.files[path];
      if (!f && rec) { removeOnDisk.push(path); continue; }                       // deleted here while the folder was away
      const file = await handle.getFile(); if (file.size > 30e6) continue;
      const diskChanged = !rec || file.lastModified > rec.m;
      if (!diskChanged) { if (f && folder.synced.get(path) !== f && hashFile(f) === rec.h) folder.synced.set(path, f); continue; }
      const next = await decodeFile(path, file);
      if (!f) { p.files[path] = next; p.sync[path] = { m: file.lastModified, h: hashFile(next) }; folder.synced.set(path, next); changed++; continue; }
      if (sameFile(f, next)) { p.sync[path] = { m: file.lastModified, h: hashFile(f) }; folder.synced.set(path, f); continue; }
      const localChanged = rec ? hashFile(f) !== rec.h : prefer === 'local';
      if (localChanged) {                                                          // changed in both places: keep ours, keep theirs beside it
        if (rec) { const copy = path.replace(/(\.[^./]+)?$/, ' (folder copy)$1'); p.files[copy] = next; kept++; }
        continue;                                                                  // folderSync writes ours
      }
      p.files[path] = next; p.sync[path] = { m: file.lastModified, h: hashFile(next) }; folder.synced.set(path, next); editor.forget(path); changed++;
    }
    for (const path of Object.keys(p.sync)) {                                      // deleted in the folder
      const f = p.files[path];
      if (seen.has(path) || !f || isOutput(path, p.files)) continue;
      if (hashFile(f) === p.sync[path].h) { delete p.files[path]; editor.forget(path); if (p.main === path) p.main = null; changed++; }
      delete p.sync[path]; folder.synced.delete(path);
    }
    for (const path of removeOnDisk) { await fsRemove(dir, path); delete p.sync[path]; }
    folder.error = null;
  } catch (e) { folder.error = e.message; if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { folder.ok = false; folder.error = null; } console.error('folder pull', e); }
  folder.busy = false;
  if (project !== p) return;
  if (changed || kept) {
    persist(); renderTree(); events.emit('files');
    if (active && p.files[active]) { if (p.files[active].t != null && p.files[active].t !== editor.getText()) openFile(active); } else { active = null; openFile(mainFile() || projectApi.files()[0]); }
    scheduleCompile(0);
    if (!quiet || changed) toast(`${changed} file${changed === 1 ? '' : 's'} updated from the folder.` + (kept ? ` ${kept} changed in both places: your version was kept, and the folder's version was added as “(folder copy)”.` : ''));
  }
  await folderSync();
}
// Find the folder of the open project and check that the browser still lets us write to it.
async function folderConnect(ask = false) {
  clearTimeout(folder.timer);
  Object.assign(folder, { dir: null, ok: false, synced: new Map(), error: null, state: '' });
  let dir = null; try { dir = project && await store.kvGet('dir:' + project.id); } catch {}
  if (dir) {
    folder.dir = dir; let st = 'granted';
    try { if (dir.queryPermission) st = await dir.queryPermission({ mode: 'readwrite' }); if (st !== 'granted' && ask && dir.requestPermission) st = await dir.requestPermission({ mode: 'readwrite' }); } catch { st = 'denied'; }
    folder.ok = st === 'granted';
  }
  folderChip('');
  if (folder.ok) await folderPull();
  else if (dir && ask) toast('The browser did not give permission to use the folder.', 'err');
}
async function pickFolder() { try { return await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return null; } }
// Open a folder as a project (an empty folder becomes a new blank project).
async function openFolder(dir) {
  dir ||= await pickFolder(); if (!dir) return;
  for (const { id } of await store.list()) { const d = await store.kvGet('dir:' + id); try { if (d && await d.isSameEntry(dir)) { toast('That folder is already linked to a project. Opening it.'); return loadProject(await store.get(id)); } } catch {} }
  let { files, times } = await readFolder(dir);
  const empty = !Object.keys(files).length;
  if (empty) files = { 'main.tex': { t: BLANK_MAIN } };
  const sync = {}; if (!empty) for (const [p, f] of Object.entries(files)) sync[p] = { m: times[p], h: hashFile(f) };
  const p = { id: uid(), name: dir.name, main: null, engine: 'pdflatex', files, created: Date.now(), updated: Date.now(), folder: dir.name, sync };
  await store.put(p); await store.kvSet('dir:' + p.id, dir);
  await loadProject(p);
  toast(empty ? `New project in “${dir.name}”. Every change is saved to that folder.` : `Opened ${Object.keys(files).length} files from “${dir.name}”. Every change is saved to that folder.`);
}
// Link the open project to a folder: its files are written there now, and on every change from now on.
async function linkFolder(dir) {
  dir ||= await pickFolder(); if (!dir) return;
  const there = (await listFolder(dir)).map(([p]) => p), clash = there.filter(p => project.files[p]);
  if (clash.length && !await confirmBox('Link to this folder', `“${dir.name}” already has ${clash.length} file${clash.length === 1 ? '' : 's'} with the same name as files in this project (${clash.slice(0, 3).join(', ')}${clash.length > 3 ? ', …' : ''}). They will be replaced by this project's versions. Other files in the folder are added to the project.`, 'Replace and link')) return;
  await store.kvSet('dir:' + project.id, dir);
  project.folder = dir.name; project.sync = {}; persist();
  Object.assign(folder, { dir, ok: true, synced: new Map(), error: null });
  folderChip('saving');
  await folderPull({ prefer: 'local' });
  toast(`Linked to “${dir.name}”. Every change is saved to that folder.`);
}
async function unlinkFolder() {
  if (!folder.dir) return;
  const name = folder.dir.name;
  await folderSync(); await store.kvDel('dir:' + project.id);
  delete project.folder; delete project.sync; persist();
  Object.assign(folder, { dir: null, ok: false, synced: new Map(), error: null }); folderChip('');
  toast(`No longer linked to “${name}”. The files stay in the folder, and the project stays in this browser.`);
}
async function writePdfToFolder(bytes) {
  if (!folder.dir || !folder.ok || !prefs.get('folderPdf', true)) return;
  const main = mainFile(); if (!main) return;
  try { await fsWrite(folder.dir, main.replace(/\.tex$/i, '') + '.pdf', bytes); } catch (e) { console.warn('pdf to folder', e); }
}
function folderMenu() {
  if (!folder.dir) return;
  if (!folder.ok) return folderConnect(true);
  menu($('folderChip'), [
    { heading: `Folder “${folder.dir.name}”` },
    { label: 'Save now', onClick: () => folderSync() },
    { label: 'Check the folder for changes', onClick: () => folderPull({ quiet: false }) },
    { label: (prefs.get('folderPdf', true) ? '✓ ' : ' ') + 'Also save the PDF there', onClick: () => { prefs.set('folderPdf', !prefs.get('folderPdf', true)); if (prefs.get('folderPdf', true) && lastResult?.success && lastResult.pdf) writePdfToFolder(lastResult.pdf); } },
    '-', { label: 'Unlink the folder', onClick: unlinkFolder },
  ]);
}
addEventListener('focus', () => { if (folder.dir && folder.ok) folderPull(); });

// ---------------------------------------------------------------- features dialog (modules + settings)
function featuresDialog() {
  modal({ title: 'Features and settings', wide: true, body(el) {
    const draw = () => {
      const list = modules.list(), cats = [...new Set(list.map(m => m.category))].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
      el.replaceChildren(
        h('p', { class: 'muted' }, 'Each feature is a separate module. Switch off what you do not use; switched-off modules do nothing and cost nothing.'),
        ...cats.map(c => h('section', { class: 'feat-cat' }, h('h3', {}, c), list.filter(m => m.category === c).sort((a, b) => a.name.localeCompare(b.name)).map(m => h('label', { class: 'feat' },
          h('input', { type: 'checkbox', role: 'switch', checked: m.enabled, onChange: (e) => { e.target.checked ? modules.enable(m.id) : modules.disable(m.id); draw(); } }),
          h('span', { class: 'feat-text' }, h('strong', {}, m.name), m.source === 'user' ? h('span', { class: 'tag' }, 'added by you') : null, h('span', { class: 'muted' }, m.description), m.error ? h('span', { class: 'errtext' }, 'Failed to start: ' + m.error) : null),
          m.source === 'user' ? h('button', { class: 'small', onClick: async (e) => { e.preventDefault(); await modules.removeUser(m.id); draw(); } }, 'Remove') : null)))),
        h('section', { class: 'feat-cat' }, h('h3', {}, 'Add your own'),
          h('p', { class: 'muted' }, 'A module is one JavaScript file. Add it here to keep it in this browser, or put it in the modules folder of the site and list it in modules/index.json to make it permanent. ', h('a', { href: 'MODULES.txt', target: '_blank', rel: 'noopener' }, 'How to write a module')),
          h('button', { onClick: async () => { const [f] = await pickFiles('.js,.mjs', false); if (!f) return; const mod = await modules.addUser(f.name, await f.text()); if (mod) { toast(`Added “${mod.name || mod.id}”.`); draw(); } } }, 'Add a module file…')),
        h('section', { class: 'feat-cat' }, h('h3', {}, 'Settings'),
          h('label', { class: 'feat' }, h('input', { type: 'checkbox', role: 'switch', checked: prefs.get('auto', true), onChange: (e) => { prefs.set('auto', e.target.checked); $('auto').checked = e.target.checked; } }), h('span', { class: 'feat-text' }, h('strong', {}, 'Compile automatically'), h('span', { class: 'muted' }, 'Recompile shortly after you stop typing.'))),
          h('label', { class: 'field row' }, 'Wait before compiling', h('select', { onChange: (e) => prefs.set('delay', +e.target.value) }, [400, 900, 1500, 3000].map(v => h('option', { value: v, selected: prefs.get('delay', 900) === v }, (v / 1000) + ' s')))),
          h('label', { class: 'field row' }, 'TeX engine for this project', h('select', { onChange: (e) => { project.engine = e.target.value; save(); scheduleCompile(0); } }, [['pdflatex', 'pdfLaTeX'], ['xelatex', 'XeLaTeX'], ['auto', 'Choose automatically']].map(([v, l]) => h('option', { value: v, selected: (project.engine || 'pdflatex') === v }, l)))),
          h('label', { class: 'field row' }, 'Editor text size', h('select', { onChange: (e) => { prefs.set('size', +e.target.value); applyPrefs(); } }, [12, 13, 14, 15, 16, 18, 20].map(v => h('option', { value: v, selected: prefs.get('size', 14) === v }, v + ' px')))),
          h('label', { class: 'feat' }, h('input', { type: 'checkbox', role: 'switch', checked: prefs.get('wrap', true), onChange: (e) => { prefs.set('wrap', e.target.checked); applyPrefs(); } }), h('span', { class: 'feat-text' }, h('strong', {}, 'Wrap long lines'))),
          h('button', { onClick: async () => { await clearEngineCache(); toast('Cleared downloaded TeX packages. They will be fetched again when needed.'); } }, 'Clear downloaded TeX packages')),
        h('div', { class: 'about' }, h('img', { src: 'logo.svg', alt: '', width: 40, height: 40 }),
          h('div', {}, h('div', { class: 'wordmark' }, 'Stocha', 'T', h('span', { class: 'e' }, 'E'), 'X', h('span', { class: 'ver' }, VERSION)),
            h('p', { class: 'muted small' }, 'Independent project; not affiliated with or endorsed by Overleaf, the Dynare team or any other LaTeX service. ', h('a', { href: 'LICENSES.txt', target: '_blank', rel: 'noopener' }, 'Open-source licences')))));
    };
    draw();
  }, buttons: [{ label: 'Done', primary: true }] });
}
function applyPrefs() { document.documentElement.style.setProperty('--ed-size', prefs.get('size', 14) + 'px'); editor.setWrap(prefs.get('wrap', true)); }

// ---------------------------------------------------------------- command palette
// ---------------------------------------------------------------- Search or run (Ctrl+K): commands, files, sections, labels, citations
function texFiles() { return Object.keys(project?.files || {}).filter(p => project.files[p].t != null); }
function searchIndex() {
  const items = [];
  for (const c of commands.values()) items.push({ kind: 'Command', text: c.name, key: c.key, run: () => c.run(), id: c.id });
  for (const p of Object.keys(project?.files || {})) items.push({ kind: 'File', text: p, run: () => openFile(p) });
  for (const p of texFiles()) {
    const t = project.files[p].t; if (!/\.(tex|ltx)$/i.test(p) && !/\.bib$/i.test(p)) continue;
    const lineOf = (i) => t.slice(0, i).split('\n').length;
    if (/\.bib$/i.test(p)) {
      for (const m of t.matchAll(/@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|$)/g)) {
        const title = (/\btitle\s*=\s*[{"]+([^}"]*)/i.exec(m[3]) || [])[1] || '', author = (/\bauthor\s*=\s*[{"]+([^}"]*)/i.exec(m[3]) || [])[1] || '', year = (/\byear\s*=\s*[{"]?(\d{4})/i.exec(m[3]) || [])[1] || '';
        const key = m[2];
        items.push({ kind: 'Citation', text: `${key} — ${author.split(/ and /)[0] || ''}${year ? ' ' + year : ''}${title ? ': ' + title : ''}`, hint: 'insert \\citet', run: () => { editor.view.dispatch(editor.view.state.replaceSelection(`\\citet{${key}}`)); editor.view.focus(); } });
      }
      continue;
    }
    for (const m of t.matchAll(/\\(part|chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)) items.push({ kind: 'Section', text: m[2].replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, ''), hint: `${p}:${lineOf(m.index)}`, run: () => goto(p, lineOf(m.index)) });
    for (const m of t.matchAll(/\\label\{([^}]*)\}/g)) items.push({ kind: 'Label', text: m[1], hint: `${p}:${lineOf(m.index)} · Alt+Enter inserts \\ref`, run: () => goto(p, lineOf(m.index)), alt: () => { editor.view.dispatch(editor.view.state.replaceSelection(/^eq/.test(m[1]) ? `\\eqref{${m[1]}}` : `\\ref{${m[1]}}`)); editor.view.focus(); } });
  }
  return items;
}
function quickSearch(initial = '') {
  const input = h('input', { type: 'text', placeholder: 'Search files, sections, labels, citations and commands…', class: 'grow', autofocus: true, 'aria-label': 'Search or run' }), listEl = h('div', { class: 'cmd-list', role: 'listbox' });
  const all = searchIndex();
  let sel = 0, shown = [];
  const m = modal({ title: 'Search or run', body: h('div', {}, input, h('p', { class: 'muted qs-hint' }, 'Enter opens or runs · Alt+Enter on a label inserts a reference · right-click a command to pin it to the side bar'), listEl) });
  const draw = () => {
    const q = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (it) => { const t = (it.kind + ' ' + it.text + ' ' + (it.hint || '')).toLowerCase(); if (!q.every(w => t.includes(w))) return -1; return (it.text.toLowerCase().startsWith(q[0] || '') ? 2 : 0) + (it.kind === 'Command' ? 0 : 1); };
    shown = (q.length ? all.map(it => [score(it), it]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0] || a[1].text.localeCompare(b[1].text)).map(x => x[1]) : all.filter(it => it.kind !== 'Citation' && it.kind !== 'Label')).slice(0, 80);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    listEl.replaceChildren(...shown.map((it, i) => {
      const b = h('button', { class: 'cmd' + (i === sel ? ' on' : ''), role: 'option', onClick: () => go(it) }, h('span', { class: 'qs-kind' }, it.kind), h('span', { class: 'qs-text' }, it.text), it.hint ? h('span', { class: 'hint' }, it.hint) : null, it.key ? h('kbd', {}, it.key.replace('Mod', MOD)) : null);
      if (it.kind === 'Command') b.addEventListener('contextmenu', (e) => { e.preventDefault(); const pinned = quickList().includes(it.id); menu(b, [{ label: pinned ? 'Unpin from the side bar' : 'Pin to the side bar', onClick: () => { setQuick(pinned ? quickList().filter(x => x !== it.id) : [...quickList(), it.id]); toast(pinned ? 'Removed from the side bar.' : 'Pinned to the side bar.'); } }]); });
      return b;
    }));
    listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const go = (it, alt) => { m.close(); setTimeout(() => (alt && it.alt ? it.alt() : it.run()), 0); };
  input.value = initial;
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel], e.altKey); }
  });
  draw();
}
// where the cursor is: file › section › subsection (click a part to go there)
let crumbT = 0;
function crumbsSoon() { clearTimeout(crumbT); crumbT = setTimeout(drawCrumbs, 200); }
function drawCrumbs() {
  const el = $('crumbs'); if (!el || !active) return;
  const t = editor.view.state.doc, line = t.lineAt(editor.view.state.selection.main.head).number;
  const heads = [];
  if (/\.(tex|ltx)$/i.test(active)) {
    const text = t.toString(), lv = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3 };
    for (const m of text.matchAll(/^[ \t]*\\(part|chapter|section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/gm)) {
      const ln = text.slice(0, m.index).split('\n').length; if (ln > line) break;
      const level = lv[m[1]]; while (heads.length && heads[heads.length - 1].level >= level) heads.pop();
      heads.push({ level, title: m[2].replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').slice(0, 40), line: ln });
    }
  }
  el.replaceChildren(h('button', { class: 'crumb', title: 'Files', onClick: () => showPanel('files') }, active), ...heads.slice(-2).flatMap(x => [h('span', { class: 'sep' }, '›'), h('button', { class: 'crumb', title: `Line ${x.line}`, onClick: () => goto(active, x.line) }, x.title)]));
}
// quick-access icons on the left rail (pinned commands)
const QUICK_DEFAULT = ['quick.findall', 'quick.insert', 'equation.edit', 'equation.full', 'quick.snippets', 'dynare.export', 'irf.figure'];
const QUICK_ICON = { 'quick.findall': 'findall', 'quick.insert': 'insert', 'equation.edit': 'sigma', 'equation.full': 'panel', 'quick.snippets': 'braces', 'dynare.export': 'swap', 'dynare.import': 'swap', 'irf.figure': 'wave', 'visual.toggle': 'eye', 'packages.tidy': 'sliders', 'nav.back': 'locate' };
const quickList = () => prefs.get('quick', QUICK_DEFAULT);
function setQuick(list) { prefs.set('quick', list); drawQuick(); }
function drawQuick() {
  const box = $('railQuick'); if (!box) return;
  const list = quickList().filter(id => commands.has(id));
  box.replaceChildren(...list.map((id, i) => {
    const c = commands.get(id), name = c.name.replace(/^[^:]+: /, (m) => /Format|Equation editor|Brackets|Theme|Folder/.test(m) ? '' : m);
    const b = h('button', { class: 'rail-btn quick', title: c.name + (c.key ? ` (${c.key.replace('Mod', MOD)})` : '') + ' — right-click to unpin, drag to reorder', 'aria-label': c.name, draggable: true, onClick: () => c.run() }, QUICK_ICON[id] ? icon(QUICK_ICON[id], 18) : h('span', { class: 'quick-letter' }, name.trim()[0]?.toUpperCase() || '•'));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(b, [{ heading: c.name }, { label: 'Unpin from the side bar', onClick: () => setQuick(quickList().filter(x => x !== id)) }, { label: 'Pin more… (search a command, right-click it)', onClick: () => quickSearch('') }]); });
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-quick', id); });
    b.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-quick')) e.preventDefault(); });
    b.addEventListener('drop', (e) => { const from = e.dataTransfer.getData('text/x-quick'); if (!from || from === id) return; e.preventDefault(); const l = quickList().filter(x => x !== from); l.splice(l.indexOf(id), 0, from); setQuick(l); });
    return b;
  }));
}
function palette() {
  const input = h('input', { type: 'text', placeholder: 'Type a command…', class: 'grow', autofocus: true, 'aria-label': 'Command' }), listEl = h('div', { class: 'cmd-list', role: 'listbox' });
  let sel = 0, shown = [];
  const m = modal({ title: 'Commands', body: h('div', {}, input, listEl) });
  const draw = () => {
    const q = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = [...commands.values()].filter(c => q.every(w => c.name.toLowerCase().includes(w))).sort((a, b) => a.name.localeCompare(b.name));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    listEl.replaceChildren(...shown.map((c, i) => h('button', { class: 'cmd' + (i === sel ? ' on' : ''), role: 'option', onClick: () => run(c) }, c.name, c.key ? h('kbd', {}, c.key.replace('Mod', MOD)) : null)));
    listEl.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  const run = (c) => { m.close(); setTimeout(() => c.run(), 0); };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); } else if (e.key === 'Enter' && shown[sel]) run(shown[sel]); });
  draw();
}
// a short note in the status bar at the bottom (not over the text)
function note(msg) { const c = $('cursorInfo'); const old = c.dataset.note; c.dataset.note = msg; c.textContent = msg; c.classList.add('note'); clearTimeout(note.t); note.t = setTimeout(() => { delete c.dataset.note; c.classList.remove('note'); const st = editor.view.state, pos = st.selection.main.head, ln = st.doc.lineAt(pos); c.textContent = `Ln ${ln.number}, Col ${pos - ln.from + 1}`; }, 4000); }
function showInPdf() {
  if (!sync || !active) return note('Compile to see this part in the PDF.');
  // the nearest line that is in the PDF: blank lines, comments, lines inside equations or added since the compile have none
  const at = editor.getCursor().line;
  let hit = null;
  for (let d = 0; d <= 40 && !hit; d++) hit = forward(sync, active, at - d) || (d ? forward(sync, active, at + d) : null);
  if (!hit) {
    if (tagOf(sync, active) == null && active !== mainFile()) return note(`This file is not in the PDF: ${mainFile()} does not \\input it.`);
    return note('Compile to see this part in the PDF.');
  }
  if (pdfMode === 'tab') return pdfCh.postMessage({ type: 'show', page: hit.page, rect: { x: hit.x, y: hit.y, w: hit.w, h: hit.h } });
  if (pdfMode === 'hidden') { setPdfMode('side'); return setTimeout(() => pdf.reveal(hit.page, hit), 250); }
  pdf.reveal(hit.page, hit);
}

// ---------------------------------------------------------------- where the PDF is shown: beside, hidden, or in its own tab
const winId = sessionStorage.getItem('texbench-win') || Math.random().toString(36).slice(2, 10);
sessionStorage.setItem('texbench-win', winId);
const pdfCh = new BroadcastChannel('texbench-pdf-' + winId);
let pdfMode = 'side', tabAlive = false;
const PDF_MODES = { side: 'Beside the editor', hidden: 'Hidden', tab: 'In a separate tab' };
function setPdfMode(mode, remember = true) {
  if (mode === 'tab' && !tabAlive) {
    const w = window.open('pdf.html?ch=' + winId, 'texbench-pdf-' + winId);
    if (!w) return toast('The browser blocked the new tab. Allow pop-ups for this site and try again.', 'err');
  }
  if (mode !== 'tab' && tabAlive) { pdfCh.postMessage({ type: 'close' }); tabAlive = false; }
  pdfMode = mode;
  document.body.classList.toggle('pdf-off', mode !== 'side');
  $('pdfSw').setAttribute('aria-checked', String(mode === 'side')); $('pdfSw').classList.toggle('on', mode === 'side'); $('pdfSw').classList.toggle('tab', mode === 'tab');
  $('pdfSw').querySelector('.lbl').textContent = mode === 'tab' ? 'PDF in tab' : 'PDF';
  if (remember && mode !== 'tab') prefs.set('pdfMode', mode);
  editor.view.requestMeasure();
}
function sendPdfToTab() {
  if (!tabAlive || !pdf.bytes || !lastResult?.success) return;
  pdfCh.postMessage({ type: 'pdf', bytes: pdf.bytes, title: project?.name || 'Document', name: (mainFile() || 'document').split('/').pop().replace(/\.tex$/i, '') + '.pdf' });
}
pdfCh.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'hello') { tabAlive = true; if (pdfMode !== 'tab') setPdfMode('tab', false); sendPdfToTab(); }
  else if (m.type === 'alive?') pdfCh.postMessage({ type: 'ping' });
  else if (m.type === 'bye') { tabAlive = false; if (pdfMode === 'tab') setPdfMode(prefs.get('pdfMode', 'side') === 'hidden' ? 'hidden' : 'side', false); }
  else if (m.type === 'dock') { tabAlive = false; setPdfMode('side'); }
  else if (m.type === 'click') { if (!sync) return; const hit = inverse(sync, m.page, m.x, m.y); if (hit && project.files[hit.file]) { goto(hit.file, hit.line); window.focus(); } }
};
function pdfModeMenu() {
  menu($('pdfModeBtn'), [...Object.entries(PDF_MODES).map(([k, label]) => ({ label: (pdfMode === k ? '✓ ' : '\u2003') + label, onClick: () => setPdfMode(k) })), '-',
    { label: '\u2003Download the PDF', disabled: !lastResult?.pdf, onClick: () => $('pdfDownload').click() }]);
}
function downloadPdf() { if (lastResult?.success && pdf.bytes) download(new Blob([pdf.bytes], { type: 'application/pdf' }), (mainFile() || 'document').split('/').pop().replace(/\.tex$/i, '') + '.pdf'); else toast('There is no PDF yet.'); }

// ---------------------------------------------------------------- wiring
[
  { id: 'core.compile', name: 'Compile now', key: 'Mod+Enter', run: runCompile },
  { id: 'core.pdfSide', name: 'PDF: show beside the editor', run: () => setPdfMode('side') },
  { id: 'core.pdfHide', name: 'PDF: hide (or show again)', key: 'Mod+Shift+H', run: () => setPdfMode(pdfMode === 'side' ? 'hidden' : 'side') },
  { id: 'core.pdfTab', name: 'PDF: open in a separate tab', run: () => setPdfMode('tab') },
  { id: 'core.showInPdf', name: 'Show this line in the PDF', key: 'Mod+J', run: showInPdf },
  { id: 'core.newFile', name: 'New file…', run: newFile },
  { id: 'core.upload', name: 'Upload files…', run: async () => addFiles(await pickFiles()) },
  { id: 'core.features', name: 'Features and settings…', run: featuresDialog },
  { id: 'core.zip', name: 'Download project as .zip', run: exportZip },
  { id: 'core.pdf', name: 'Download PDF', run: downloadPdf },
  { id: 'core.find', name: 'Find and replace in this file', key: 'Mod+F', run: () => editor.openSearch() },
  { id: 'core.comment', name: 'Comment or uncomment the selected lines', key: 'Mod+/', run: () => editor.toggleComment() },
  { id: 'core.problems', name: 'Show or hide problems', run: () => showBottom('problems') },
  { id: 'core.log', name: 'Show or hide the full LaTeX log', run: () => showBottom('log') },
  { id: 'core.linkFolder', name: 'Folder: link this project to a folder on this computer', run: () => window.showDirectoryPicker ? linkFolder() : toast('Linking a folder needs Chrome or Edge on a computer.') },
  { id: 'core.openFolder', name: 'Folder: open a folder as a project', run: () => window.showDirectoryPicker ? openFolder() : toast('Opening a folder needs Chrome or Edge on a computer.') },
  { id: 'core.pullFolder', name: 'Folder: check the linked folder for changes', run: () => folder.dir ? folderPull({ quiet: false }) : toast('This project is not linked to a folder.') },
].forEach(c => commands.set(c.id, c));

$('projBtn').onclick = projectMenu; $('folderChip').onclick = folderMenu;
$('compileBtn').onclick = runCompile; $('compileBtn').title = `Compile (${MOD}+Enter)`;
$('auto').checked = prefs.get('auto', true); $('auto').onchange = (e) => { prefs.set('auto', e.target.checked); if (e.target.checked) scheduleCompile(0); };
$('featBtn').onclick = featuresDialog; $('paletteBtn').onclick = palette; $('paletteBtn').title = `All commands (${MOD}+Shift+P)`; $('pdfModeBtn').append(icon('chevron', 13));
$('newFileBtn').onclick = newFile; $('sideHide').append(icon('chevron', 14)); $('sideHide').onclick = () => setSide(false); $('sideHide').title = `Hide the side bar (${MOD}+\\). Click any icon on the left to bring it back.`; $('uploadBtn').onclick = async () => addFiles(await pickFiles());
$('tabProblems').onclick = () => showBottom('problems'); $('tabLog').onclick = () => showBottom('log');
$('zoomOut').onclick = () => pdf.setZoom(pdf.zoom / 1.15); $('zoomIn').onclick = () => pdf.setZoom(pdf.zoom * 1.15); $('zoomFit').onclick = () => pdf.setZoom(1);
$('pdfModeBtn').onclick = pdfModeMenu; $('pdfSw').onclick = () => setPdfMode(pdfMode === 'side' ? 'hidden' : 'side'); $('pdfTabBtn').onclick = () => setPdfMode('tab'); $('pdfHideBtn').onclick = () => setPdfMode('hidden');
$('pdfDownload').onclick = downloadPdf; $('syncBtn').onclick = showInPdf; $('syncBtn').title = `Show this line in the PDF (${MOD}+J). Double-click the PDF to jump to the source.`;
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'Enter' || (e.key.toLowerCase() === 's' && !e.shiftKey))) { e.preventDefault(); if (e.key.toLowerCase() === 's') flush(); runCompile(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette(); }
  else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); quickSearch(); }
  else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') { e.preventDefault(); showInPdf(); }
  else if (mod && !e.shiftKey && e.key === '\\') { e.preventDefault(); setSide(document.body.classList.contains('side-off')); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); setPdfMode(pdfMode === 'side' ? 'hidden' : 'side'); }
}, true);
const tree = $('side');
tree.addEventListener('dragover', (e) => { e.preventDefault(); tree.classList.add('drop'); });
tree.addEventListener('dragleave', () => tree.classList.remove('drop'));
tree.addEventListener('drop', (e) => { e.preventDefault(); tree.classList.remove('drop'); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
document.documentElement.style.setProperty('--side-w', prefs.get('sideW', 230) + 'px');
document.documentElement.style.setProperty('--pdf-w', prefs.get('pdfW', Math.round(innerWidth * 0.42)) + 'px');
splitter($('split1'), { varName: '--side-w', min: 140, max: () => innerWidth * 0.4, onEnd: v => prefs.set('sideW', v) });
splitter($('split2'), { varName: '--pdf-w', min: 220, max: () => innerWidth * 0.7, invert: true, onEnd: v => prefs.set('pdfW', v) });
document.querySelectorAll('.ic-slot').forEach(el => el.replaceWith(icon(el.dataset.icon)));
$('omniBtn').onclick = () => quickSearch(); $('omniBtn').querySelector('kbd').textContent = MOD === '⌘' ? '⌘K' : 'Ctrl K';
ui.addCommand({ id: 'quick.findall', name: 'Find in all files of the project', run: () => { editor.openSearch(); setTimeout(() => { const b = [...document.querySelectorAll('.fb-tog')].find(x => x.textContent === 'All files'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); }, 50); } });
ui.addCommand({ id: 'quick.insert', name: 'Insert: figure, table, citation, cross-reference, footnote', run: () => insertMenu() });
ui.addCommand({ id: 'quick.snippets', name: 'Snippets: insert a ready-made block', run: () => { const b = [...document.querySelectorAll('#toolbar button')].find(x => /Snippets/i.test(x.title || x.textContent)); b ? b.click() : quickSearch('snippet'); } });
ui.addCommand({ id: 'project.duplicate', name: 'Project: duplicate this project', run: () => duplicateProject() });
ui.addCommand({ id: 'quick.search', name: 'Search or run (files, sections, labels, citations, commands)', key: 'Mod+K', run: () => quickSearch() });
function insertMenu() {
  const ins = (t, back = 0) => { const v = editor.view, r = v.state.selection.main; v.dispatch({ changes: { from: r.from, to: r.to, insert: t }, selection: { anchor: r.from + t.length - back } }); v.focus(); };
  const anchor = document.querySelector('[aria-label^="Insert: figure"]') || $('omniBtn');
  menu(anchor, [
    { label: 'Figure', onClick: () => ins('\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}\n', 43) },
    { label: 'Table', onClick: () => ins('\\begin{table}[htbp]\n  \\centering\n  \\caption{}\n  \\label{tab:}\n  \\begin{tabular}{lcc}\n    \\toprule\n     &  &  \\\\\n    \\midrule\n     &  &  \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n', 150) },
    { label: 'Citation…', hint: 'from your .bib', onClick: () => quickSearch('citation ') },
    { label: 'Cross-reference…', hint: 'to a label', onClick: () => quickSearch('label ') },
    { label: 'Footnote', onClick: () => ins('\\footnote{}', 1) },
  ]);
}
$('railEnd').append(
  h('button', { class: 'rail-btn', title: 'Features', 'aria-label': 'Features', onClick: () => featuresDialog() }, icon('sliders', 18)),
  h('button', { class: 'rail-btn', title: 'Keyboard shortcuts and all commands', 'aria-label': 'Keyboard shortcuts', onClick: () => palette() }, icon('keyboard', 18)),
  h('button', { class: 'rail-btn', title: 'Help and about StochaTeX', 'aria-label': 'Help', onClick: () => { featuresDialog(); setTimeout(() => document.querySelector('.modal .about')?.scrollIntoView({ block: 'center' }), 50); } }, icon('help', 18)));
setTimeout(drawQuick, 300);
addRail('files', 'Files', 'files'); if (prefs.get('sideOff', false)) document.body.classList.add('side-off'); showPanel(prefs.get('sidePanel', 'files'));
$('dockClose').onclick = closeDock;
ui.addCommand({ id: 'packages.auto', get name() { return prefs.get('autoPkg', true) ? 'Stop adding missing packages automatically' : 'Add missing packages automatically (\\usepackage lines, with Undo)'; }, run: () => { const v = !prefs.get('autoPkg', true); prefs.set('autoPkg', v); toast(v ? 'Missing packages will be added automatically.' : 'Packages will no longer be added automatically.'); } });
ui.addCommand({ id: 'packages.tidy', name: 'Tidy packages: remove ones loaded twice', run: tidyPackages });
ui.addCommand({ id: 'side.toggle', name: `Show or hide the side bar (${MOD}+\\)`, run: () => setSide(document.body.classList.contains('side-off')) });
splitter($('dockGrip'), { varName: '--dock-h', min: 140, max: () => innerHeight * 0.7, invert: true, axis: 'y', onEnd: v => { prefs.set('dockH', v); editor.view.requestMeasure(); } });
applyPrefs();
if (prefs.get('pdfMode', 'side') === 'hidden') setPdfMode('hidden', false);
pdfCh.postMessage({ type: 'ping' });
onEngineLog((m) => { if (/Downloading|Fetching .* from TexLive|loading bundle/i.test(m) && compiling) setStatus(/cm-super/.test(m) ? 'Downloading fonts (one time)…' : 'Fetching a LaTeX package…', 'busy'); });

// ---------------------------------------------------------------- start
(async function start() {
  setStatus('Loading the TeX engine…', 'busy');
  initEngine().then(() => { if (!compiling) setStatus('Ready', 'ok'); }).catch((e) => { setStatus('The TeX engine could not be loaded', 'err'); console.error(e); toast('The TeX engine could not be loaded: ' + e.message, 'err'); });
  await modules.loadAll();
  const last = prefs.get('lastProject'), p = (last && await store.get(last)) || await (async () => { const l = await store.list(); return l.length ? store.get(l[0].id) : null; })();
  if (p) await loadProject(p); else await createProject('Sample paper', sampleFiles());
  document.body.classList.add('ready');
})();
