import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\newcommand{\E}{\mathbb{E}}
\begin{document}
\section{Model}
Text with inline $a+b$ here.
\begin{equation}\label{eq:one}
  y_t = \E_t y_{t+1} - \frac{1}{\sigma} r_t
\end{equation}
\begin{align}
  c_t &= \frac{a}{b} \label{eq:c} \\
  k_t &= (1-\delta) k_{t-1} \nonumber \\
  y_t &= c_t + i_t \label{eq:y}
\end{align}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await p.click('.vz-more'); await sleep(200);
await p.evaluate(() => [...document.querySelectorAll('.vz-seg button')].find(x => /^Page/.test(x.textContent)).click()); await sleep(200);
console.log('panel switch:', await p.evaluate(() => [...document.querySelectorAll('.vz-panel .vz-row')].map(x => x.textContent.slice(0, 30) + '=' + x.getAttribute('aria-checked')).join(' | ')));
await p.keyboard.press('Escape'); await sleep(1500);
const src = () => p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
// click the first display equation
let eqs = await p.$$('.vz-dmath'); console.log('display eqs:', eqs.length);
await eqs[0].click(); await sleep(1500);
console.log('editing:', await p.evaluate(() => { const e = document.querySelector('.vz-edit math-field'); return e && e.value; }), 'num:', await p.$eval('.vz-edit-num', e => e.textContent).catch(() => null));
await p.screenshot({ path: '/tmp/ip1.png' });
await p.keyboard.type('+x');
await sleep(400);
let s = await src(); console.log('src eq1:', JSON.stringify(s.slice(s.indexOf('\\begin{equation}'), s.indexOf('\\end{equation}') + 14)));
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(300);
await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(300);
s = await src(); console.log('after undo:', JSON.stringify(s.slice(s.indexOf('\\begin{equation}'), s.indexOf('\\end{equation}') + 14)));
await p.keyboard.press('Escape'); await sleep(500);
console.log('edit closed:', !(await p.$('.vz-edit')));
// align
eqs = await p.$$('.vz-dmath'); await eqs[1].click(); await sleep(800);
console.log('align field:', await p.evaluate(() => document.querySelector('.vz-edit math-field')?.value), await p.$eval('.vz-edit-num', e => e.textContent).catch(() => null));
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.position = 3; });
await p.keyboard.type('2');
await sleep(400);
s = await src(); console.log('src align:', JSON.stringify(s.slice(s.indexOf('\\begin{align}'), s.indexOf('\\end{align}') + 11)));
// flip: put cursor in fraction
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); const v = mf.getValue(); });
await p.keyboard.press('Escape'); await sleep(400);
// alt+click reveals
eqs = await p.$$('.vz-dmath'); await p.keyboard.down('Alt'); await eqs[0].click(); await p.keyboard.up('Alt'); await sleep(400);
console.log('alt-click: edit open?', !!(await p.$('.vz-edit')), 'cursor', await p.evaluate(() => window.texbench.app.editor.view.state.selection.main.head));
// inline
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } })); await sleep(300);
const im = await p.$('.vz-imath'); await im.click(); await sleep(800);
console.log('inline field:', await p.evaluate(() => document.querySelector('.vz-edit math-field')?.value));
await p.keyboard.type('+c'); await sleep(300);
s = await src(); console.log('inline src:', s.match(/inline \$[^$]*\$/)[0]);
await p.screenshot({ path: '/tmp/ip2.png' });
// click away ends
await p.mouse.click(600, 700); await sleep(400);
console.log('closed after click away:', !(await p.$('.vz-edit')));
console.log(errs.slice(0, 5)); await b.close();
