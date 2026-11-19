// npm test: fast logic tests (Node), then a browser smoke test against a built app.
//   npm test                 logic tests, then the browser test if ../stochatex (or dist) has been built
//   CHROME=/path/to/chrome   the browser to use (default /usr/bin/google-chrome)
// Exit code 1 if anything fails.
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), app = path.resolve(here, '../../stochatex');
let failed = 0, passed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n       ', e.message.split('\n').slice(0, 4).join('\n        ')); } };

console.log('logic');
const LM = await import(path.join(app, 'modules/lib/latex-math.js'));
const MC = await import(path.join(app, 'modules/model-checks.js'));
await test('symbols and dates', () => {
  const s = LM.scan('c_t^{-\\sigma} = \\beta E_t c_{t+1}^{-\\sigma} R_t').symbols.map(x => `${x.tex}@${x.time}`);
  assert.deepEqual(s.sort(), ['c@0', '\\sigma@null', '\\beta@null', 'c@1', '\\sigma@null', 'R@0'].sort());
});
await test('nested accents (\\hat{\\tilde{p}}) and a date inside an accent (\\tilde{p_t})', () => {
  const a = LM.scan('\\hat{\\tilde{p}}_t').symbols[0], b = LM.scan('\\tilde{p_t}').symbols[0];
  assert.equal(a.tex, '\\hat{\\tilde{p}}'); assert.equal(LM.symName(a), 'p_tilde'); assert.equal(a.time, 0);
  assert.equal(b.tex, '\\tilde{p}'); assert.equal(b.time, 0);
});
await test('Dynare export', () => assert.equal(LM.toDynare('\\hat{y}_t = \\rho \\hat{y}_{t-1} + \\varepsilon_t').text, 'y = rho*y(-1) + eps;'));
await test('model: numbered equations count, starred and \\nonumber do not, % model overrides', () => {
  const t = '\\begin{equation} a_t = b_{t-1} \\end{equation}\n\\begin{equation*} c_t = d_t \\end{equation*}\n\\begin{align} e_t &= f_t \\\\ g_t &= h_t \\nonumber \\end{align}\n\\[ k_t = m_t \\] % model\n';
  const r = MC.checkProject([{ path: 'main.tex', text: t }]);
  assert.equal(r.model.length, 3); assert.equal(r.all.length, 5);
});
await test('model equations list: paper order through \\input, never counted again, up to date', () => {
  const main = '\\begin{document}\n\\section{A}\n\\begin{equation}\\label{eq:a} a_t = b_t \\end{equation}\n\\input{two}\n\\section{C}\n\\begin{equation} c_t = d_{t-1} \\end{equation}\n';
  const two = '\\section{B}\n\\begin{equation} x_t = y_t \\end{equation}\n';
  const files = MC.paperOrder([{ path: 'two.tex', text: two }, { path: 'main.tex', text: main }], 'main.tex');
  const r = MC.checkProject(files), tex = MC.modelListTeX(r.model, files, { group: 'subsection' });
  assert.ok(tex.indexOf('{A}') < tex.indexOf('{B}') && tex.indexOf('{B}') < tex.indexOf('{C}'), 'order A, B, C');
  assert.match(tex, /a_t &= b_t \\tag\{\\ref\{eq:a\}\}/);
  files[0].text += tex + '\n';
  const r2 = MC.checkProject(files);
  assert.equal(r2.model.length, 3);
  const b = MC.listBlocks(files[0].text)[0];
  assert.equal(MC.modelListTeX(r2.model, files, b.opts).replace(/\s+/g, ''), files[0].text.slice(b.from, b.to).replace(/\s+/g, ''));
});
await test('tables: read and write back unchanged, rows, columns, merge, lines', async () => {
  const T = await import(path.join(app, 'modules/lib/table-edit.js'));
  const body = '\n    \\toprule\n    A & B & C \\\\\n    \\midrule\n    $c_t$ & 0.75 & 0.02 \\\\\n    \\multicolumn{2}{c}{Total} & 1 \\\\[2pt]\n    \\bottomrule\n  ';
  const t = T.parseTable('l@{\\quad}cc', body);
  assert.equal(T.serializeTable(t).body, body); assert.equal(T.serializeTable(t).spec, 'l@{\\quad}cc'); assert.equal(T.ruleStyle(t), 'book');
  T.addRow(t, 0); T.addCol(t, 2); T.setAlign(t, 3, 'r'); assert.equal(T.serializeTable(t).spec, 'l@{\\quad}ccr');
  assert.equal(t.rows.length, 4); assert.ok(t.rows.every(r => r.cells.reduce((a, c) => a + c.span, 0) === 4));
  T.merge(t, 0, 0, 1); assert.equal(t.rows[0].cells[0].span, 2); T.split(t, 0, 0); assert.equal(t.rows[0].cells.length, 4);
  T.setRules(t, 'grid'); assert.match(T.serializeTable(t).spec, /^\|l\|@\{\\quad\}c\|c\|r\|$/); T.setRules(t, 'book'); assert.equal(T.ruleStyle(t), 'book');
  T.deleteCol(t, 3); T.deleteRow(t, 1); assert.equal(T.serializeTable(t).spec, 'l@{\\quad}cc');
});
await test('table cells typed as drawn: text, bold, maths and other LaTeX survive', async () => {
  const T = await import(path.join(app, 'modules/lib/table-edit.js'));
  for (const x of ['\\textbf{GDP} growth $g_t$ \\cite{x}', 'R\\&D (\\%)', '$\\hat{c}_t$', 'a~b', '0.75\\textsuperscript{***}', '\\multirow{2}{*}{A}']) assert.ok(T.visualOk(x), x);
  for (const x of ['{\\bf old}', '$$x$$']) assert.ok(!T.visualOk(x), x);
  assert.equal(T.partsTex([{ t: 'text', s: 'R&D 50% x_1 ' }, { t: 'text', s: 'big', b: true }, { t: 'math', tex: 'c_t' }]), 'R\\&D 50\\% x\\_1 \\textbf{big}$c_t$');
});
await test('copying a block of cells: LaTeX grid, text for Excel, HTML', async () => {
  const T = await import(path.join(app, 'modules/lib/table-edit.js'));
  const t = T.parseTable('lcc', '\n A & \\textbf{B} & $c_t$ \\\\\n \\multicolumn{2}{c}{Total} & R\\&D \\\\\n');
  const g = T.copyGrid(t, { r0: 0, r1: 1, c0: 0, c1: 2 });
  assert.deepEqual(g, [['A', '\\textbf{B}', '$c_t$'], ['Total', '', 'R\\&D']]);
  assert.equal(T.gridText(g), 'A\tB\tc_t\nTotal\t\tR&D');
  assert.match(T.gridHtml(g), /<b>B<\/b>/);
});
await test('stacked accents: shown as \\overset while editing, written back unchanged', async () => {
  const vm = await import('node:vm'); const ctx = { window: {}, document: { addEventListener() {} } }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(app, 'equation/brackets.js'), 'utf8'), ctx);
  const B = ctx.window.StochaBrackets;
  for (const x of ['\\hat{\\tilde{p}}_t = \\beta \\hat{\\tilde{p}}_{t+1}', '\\hat{\\tilde{\\bar{x}}}', '\\widehat{\\tilde{p}}^{*}', '\\hat{x}']) assert.equal(B.unstackAccents(B.stackAccents(x)), x);
  assert.equal(B.stackAccents('\\hat{\\tilde{p}}'), '\\overset{\\hat{}}{\\tilde{p}}');
});
await test('visual view folds commented-out blocks (comment, \\excludecomment, \\iffalse)', async () => {
  const VM = await import(path.join(app, 'modules/visual-mode.js'));
  const d = '\\documentclass{article}\n\\excludecomment{draft}\n\\begin{document}\nA.\n\\begin{comment}\nx $y$\n\\end{comment}\nB.\n\\begin{draft}\nd\n\\end{draft}\n\\iffalse\nold \\ifx\\a\\b in \\fi still\n\\fi\nC.\n\\end{document}';
  const it = VM.parse(d).items;
  assert.deepEqual(it.filter(x => x.kind === 'cblock').map(x => x.label), ['Commented out', 'Left out (draft)', '\\iffalse … \\fi']);
  assert.ok(!it.some(x => x.kind === 'imath'));
});
await test('published files carry versions (stamp)', () => {
  const ix = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
  assert.match(ix, /app\.css\?v=[0-9a-f]{10}/); assert.match(ix, /core\.js\?v=[0-9a-f]{10}/); assert.match(ix, /<script type="importmap">/);
  const v = JSON.parse(fs.readFileSync(path.join(app, 'version.json'), 'utf8')).v; assert.match(ix, new RegExp(`stx-version" content="${v}"`));
});
await test('the engine worker in the app has our patches', () => {
  assert.equal(fs.readFileSync(path.join(app, 'engine-worker.js'), 'utf8'), fs.readFileSync(path.join(here, '../engine-patches/worker.js'), 'utf8'));
});

// ---- browser smoke test: the app loads, compiles the sample, and shows no errors
const chrome = process.env.CHROME || '/usr/bin/google-chrome';
if (!fs.existsSync(chrome)) console.log('browser: skipped (no Chrome at ' + chrome + ')');
else {
  console.log('browser');
  const { default: puppeteer } = await import('puppeteer-core');
  const http = await import('node:http');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(app, p); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(0);
  const port = srv.address().port;
  const b = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'], headless: 'new', defaultViewport: { width: 1400, height: 900 } });
  try {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(`http://localhost:${port}/`);
    await test('the app starts', () => p.waitForSelector('body.ready', { timeout: 60000 }));
    await test('the sample compiles', async () => { await p.waitForFunction(() => /Compiled|error/i.test(document.getElementById('status').textContent), { timeout: 180000 }); assert.match(await p.$eval('#status', e => e.textContent), /Compiled/); });
    await test('modules load with no page errors', async () => { assert.ok((await p.$$eval('.vz-switch', e => e.length)) === 1); assert.deepEqual(errs, []); });
  } finally { await b.close(); srv.close(); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
