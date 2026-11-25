// Round 6: the linked panel's Undo never writes into another equation (B1)
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\begin{equation}\label{eq:a}
  a_t = b_t
\end{equation}
Middle.
\begin{equation}\label{eq:b}
  y_t = z_t
\end{equation}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) === 'true') await p.click('.vz-switch');
await sleep(800);
const src = () => p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
const put = (needle) => p.evaluate((n) => { const v = window.texbench.app.editor.view; v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf(n) + 1 } }); v.focus(); }, needle);
await put('a_t'); await sleep(200);
await p.evaluate(() => window.texbench.app.ui.runCommand('equation.side')); await sleep(3000);
const fr = await (await p.$('.eqside-frame')).contentFrame();
await fr.waitForFunction(() => window.__eqGotSet, { timeout: 20000 });
await fr.click('#numBtn'); await sleep(500); console.log('asks with refs:', await fr.evaluate(() => document.querySelector('.unnum-pop li')?.textContent)); await fr.evaluate(() => [...document.querySelectorAll('.unnum-pop button')].find(b => /Remove numbers/.test(b.textContent))?.click()); await sleep(800);
console.log('A unnumbered:', /equation\*\}\\label\{eq:a\}|begin\{equation\*\}/.test(await src()));
await put('y_t'); await sleep(1200);
await fr.click('#undoBtn'); await sleep(800);
const s = await src();
console.log('B intact:', s.includes('\\label{eq:b}') && s.includes('y_t = z_t') || s.includes('y_{t}'), JSON.stringify(s.slice(s.indexOf('Middle'), s.indexOf('\\end{document}'))));
console.log('undo disabled:', await fr.$eval('#undoBtn', e => e.disabled));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
