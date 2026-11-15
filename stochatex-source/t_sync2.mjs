import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const P = window => 0;
await p.evaluate(async () => {
  const pr = window.texbench.app.project;
  await pr.write('main.tex', String.raw`\documentclass{article}
\begin{document}
Intro text here.
\input{chapters/ch2}
\include{ch3}
\end{document}
`, {});
  await pr.write('chapters/ch2.tex', 'Households paragraph one.\n\nSecond paragraph of households.\n', {});
  await pr.write('ch3.tex', 'Third file text.\n', {});
  await pr.write('main.tex', pr.read('main.tex'), { open: true });
});
await p.evaluate(() => window.texbench.app.compile()).catch(e => console.log('cmd', e.message));
await sleep(12000);
const info = await p.evaluate(() => ({ main: window.texbench.app.project.mainFile, ok: window.texbench.app.lastResult?.success }));
console.log(info);
console.log(await p.evaluate(() => (window.texbench.app.lastResult.syncTexData||'').split('\n').filter(l => l.startsWith('Input:')).join('\n')));
for (const f of ['chapters/ch2.tex', 'ch3.tex']) {
  await p.evaluate((f) => window.texbench.app.goto(f, 1), f); await sleep(800);
  await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 3 } }));
  await p.keyboard.down('Control'); await p.keyboard.press('j'); await p.keyboard.up('Control'); await sleep(300); console.log('mark', await p.$$eval('.pdfmark', e => e.map(x => x.parentElement.dataset.page || x.style.top)));
  console.log(f, await p.$eval('#cursorInfo', e => e.textContent + ' | ' + e.className), await p.evaluate(() => window.texbench.app.editor.path));
}
console.log('pageStarts', await p.evaluate(() => JSON.stringify(window.texbench.app.pageStarts('chapters/ch2.tex'))));
console.log('flash', await p.$$eval('#pdfwrap [class*=flash], #pdfwrap [class*=reveal], #pdfwrap [class*=hl]', e => e.map(x => x.className)));
console.log(errs.slice(0, 5)); await b.close();
