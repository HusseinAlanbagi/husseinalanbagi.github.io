import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
Text.
\begin{align}
  x_t &= y_t \label{eq:x} \\
  z_t &= w_t
\end{align}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2500);
await (await p.$('.vz-dmath')).click(); await sleep(1100);
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.position = 2; });
await p.evaluate(() => { const b = [...document.querySelectorAll('.vz-edit-bar button')].find(x => x.textContent === '⋯'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await sleep(150);
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Duplicate this row/.test(x.textContent)).click()); await sleep(500);
const t = await p.evaluate(() => window.texbench.app.editor.getText()); console.log(t.slice(t.indexOf('\\begin{align}'), t.indexOf('\\end{align}') + 11));
console.log(errs); await b.close();
