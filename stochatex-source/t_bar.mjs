import { open } from './t_app.mjs';
const { b, p, errs } = await open();
await b.defaultBrowserContext().overridePermissions('http://localhost:8123', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
See \eqref{eq:rule}.
\begin{equation}\label{eq:rule}
  i_t = \phi \pi_t
\end{equation}
Text.
\[ a = \frac{b}{c} \]
More.
\begin{align}
  x_t &= y_t \\
  z_t &= w_t
\end{align}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2500);
const V = (f) => p.evaluate(f);
const src = () => V(() => window.texbench.app.editor.getText());
const openEq = async (n) => { await (await p.$$('.vz-dmath'))[n].click(); await sleep(1100); return V(() => document.querySelector('.vz-edit math-field')?.value); };
const barBtn = (t) => p.evaluate((t) => { const b = [...document.querySelectorAll('.vz-edit-bar button')].find(x => x.textContent.startsWith(t)); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, t);
const pick = (re) => p.evaluate((re) => { const b = [...document.querySelectorAll('.menu button')].find(x => new RegExp(re).test(x.textContent)); b.click(); }, re);
console.log('open 1:', await openEq(1));
await barBtn('⋯'); await sleep(150); await pick('Box it'); await sleep(400);
console.log('boxed field:', await V(() => document.querySelector('.vz-edit math-field')?.value), '| src:', (await src()).match(/\\\[.*\\\]/)?.[0]);
await barBtn('Copy'); await sleep(150); console.log('copy menu:', await p.$$eval('.menu button', x => x.map(y => y.textContent)));
await pick('as in the paper'); await sleep(300); console.log('clipboard:', await V(() => navigator.clipboard.readText()));
await barBtn('Copy'); await sleep(150); await pick('For Word'); await sleep(300); console.log('mathml:', (await V(() => navigator.clipboard.readText())).slice(0, 60));
await barBtn('Copy'); await sleep(150); await pick('image'); await sleep(800); console.log('toast:', await p.$$eval('.toast', x => x.map(y => y.textContent).pop()));
await barBtn('Done'); await sleep(400);
console.log('open align:', await openEq(2));
await barBtn('⋯'); await sleep(150); await pick('Box it'); await sleep(500);
let t = await src(); console.log('align src:', t.slice(t.indexOf('\\begin{align}'), t.indexOf('\\end{align}')).replace(/\n/g, ' / '), '| mathtools:', /\\usepackage\{mathtools\}/.test(t));
p.on('dialog', d => d.accept('eq:taylor'));
console.log('open 0:', await openEq(0));
await barBtn('⋯'); await sleep(150); await pick('Rename the label'); await sleep(500);
t = await src(); console.log('labels/refs:', t.match(/\\(label|eqref)\{[^}]*\}/g));
console.log('open 0 again:', await openEq(0));
await barBtn('⋯'); await sleep(150); await pick('Remove its number'); await sleep(400);
console.log('starred:', (await src()).match(/\\begin\{equation\*?\}/g));
await p.screenshot({ path: '/tmp/bar.png' });
console.log(errs.slice(0, 4)); await b.close();
