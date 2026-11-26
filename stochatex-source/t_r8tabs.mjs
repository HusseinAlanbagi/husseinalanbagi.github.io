// Round 8 (26 Nov 2026): two tabs on one project never overwrite each other; version history.
//   node serve.mjs ../stochatex  then  node t_r8tabs.mjs
import { open } from './t_app.mjs';
const { b, p: A, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await A.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1500);
const url = A.url();
const B = await b.newPage(); await B.setViewport({ width: 1500, height: 900 });
B.on('pageerror', e => errs.push('B ' + e.message));
await B.goto(url); await B.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1500);
const text = (P) => P.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
const ro = (P) => P.evaluate(() => document.body.classList.contains('read-only'));
console.log('A read-only:', await ro(A), '| B read-only:', await ro(B), '| B bar:', await B.evaluate(() => document.getElementById('roBar')?.textContent.slice(0, 60)));
// A types; B follows
await A.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: 0, insert: '% edit from A\n' }, userEvent: 'input' }); });
await sleep(1500);
console.log('B follows A:', (await text(B)).startsWith('% edit from A'));
// B cannot change it
await B.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: 0, insert: '% sneaky B\n' } }); });
await sleep(800);
console.log('B change refused:', !(await text(B)).includes('sneaky'), '| A unchanged:', !(await text(A)).includes('sneaky'));
// Edit here instead
await B.evaluate(() => [...document.querySelectorAll('#roBar button')][0].click());
await sleep(2000);
console.log('after hand-over: A ro', await ro(A), '| B ro', await ro(B));
await B.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: 0, insert: '% edit from B\n' }, userEvent: 'input' }); });
await sleep(1500);
console.log('A follows B:', (await text(A)).startsWith('% edit from B'));
// close B: A takes over by itself
await B.close(); await sleep(2000);
console.log('B closed: A ro', await ro(A), '| toast', await A.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' / ').slice(0, 80)));
// conflict: someone saved a newer revision behind A's back
await A.evaluate(() => new Promise((res) => { const r = indexedDB.open('texbench'); r.onsuccess = () => { const d = r.result, t = d.transaction('projects', 'readwrite'), s = t.objectStore('projects'), g = s.get(window.texbench.app.project.id); g.onsuccess = () => { const p = g.result; p.rev += 5; p.files['main.tex'] = { t: '% the other window\n' + p.files['main.tex'].t }; s.put(p); }; t.oncomplete = () => res(); }; }));
await A.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: 0, insert: '% A again\n' }, userEvent: 'input' }); });
await sleep(1500);
console.log('conflict dialog:', await A.evaluate(() => document.querySelector('.modal h2')?.textContent));
await A.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find(x => /Keep this tab/.test(x.textContent)).click());
await sleep(1500);
// history
await A.evaluate(() => window.texbench.app.ui.runCommand('project.history')); await sleep(1000);
const items = await A.evaluate(() => [...document.querySelectorAll('.hist-item')].map(x => x.textContent));
console.log('history items:', items.length, items.slice(0, 4));
await A.evaluate(() => [...document.querySelectorAll('.hist-item')].find(x => /Replaced by another/.test(x.textContent))?.click()); await sleep(800);
console.log('diff shows:', await A.evaluate(() => document.querySelector('.hist-file summary')?.textContent), '|', await A.evaluate(() => [...document.querySelectorAll('.hist-ln.del .hist-tx, .hist-ln.ins .hist-tx')].map(x => x.textContent).slice(0, 4)));
await A.evaluate(() => [...document.querySelectorAll('.hist-acts button')].find(x => /Restore this version/.test(x.textContent)).click()); await sleep(400);
await A.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find(x => /^Restore$/.test(x.textContent)).click()); await sleep(1200);
console.log('restored the other window text:', (await text(A)).startsWith('% the other window'), '| A again gone:', !(await text(A)).includes('% A again'));
const items2 = await A.evaluate(() => [...document.querySelectorAll('.hist-item')].map(x => x.textContent));
console.log('before-restoring kept:', items2.some(x => /Before restoring/.test(x)));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
