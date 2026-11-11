// TeXbench — a free, modular LaTeX editor that runs entirely in the browser.
// Core: project storage, editor, compile, PDF preview, problems. Everything else lives in modules/.
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { store, prefs, isTextPath, uid } from './store.js';
import { h, modal, toast, menu, confirmBox, promptBox, splitter, download, pickFiles } from './ui.js';
import { createEditor } from './editor.js';
import { createPdfView } from './pdfview.js';
import { initEngine, compileProject, onEngineLog, engineLog, clearEngineCache } from './engine.js';
import { parseLog } from './logparse.js';
import { parseSyncTeX, forward, inverse } from './synctex.js';
import { createModuleHost } from './modules.js';
import { SAMPLE_MAIN, SAMPLE_BIB, BLANK_MAIN } from './template.js';

const APP_NAME = 'TeXbench', VERSION = '0.1.0';
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
const commands = new Map();      // id -> { id, name, run, key }

const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); };
const flush = async () => { clearTimeout(saveTimer); if (project) { project.updated = Date.now(); try { await store.put(project); } catch (e) { toast('Could not save the project in this browser: ' + e.message, 'err'); } } };
addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
addEventListener('pagehide', flush);

// ---------------------------------------------------------------- editor + pdf
const editor = createEditor($('ed'), {
  onChange(path, text) {
    if (!project || !path || !project.files[path]) return;
    project.files[path] = { t: text }; save(); events.emit('change', path, text); scheduleCompile();
  },
  onCursor(state) { const pos = state.selection.main.head, ln = state.doc.lineAt(pos); $('cursorInfo').textContent = `Ln ${ln.number}, Col ${pos - ln.from + 1}`; events.emit('cursor', { line: ln.number, column: pos - ln.from, pos }); },
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
  setMain(p) { project.main = p; save(); renderTree(); scheduleCompile(0); },
};
const cleanPath = (p) => (p || '').replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join('/');
const pathSort = (a, b) => { const da = a.includes('/'), dbb = b.includes('/'); return da === dbb ? a.localeCompare(b) : da ? 1 : -1; };
function mainFile() {
  if (!project) return null;
  if (project.main && project.files[project.main]) return project.main;
  const tex = projectApi.files().filter(p => /\.tex$/i.test(p) && project.files[p].t != null);
  return tex.find(p => /\\documentclass/.test(project.files[p].t)) || tex[0] || null;
}

// ---------------------------------------------------------------- ui api (also used by modules)
const ui = {
  h, modal, toast, menu, confirm: confirmBox, prompt: promptBox, download, pickFiles,
  addPanel({ id, title, render, open = true }) {
    const body = h('div', { class: 'panel-body' });
    const el = h('details', { class: 'panel', open: prefs.get('panel:' + id, open), id: 'panel-' + id }, h('summary', {}, title), body);
    el.addEventListener('toggle', () => prefs.set('panel:' + id, el.open));
    $('panels').append(el); render(body);
    return () => el.remove();
  },
  addToolbarButton({ label, title, onClick, icon }) {
    const b = h('button', { title: title || label, onClick }, icon ? h('span', { class: 'ic' }, icon) : null, label);
    $('toolbar').append(b); const off = () => b.remove(); off.el = b; return off;
  },
  addEditorButton(el) { $('edButtons').append(el); return () => el.remove(); },
  addStatusItem(render) { const el = h('span', { class: 'status-item' }); $('statusItems').append(el); render(el); return () => el.remove(); },
  addCommand(cmd) { commands.set(cmd.id, cmd); return () => commands.delete(cmd.id); },
  runCommand: (id) => commands.get(id)?.run(),
  setTheme(name) { document.documentElement.dataset.theme = name; },
};

// ---------------------------------------------------------------- app object
const app = {
  name: APP_NAME, version: VERSION, editor, project: projectApi, ui, events, pdf,
  compile: () => runCompile(), get lastResult() { return lastResult; },
  goto, setProblems(source, list) { problems.set(source, list); if (!list.length) problems.delete(source); renderProblems(); },
};
const modules = createModuleHost(app);
window.texbench = { app, modules, readFolder: (...a) => readFolder(...a), writeFolder: (...a) => writeFolder(...a) };       // handy for debugging and for module authors

function goto(file, line) {
  if (!project.files[file]) return;
  if (file !== active) openFile(file);
  if (line) editor.gotoLine(line);
}

// ---------------------------------------------------------------- files
function openFile(path) {
  if (!project || !path || !project.files[path]) return;
  active = path; project.lastOpen = path;
  const f = project.files[path];
  $('fileName').textContent = path;
  const text = f.t != null;
  $('ed').hidden = !text; $('binview').hidden = text;
  if (text) { editor.open(path, f.t); applyDiagnostics(); }
  else showBinary(path, f.b);
  renderTree(); events.emit('open', path);
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
    for (let i = 1; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); if (!seen.has(d)) { seen.add(d); rows.push(h('div', { class: 'tree-dir', style: { paddingLeft: 8 + (i - 1) * 14 + 'px' } }, '▾ ' + parts[i - 1])); } }
    rows.push(h('div', { class: 'tree-file' + (p === active ? ' on' : ''), style: { paddingLeft: 8 + (parts.length - 1) * 14 + 'px' }, title: p, onClick: () => openFile(p), onContextmenu: (e) => { e.preventDefault(); fileMenu(p, { x: e.clientX, y: e.clientY }); } },
      h('span', { class: 'fname' }, parts[parts.length - 1]), p === main ? h('span', { class: 'star', title: 'Main file (the one that is compiled)' }, '★') : null,
      h('button', { class: 'icon more', title: 'Rename, delete…', 'aria-label': 'File actions for ' + p, onClick: (e) => { e.stopPropagation(); fileMenu(p, e.currentTarget); } }, '⋯')));
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
async function runCompile() {
  clearTimeout(compileTimer);
  if (!project) return;
  if (compiling) { dirty = true; return; }
  const main = mainFile();
  if (!main) { setStatus('No .tex file to compile', 'warn'); return; }
  compiling = true; dirty = false;
  setStatus('Compiling…', 'busy');
  const files = new Map(Object.entries(project.files).map(([p, f]) => [p, f.t != null ? f.t : f.b]));
  let r;
  try { r = await compileProject(files, main, project.engine || 'pdflatex'); }
  catch (e) { r = { success: false, error: e.message, log: String(e.stack || e), ms: 0 }; }
  compiling = false;
  lastResult = { ...r, mainFile: main };
  const list = parseLog(r.log, main, Object.keys(project.files));
  if (!r.success && !list.some(p => p.severity === 'error')) list.unshift({ severity: 'error', file: main, line: null, message: r.error || 'Compilation failed. See the log for details.' });
  problems.set('compile', list); renderProblems();
  $('logText').textContent = r.log || r.error || '';
  const errs = list.filter(p => p.severity === 'error').length, warns = list.filter(p => p.severity === 'warning').length;
  if (r.success && r.pdf) {
    try { await pdf.load(r.pdf); $('pdfEmpty').hidden = true; } catch (e) { console.error(e); }
    sendPdfToTab();
    sync = r.syncTexData ? parseSyncTeX(r.syncTexData) : null;
    setStatus(`Compiled in ${(r.ms / 1000).toFixed(1)} s` + (errs ? ` · ${errs} error${errs > 1 ? 's' : ''}` : warns ? ` · ${warns} warning${warns > 1 ? 's' : ''}` : ''), errs ? 'err' : 'ok');
  } else {
    setStatus(`${errs || 1} error${errs > 1 ? 's' : ''} — PDF not updated`, 'err');
    if (!pdf.pageCount) showBottom('problems');
  }
  events.emit('compile', lastResult);
  if (dirty) runCompile();
}
function setStatus(text, kind = '') { const s = $('status'); s.textContent = text; s.className = 'status ' + kind; $('compileBtn').classList.toggle('busy', kind === 'busy'); }

// ---------------------------------------------------------------- problems + log
function allProblems() { return [...problems.entries()].flatMap(([source, list]) => list.map(p => ({ ...p, source: source === 'compile' ? 'LaTeX' : source }))); }
function renderProblems() {
  const order = { error: 0, warning: 1, info: 2 };
  const list = allProblems().sort((a, b) => order[a.severity] - order[b.severity]);
  const errs = list.filter(p => p.severity === 'error').length;
  $('tabProblems').textContent = `Problems${list.length ? ` (${list.length})` : ''}`;
  $('tabProblems').classList.toggle('has-err', errs > 0);
  $('problemList').replaceChildren(...(list.length ? list.map(p => h('button', { class: 'problem ' + p.severity, onClick: () => p.file && goto(p.file, p.line) },
    h('span', { class: 'sev', title: p.severity }, p.severity === 'error' ? '●' : p.severity === 'warning' ? '▲' : '○'), h('span', { class: 'msg' }, p.message),
    h('span', { class: 'where' }, (p.source !== 'LaTeX' ? p.source + ' · ' : '') + (p.file || '') + (p.line ? ':' + p.line : '')))) : [h('p', { class: 'muted pad' }, 'No problems found.')]));
  applyDiagnostics();
}
function applyDiagnostics() { if (active && projectApi.isText(active)) editor.setDiagnostics(allProblems().filter(p => p.file === active)); }
function showBottom(which) {
  const open = which && !(document.body.dataset.bottom === which);
  document.body.dataset.bottom = open ? which : '';
  $('tabProblems').classList.toggle('on', open && which === 'problems'); $('tabLog').classList.toggle('on', open && which === 'log');
  $('problemList').hidden = !(open && which === 'problems'); $('logText').hidden = !(open && which === 'log');
  $('bottomBody').hidden = !open;
}

// ---------------------------------------------------------------- projects
async function loadProject(p) {
  await flush();
  project = p; active = null; lastResult = null; sync = null; problems.clear(); pdf.clear(); $('pdfEmpty').hidden = false;
  $('projName').textContent = p.name; document.title = `${p.name} — ${APP_NAME}`;
  prefs.set('lastProject', p.id);
  renderTree(); renderProblems();
  openFile(p.lastOpen && p.files[p.lastOpen] ? p.lastOpen : mainFile() || projectApi.files()[0]);
  events.emit('project'); events.emit('files');
  scheduleCompile(0);
}
async function createProject(name, files, extra = {}) {
  const p = { id: uid(), name, main: null, engine: 'pdflatex', files, created: Date.now(), updated: Date.now(), ...extra };
  await store.put(p); await loadProject(p); return p;
}
const sampleFiles = () => ({ 'main.tex': { t: SAMPLE_MAIN }, 'references.bib': { t: SAMPLE_BIB } });
async function projectMenu() {
  const list = await store.list();
  menu($('projBtn'), [
    { label: 'New blank project…', onClick: async () => { const n = await promptBox('New project', 'Project name', 'Untitled paper'); if (n) createProject(n, { 'main.tex': { t: BLANK_MAIN } }); } },
    { label: 'New sample project', onClick: () => createProject('Sample paper', sampleFiles()) },
    { label: 'Import a .zip…', title: 'For example a project downloaded from another LaTeX editor', onClick: async () => { const [f] = await pickFiles('.zip', false); if (f) importZip(f, true); } },
    { label: 'Open a folder from this computer…', disabled: !window.showDirectoryPicker, title: window.showDirectoryPicker ? '' : 'Needs Chrome or Edge', onClick: openFolder },
    '-',
    { label: 'Rename this project…', onClick: async () => { const n = await promptBox('Rename project', 'Project name', project.name); if (n) { project.name = n; $('projName').textContent = n; document.title = `${n} — ${APP_NAME}`; save(); } } },
    { label: 'Download as .zip', onClick: exportZip },
    { label: 'Save back to its folder', disabled: !project.fromFolder, title: project.fromFolder ? '' : 'Only for projects opened from a folder', onClick: saveToFolder },
    { label: 'Delete this project…', onClick: deleteProject },
    ...(list.length > 1 ? ['-', { heading: 'Your projects' }, ...list.filter(p => p.id !== project.id).slice(0, 12).map(p => ({ label: p.name, hint: new Date(p.updated).toLocaleDateString(), onClick: async () => loadProject(await store.get(p.id)) }))] : []),
  ]);
}
async function deleteProject() {
  if (!await confirmBox('Delete project', `Delete “${project.name}” from this browser? This cannot be undone. Download a .zip first if you want a copy.`, 'Delete', true)) return;
  clearTimeout(saveTimer); const id = project.id; project = null; await store.del(id); await store.kvDel('dir:' + id);
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
const SKIP_DIR = /^(\.git|node_modules|\.svn|__pycache__|_minted.*)$/, SKIP_FILE = /\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex\.gz|synctex|blg|nav|snm|vrb|bcf|run\.xml)$|^\.DS_Store$/i;
async function readFolder(dir, prefix = '', files = {}) {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') { if (!SKIP_DIR.test(name)) await readFolder(handle, prefix + name + '/', files); continue; }
    if (SKIP_FILE.test(name)) continue;
    const f = await handle.getFile();
    if (f.size > 30e6) continue;
    const buf = new Uint8Array(await f.arrayBuffer());
    files[prefix + name] = isTextPath(name) ? { t: new TextDecoder().decode(buf) } : { b: buf };
  }
  return files;
}
async function writeFolder(dir, files) {
  let n = 0;
  for (const [p, f] of Object.entries(files)) {
    const parts = p.split('/'); let d = dir;
    for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
    const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
    const w = await fh.createWritable(); await w.write(f.t != null ? f.t : f.b); await w.close(); n++;
  }
  return n;
}
async function openFolder() {
  let dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return; }
  const files = await readFolder(dir);
  if (!Object.keys(files).length) return toast('No usable files in that folder.', 'err');
  const p = await createProject(dir.name, files, { fromFolder: dir.name });
  await store.kvSet('dir:' + p.id, dir);
  toast(`Opened ${Object.keys(files).length} files. Changes stay in the browser until you choose “Save back to its folder”.`);
}
async function saveToFolder() {
  const dir = await store.kvGet('dir:' + project.id);
  if (!dir) return toast('The link to the folder was lost. Download a .zip instead.', 'err');
  try {
    if ((await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') return toast('Permission to write to the folder was not given.', 'err');
    const n = await writeFolder(dir, project.files);
    if (lastResult?.success && lastResult.pdf) { const fh = await dir.getFileHandle(mainFile().replace(/\.tex$/i, '') .split('/').pop() + '.pdf', { create: true }); const w = await fh.createWritable(); await w.write(lastResult.pdf); await w.close(); }
    toast(`Saved ${n} files to “${dir.name}”.`);
  } catch (e) { toast('Could not save to the folder: ' + e.message, 'err'); }
}

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
        h('p', { class: 'muted small' }, `${APP_NAME} ${VERSION}. Independent project; not affiliated with or endorsed by Overleaf or any other LaTeX service. `, h('a', { href: 'LICENSES.txt', target: '_blank', rel: 'noopener' }, 'Open-source licences')));
    };
    draw();
  }, buttons: [{ label: 'Done', primary: true }] });
}
function applyPrefs() { document.documentElement.style.setProperty('--ed-size', prefs.get('size', 14) + 'px'); editor.setWrap(prefs.get('wrap', true)); }

