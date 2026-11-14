import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
Some text here.
\begin{equation}
  y_t = c_t + i_t
\end{equation}
\begin{align}
  x_t &= y_t \\
  z_t &= w_t
\end{align}
More text.
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) === 'true') await p.click('.vz-switch');
const put = (s) => p.evaluate((s) => { const v = window.texbench.app.editor.view; const t = v.state.doc.toString(); v.focus(); v.dispatch({ selection: { anchor: t.indexOf(s) + 1 } }); }, s);
const st = () => p.evaluate(() => [!!document.querySelector('#dock:not([hidden]) iframe, .dock iframe'), document.activeElement.className.slice(0, 20)]);
await put('Some'); await sleep(600); console.log('in text:', await st());
await put('y_t ='); await sleep(1800); console.log('in equation:', await st());
await put('More'); await sleep(800); console.log('left:', await st());
await put('y_t ='); await sleep(1800);
const f = p.frames().find(x => /equation/.test(x.url()));
await f.click('#boxBtn'); await sleep(500);
console.log('boxed:', await p.evaluate(() => window.texbench.app.editor.getText().match(/\\begin\{equation\}[\s\S]*?\\end\{equation\}/)[0]));
await put('x_t &'); await sleep(800);
await f.click('#boxBtn'); await sleep(600);
console.log('align boxed:', await p.evaluate(() => window.texbench.app.editor.getText().match(/\\begin\{align\}[\s\S]*?\\end\{align\}/)[0]));
// close manually while in equation: stays closed
await p.evaluate(() => document.getElementById('dockClose').click()); await sleep(300);
await put('z_t &'); await sleep(800); console.log('after manual close, same eq:', await st());
await put('More'); await sleep(600); await put('y_t'); await sleep(1500); console.log('another eq reopens:', await st());
console.log(errs.slice(0, 3)); await b.close();
