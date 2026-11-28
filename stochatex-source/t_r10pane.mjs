// Round 10: in the split screen's second pane (unlocked) equations and tables, maths in cells included, open and
// edit like in the first; in the locked pane nothing opens.
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
await p.evaluate(() => window.texbench.app.project.write('main.tex', String.raw`\documentclass{article}
\usepackage{amsmath,booktabs}
\begin{document}
Text.
\begin{equation}\label{eq:a}
  y_t = x_t
\end{equation}
\begin{table}[h]
  \centering
  \begin{tabular}{lc}
    \toprule
    Name & Symbol \\
    \midrule
    Discount & $\beta$ \\
    \bottomrule
  \end{tabular}
\end{table}
\end{document}
`, { open: true }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1200);
await p.click('#splitBtn'); await sleep(1200);
const src = () => p.evaluate(() => window.texbench.app.project.read('main.tex'));
// locked: clicking the equation opens nothing
await (await p.$('.ed2-body .vz-dmath')).click(); await sleep(700);
console.log('locked, editor opened:', !!(await p.$('.ed2-body .vz-edit')), '| toast:', await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' / ').slice(0, 70)));
await p.click('.ed2-lock'); await sleep(300);
// equation in the pane
await (await p.$('.ed2-body .vz-dmath')).click(); await sleep(1300);
console.log('pane equation editor:', !!(await p.$('.ed2-body .vz-edit')), '| bars:', await p.$$eval('.ed2-body .vz-edit-bar > *', bs => bs.length));
await p.evaluate(() => { const mf = document.querySelector('.ed2-body .vz-edit math-field'); mf.position = mf.lastOffset; });
await p.keyboard.type('+z'); await sleep(700);
console.log('typed into pane eq:', /x_t\s*\+\s*z|x_\{t\}\+z/.test(await src()), JSON.stringify((await src()).match(/y_.*= .*/)?.[0]));
await p.keyboard.press('Escape'); await sleep(600);
// table in the pane
const td = await p.evaluateHandle(() => [...document.querySelectorAll('.ed2-body td')].find(t => /Discount/.test(t.textContent)));
await td.click(); await sleep(900);
console.log('pane table editor:', !!(await p.$('.ed2-body .vz-tabedit')), '| focus in pane cell:', await p.evaluate(() => !!document.activeElement.closest('.ed2-body td')));
await p.keyboard.press('End'); await p.keyboard.type(' rate'); await sleep(900);
console.log('typed into pane cell:', (await src()).includes('Discount rate'));
// maths in a cell of the pane
const mtd = await p.evaluateHandle(() => [...document.querySelectorAll('.ed2-body .vz-tabedit td')].find(t => /Discount/.test(t.textContent))?.nextElementSibling);
await mtd.click(); await sleep(500);
const chip = await p.$('.ed2-body .vz-tabedit td.editing .vz-cm'); if (chip) { await chip.click(); await sleep(1000); }
console.log('pane cell maths open:', !!(await p.$('.vz-cellmath')));
await p.evaluate(() => { const mf = document.querySelector('.vz-cellmath'); if (mf) mf.position = mf.lastOffset; }); await p.keyboard.type('^2'); await sleep(1000);
console.log('cell maths typed:', /\\beta\^2|\\beta\^\{2\}/.test(await src()), (await src()).match(/Discount[^\n]*/)?.[0]);
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
