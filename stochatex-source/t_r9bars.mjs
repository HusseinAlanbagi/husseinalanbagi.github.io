// Round 9: identity chips beside the top bar, the second format block, filled rows; lead/lag/steady state.
import { open } from './t_app.mjs';
const W = +(process.argv[2] || 1500);
const { b, p, errs } = await open();
await p.setViewport({ width: W, height: 820 });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
await p.evaluate(() => window.texbench.app.project.write('main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nAs (\\ref{eq:profit}) and \\eqref{eq:profit} show.\n\\begin{equation}\\label{eq:profit}\n  \\Pi_t = \\beta E_t \\Pi_{t+1} + y_{h,t}\n\\end{equation}\n\\end{document}\n', { open: true }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
await (await p.$('.vz-dmath')).click(); await sleep(1400);
console.log('chips:', await p.$$eval('.vz-idchip', cs => cs.map(c => c.getAttribute('aria-label')).join(' | ')));
console.log('rows:', await p.$$eval('.vz-fmt-bar', bs => bs.map(b => [...b.querySelectorAll('.vz-frow')].map(r => r.querySelectorAll('button').length).join('/')).join('  +  ')));
const inside = await p.evaluate(() => { const sd = window.texbench.app.editor.view.scrollDOM.getBoundingClientRect(); return [...document.querySelectorAll('.vz-edit-bar, .vz-fmt-wrap, .vz-idchips')].map(e => { const r = e.getBoundingClientRect(); return `${e.className.split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)} ${r.left >= sd.left - 1 && r.right <= sd.right + 1 ? 'OK' : 'OUT'}`; }); });
console.log(W, inside.join(' ; '));
const mfv = () => p.evaluate(() => document.querySelector('.vz-edit math-field').getValue('latex'));
const click = (re) => p.evaluate((re) => { const b = [...document.querySelectorAll('.vz-fmt-wrap button')].find(x => new RegExp(re).test(x.title)); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, re);
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.selection = { ranges: [[0, 0]] }; });
await click('^Lead'); await sleep(200); console.log('lead:', await mfv());
await click('^Lag'); await sleep(200); await click('^Lag'); await sleep(200); console.log('lag x2:', await mfv());
await click('^Steady state'); await sleep(200); console.log('steady:', await mfv());
await p.screenshot({ path: `/tmp/stx/r9bars${W}.png` });
// references menu
await p.evaluate(() => { const c = [...document.querySelectorAll('.vz-idchip')].find(x => /Referred/.test(x.getAttribute('aria-label'))); c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
await sleep(300); console.log('refs menu:', await p.$$eval('.menu button', bs => bs.map(x => x.textContent).join(' | ')));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
