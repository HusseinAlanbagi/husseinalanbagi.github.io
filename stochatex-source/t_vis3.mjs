import { open } from './t_app.mjs';
import fs from 'node:fs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await waitCompiled();
await p.evaluate((main, bib) => { const a = window.texbench.app; a.project.write('refs.bib', bib); a.project.write('main.tex', main, { open: true }); }, fs.readFileSync('/tmp/vt/main.tex', 'utf8'), fs.readFileSync('/tmp/vt/refs.bib', 'utf8'));
const collect = async (sel) => { const seen = new Map(); const H = await p.$eval('.cm-scroller', e => e.scrollHeight); for (let y = 0; y < H + 800; y += 500) { await p.evaluate((y) => { document.querySelector('.cm-scroller').scrollTop = y; }, y); await sleep(120); for (const [k, v] of await p.evaluate((sel) => { const v = window.texbench.app.editor.view; return [...document.querySelectorAll(sel)].map(el => [el.textContent, v.state.doc.lineAt(v.posAtDOM(el)).number]); }, sel)) seen.set(k + '@' + v, 1); } await p.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = 0; }); return [...seen.keys()]; };
await sleep(500);
console.log('estimated', await collect('.tb-pb'));
await sleep(1500); console.log(await waitCompiled()); await sleep(600);
console.log('measured', await collect('.tb-pb'));
await p.click('.vz-switch'); await sleep(2500);
console.log('cites', await collect('.vz-cite'));
console.log('refs', await collect('.vz-ref'));
console.log('fn', await collect('.vz-fn'), 'thm', await collect('.vz-thmhead'), 'cap', await collect('.vz-capnum'));
const shot = async (line, f) => { await p.evaluate((n) => { const v = window.texbench.app.editor.view; const pos = v.state.doc.line(n).from; v.dispatch({ effects: window.texbench.app.editor.cm.EditorView.scrollIntoView(pos, { y: 'start' }) }); }, line); await sleep(900); await p.screenshot({ path: f, clip: { x: 278, y: 40, width: 590, height: 840 } }); };
await shot(25, '/tmp/w1.png'); await shot(36, '/tmp/w2.png'); await shot(46, '/tmp/w3.png'); await shot(62, '/tmp/w4.png'); await shot(100, '/tmp/w5.png');
await p.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = 1e6; }); await sleep(800); await p.screenshot({ path: '/tmp/w6.png', clip: { x: 278, y: 40, width: 590, height: 840 } });
// selection in page view
await p.evaluate(() => { const v = window.texbench.app.editor.view; const l = v.state.doc.line(30); v.focus(); v.dispatch({ selection: { anchor: l.from + 10, head: l.from + 300 }, scrollIntoView: true }); }); await sleep(400);
await p.screenshot({ path: '/tmp/w7.png', clip: { x: 278, y: 40, width: 590, height: 840 } });
// source view with breaks + selection
await p.click('.vz-switch'); await sleep(400);
await p.evaluate(() => { const v = window.texbench.app.editor.view; const l = v.state.doc.line(24); v.focus(); v.dispatch({ selection: { anchor: l.from + 3, head: v.state.doc.line(28).from + 20 }, scrollIntoView: true }); }); await sleep(400);
await p.screenshot({ path: '/tmp/w8.png', clip: { x: 278, y: 40, width: 590, height: 840 } });
console.log(errs.slice(0, 8)); await b.close();
