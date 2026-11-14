import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
// rail
const railBtns = await p.$$('.rail-btn');
await railBtns[0].click(); await sleep(200); await railBtns[0].click(); await sleep(200);
console.log('side still open after second click:', !(await p.evaluate(() => document.body.classList.contains('side-off'))));
await p.click('#sideHide'); await sleep(200);
console.log('hidden by «:', await p.evaluate(() => document.body.classList.contains('side-off')));
await railBtns[1].click(); await sleep(200);
console.log('reopened by rail:', !(await p.evaluate(() => document.body.classList.contains('side-off'))));
await p.keyboard.down('Control'); await p.keyboard.press('Backslash'); await p.keyboard.up('Control'); await sleep(200);
console.log('Ctrl+\\ hides:', await p.evaluate(() => document.body.classList.contains('side-off')));
await p.keyboard.down('Control'); await p.keyboard.press('Backslash'); await p.keyboard.up('Control'); await sleep(200);
// brightness
await p.click('[data-appearance]'); await sleep(300);
await p.evaluate(() => { const r = document.querySelector('.ap-pop input[type=range]'); r.value = 60; r.dispatchEvent(new Event('input')); });
console.log('paper at 60:', await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper')));
await p.screenshot({ path: '/tmp/ap.png' });
await p.evaluate(() => { const r = document.querySelector('.ap-pop input[type=range]'); r.value = 100; r.dispatchEvent(new Event('input')); });
await p.mouse.click(600, 500);
// auto package
const doc = String.raw`\documentclass{article}
\begin{document}
Real numbers $\mathbb{R}$ and \cref{x}.
\begin{align} a &= b \end{align}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.compile());
await sleep(25000);
console.log('preamble now:', await p.evaluate(() => window.texbench.app.editor.getText().split('\\begin{document}')[0]));
console.log('toasts:', await p.$$eval('.toast', t => t.map(x => x.textContent)));
console.log('status:', await p.$eval('#status', e => e.textContent));
console.log(errs.slice(0, 4)); await b.close();
