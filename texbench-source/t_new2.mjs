import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); console.log('first:', await waitCompiled());
const T = () => p.evaluate(() => window.texbench.app.editor.getText());
// ---- equation dock
await p.evaluate(() => { const a = window.texbench.app, t = a.editor.getText(); a.editor.setPos(t.indexOf('\\pi_t = \\beta')); });
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /Equation/.test(x.getAttribute('aria-label'))).click());
await p.waitForSelector('#dock iframe'); const fr = await (await p.$('#dock iframe')).contentFrame();
await fr.waitForSelector('math-field'); await sleep(1500);
console.log('dock info:', await p.$eval('#dockInfo', e => e.textContent));
const before = await T();
await sleep(600); console.log('unchanged after load:', before === await T());
await fr.evaluate(() => { const mf = document.getElementById('mf'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); mf.insert('+u_t'); mf.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(700); const after = await T();
console.log('source changed by dock:', after !== before, JSON.stringify(after.slice(after.indexOf('eq:nkpc') - 40, after.indexOf('eq:nkpc') + 90)));
// source -> dock
await p.evaluate(() => { const a = window.texbench.app, t = a.editor.getText(), i = t.indexOf('\\kappa'); a.editor.replaceRange(i, i + 6, '\\lambda'); });
await sleep(900); console.log('dock follows source:', await fr.evaluate(() => document.getElementById('mf').value.includes('lambda')));
await p.screenshot({ path: '/tmp/n3.png' });
// new equation
await p.evaluate(() => { const a = window.texbench.app, t = a.editor.getText(); a.editor.setPos(t.indexOf('\\section{Calibration}')); });
await sleep(700); console.log('dock info:', await p.$eval('#dockInfo', e => e.textContent));
await fr.evaluate(() => { const mf = document.getElementById('mf'); mf.focus(); mf.insert('a^2+b^2=c^2'); mf.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(500); await p.evaluate(() => [...document.querySelectorAll('#dockActions button')].find(x => /Insert/.test(x.textContent)).click()); await sleep(600);
console.log('inserted:', (await T()).includes('a^2+b^2=c^2'), '| info:', await p.$eval('#dockInfo', e => e.textContent));
await p.click('#dockClose'); await sleep(200);
// ---- typeset view: whole page
await p.click('.vz-switch'); await sleep(100);
console.log('visual on:', await p.$eval('.vz-switch', e => e.getAttribute('aria-checked')));
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true })); await sleep(2500);
await p.screenshot({ path: '/tmp/n4.png' });
await p.evaluate(() => [...document.querySelectorAll('#topTools button')][0].click()); await sleep(600); await p.screenshot({ path: '/tmp/n5.png' });
await p.evaluate(() => [...document.querySelectorAll('#topTools button')][0].click());
await p.click('.vz-switch');
// ---- linked folder (using the browser's private file system as the folder)
const r = await p.evaluate(async () => {
  const root = await navigator.storage.getDirectory(); try { await root.removeEntry('paper', { recursive: true }); } catch {}
  const dir = await root.getDirectoryHandle('paper', { create: true });
  await window.texbench.linkFolder(dir); await new Promise(r => setTimeout(r, 800));
  const names = async () => { const o = []; for await (const [n] of dir.entries()) o.push(n); return o.sort(); };
  const read = async (n) => await (await (await dir.getFileHandle(n)).getFile()).text();
  const out = { afterLink: await names(), chip: document.getElementById('folderChip').textContent };
  const a = window.texbench.app; a.project.open('main.tex'); await new Promise(r => setTimeout(r, 100));
  a.editor.replaceRange(0, 0, '% edited in the app\n'); await new Promise(r => setTimeout(r, 1500));
  out.editSaved = (await read('main.tex')).startsWith('% edited in the app');
  a.project.write('notes.txt', 'hello'); a.project.remove('proof.tex'); await new Promise(r => setTimeout(r, 1500));
  out.afterAddRemove = await names();
  // change made outside the app
  await new Promise(r => setTimeout(r, 50));
  const fh = await dir.getFileHandle('notes.txt'); const w = await fh.createWritable(); await w.write('changed outside'); await w.close();
  const nf = await dir.getFileHandle('extra.tex', { create: true }); const w2 = await nf.createWritable(); await w2.write('% new outside'); await w2.close();
  await dir.removeEntry('references.bib');
  await window.texbench.folderPull({ quiet: false }); await new Promise(r => setTimeout(r, 500));
  out.pulled = [a.project.read('notes.txt'), a.project.read('extra.tex'), a.project.exists('references.bib')];
  out.chip2 = document.getElementById('folderChip').textContent;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await sleep(4000); console.log('pdf in folder:', await p.evaluate(async () => { const root = await navigator.storage.getDirectory(); const dir = await root.getDirectoryHandle('paper'); const o = []; for await (const [n] of dir.entries()) o.push(n); return o.sort(); }));
// reload: project reconnects to the folder
await p.reload(); await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1500);
console.log('after reload chip:', await p.$eval('#folderChip', e => e.hidden + ' ' + e.textContent));
await p.screenshot({ path: '/tmp/n6.png' });
console.log(errs.slice(0, 10)); await b.close();
