import { open } from './t_app.mjs';
const { b, p, errs } = await open();
p.on('console', m => { if (/error|Error|PARENT|FRAME/.test(m.text())) console.log('CONSOLE', m.text()); });
await b.defaultBrowserContext().overridePermissions('http://localhost:8123', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
Intro text.
\begin{equation}\label{eq:euler}
  c_t = \beta c_{t+1}
\end{equation}
Middle text.
\begin{equation}
  \mathcal{L} = E_0 \sum_{t=0}^{\infty} \beta^t \left[ \frac{C_t^{1-\sigma}}{1-\sigma} - \chi \frac{N_t^{1+\varphi}}{1+\varphi} + \lambda_t \left( W_t N_t + R_{t-1} B_{t-1} + D_t - P_t C_t - B_t - T_t \right) \right]
\end{equation}
End.
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
const V = (f) => p.evaluate(f);
const src = () => V(() => window.texbench.app.editor.getText());
// side panel
await V(() => { const v = window.texbench.app.editor.view; const t = v.state.doc.toString(); v.focus(); v.dispatch({ selection: { anchor: t.indexOf('c_t =') + 2 } }); });
await sleep(300);
await V(() => window.texbench.app.ui.runCommand('equation.full')); await sleep(2500);
console.log('side panel:', await V(() => !!document.querySelector('.eqside iframe')), await V(() => document.body.classList.contains('eq-side')));
const f = p.frames().find(x => /embed=side/.test(x.url()));
console.log('frame has:', f && await f.evaluate(() => window.__olveCards.all()), f && f.url());
await sleep(2000); console.log('frame later:', await f.evaluate(() => [window.__olveCards.all().slice(0, 30), window.__eqGotSet, document.documentElement.className]));
await f.evaluate(() => { const c = window.__olveCards.box(0); c.value = c.value.replace('c_{t+1}', 'c_{t+1} + 1'); c.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(800);
console.log('paper after side edit:', (await src()).match(/c_t = [^\n]*/)[0]);
await V(() => { const v = window.texbench.app.editor.view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf('mathcal') + 2 } }); }); await sleep(800);
console.log('follows cursor:', (await f.evaluate(() => window.__olveCards.all())).slice(0, 40));
await V(() => [...document.querySelectorAll('.eqside-head button')].find(b => b.textContent === '×').click()); await sleep(300);
console.log('closed:', !(await p.$('.eqside')));
// visual: duplicate, cut, fit
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2500);
const openEq = async (n) => { await (await p.$$('.vz-dmath'))[n].click(); await sleep(1100); };
const more = async (re) => { await V(() => { const b = [...document.querySelectorAll('.vz-edit-bar button')].find(x => x.textContent === '⋯'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }); await sleep(150); const items = await V(() => [...document.querySelectorAll('.menu button')].map(x => x.textContent)); await p.evaluate((re) => [...document.querySelectorAll('.menu button')].find(x => new RegExp(re).test(x.textContent))?.click(), re); return items; };
await V(() => { const v = window.texbench.app.editor.view; v.dispatch({ selection: { anchor: 0 } }); }); await sleep(600);
await openEq(0); console.log('opened?', !!(await p.$('.vz-edit')), await V(() => document.querySelectorAll('.vz-dmath').length));
console.log('menu:', await more('Duplicate this equation')); await sleep(800);
console.log('labels:', (await src()).match(/\\label\{[^}]*\}/g), 'editing copy:', !!(await p.$('.vz-edit')));
await p.keyboard.press('Escape'); await sleep(300);
// wide equation wraps in Page layout
console.log('page wrap:', await V(() => { const els = [...document.querySelectorAll('.vz-dmath')]; const e = els[els.length - 1]; return [e.scrollWidth <= e.clientWidth + 2, e.querySelectorAll('svg').length, e.firstElementChild?.style.zoom]; }));
// fit page
const n = (await p.$$('.vz-dmath')).length; await openEq(n - 1);
const pv = await more('Make it fit the page'); await sleep(500);
console.log('fit modal:', await V(() => document.querySelector('.vz-fitsrc')?.textContent.slice(0, 160)));
await V(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Apply')?.click()); await sleep(500);
console.log('after fit has split:', /\\begin\{split\}/.test(await src()));
// cut whole equation via ctrl+a ctrl+x
await openEq(0); await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.press('x'); await p.keyboard.up('Control'); await sleep(500);
console.log('after cut:', (await src()).includes('eq:euler}') ? 'eq still there' : 'eq removed', '| clipboard:', (await V(() => navigator.clipboard.readText())).slice(0, 40));
console.log(errs.slice(0, 4)); await b.close();