// ---------------------------------------------------------------- command palette
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
function showInPdf() {
  if (!sync || !active) return toast('Compile first, then try again.');
  const hit = forward(sync, active, editor.getCursor().line);
  if (!hit) return toast('This line does not appear in the PDF.');
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
  $('pdfModeBtn').textContent = mode === 'side' ? 'PDF ▾' : mode === 'hidden' ? 'PDF: hidden ▾' : 'PDF: in tab ▾';
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
  menu($('pdfModeBtn'), Object.entries(PDF_MODES).map(([k, label]) => ({ label: (pdfMode === k ? '✓ ' : '\u2003') + label, onClick: () => setPdfMode(k) })));
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
  { id: 'core.saveFolder', name: 'Save project back to its folder', run: () => project.fromFolder ? saveToFolder() : toast('This project was not opened from a folder.') },
].forEach(c => commands.set(c.id, c));

$('projBtn').onclick = projectMenu;
$('compileBtn').onclick = runCompile; $('compileBtn').title = `Compile (${MOD}+Enter)`;
$('auto').checked = prefs.get('auto', true); $('auto').onchange = (e) => { prefs.set('auto', e.target.checked); if (e.target.checked) scheduleCompile(0); };
$('featBtn').onclick = featuresDialog; $('paletteBtn').onclick = palette; $('paletteBtn').title = `All commands (${MOD}+Shift+P)`;
$('newFileBtn').onclick = newFile; $('uploadBtn').onclick = async () => addFiles(await pickFiles());
$('tabProblems').onclick = () => showBottom('problems'); $('tabLog').onclick = () => showBottom('log');
$('zoomOut').onclick = () => pdf.setZoom(pdf.zoom / 1.15); $('zoomIn').onclick = () => pdf.setZoom(pdf.zoom * 1.15); $('zoomFit').onclick = () => pdf.setZoom(1);
$('pdfModeBtn').onclick = pdfModeMenu; $('pdfTabBtn').onclick = () => setPdfMode('tab'); $('pdfHideBtn').onclick = () => setPdfMode('hidden');
$('pdfDownload').onclick = downloadPdf; $('syncBtn').onclick = showInPdf; $('syncBtn').title = `Show the cursor's line in the PDF (${MOD}+J). Double-click the PDF to jump to the source.`;
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 'Enter' || (e.key.toLowerCase() === 's' && !e.shiftKey))) { e.preventDefault(); runCompile(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette(); }
  else if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); showInPdf(); }
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
