// Round 6: Duplicate / Cut beside Copy, \cdot on the format bar, search B5/B6, keyboard table picker B7
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
word sword Word word1
\begin{equation}\label{eq:a}
  a_t = b_t
\end{equation}
Middle text.
\begin{align}
  c_t &= d_t \label{eq:c} \\
  e_t &= f_t \label{eq:e}
\end{align}
\end{document}
`;
const A = 'window.texbench.app';
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
const src = () => p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
// in-place bar: Duplicate and Cut beside Copy
let eqs = await p.$$('.vz-dmath'); await eqs[0].click(); await sleep(1200);
console.log('bar:', await p.$$eval('.vz-edit-bar > button', bs => bs.map(x => x.getAttribute('aria-label')).join(' | ')));
console.log('fmt bar has cdot:', await p.$$eval('.vz-fmt-bar button', bs => bs.some(x => /cdot/.test(x.title))));
await p.evaluate(() => [...document.querySelectorAll('.vz-edit-bar > button')].find(x => /^Duplicate/.test(x.getAttribute('aria-label'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(800);
let s = await src(); console.log('after duplicate:', JSON.stringify(s.slice(s.indexOf('\\begin{equation}'), s.indexOf('Middle'))));
await p.keyboard.press('Escape'); await sleep(500);
eqs = await p.$$('.vz-dmath'); await eqs[1].click(); await sleep(1000);
await p.evaluate(() => [...document.querySelectorAll('.vz-edit-bar > button')].find(x => /^Cut/.test(x.getAttribute('aria-label'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(600);
s = await src(); console.log('after cut: equations left', (s.match(/\\begin\{equation\}/g) || []).length);
// cdot button inserts
eqs = await p.$$('.vz-dmath'); await eqs[0].click(); await sleep(1000);
await p.evaluate(() => [...document.querySelectorAll('.vz-fmt-bar button')].find(x => /cdot/.test(x.title)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(500); s = await src(); console.log('cdot inserted:', /\\cdot/.test(s));
await p.keyboard.press('Escape'); await sleep(400);
// B5 / B6 search
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ selection: { anchor: 0 } }); v.focus(); });
await p.keyboard.down('Control'); await p.keyboard.press('f'); await p.keyboard.up('Control'); await sleep(300);
await p.keyboard.type('word'); await sleep(300);
const tog = (t) => p.evaluate((t) => [...document.querySelectorAll('.fb-tog')].find(x => x.textContent === t).click(), t);
await tog('ab'); await sleep(200); console.log('whole word:', await p.$eval('.fb-count', e => e.textContent));
await tog('TeX'); await sleep(200); console.log('whole word + TeX:', await p.$eval('.fb-count', e => e.textContent));
await tog('All files'); await sleep(300); console.log('project:', await p.$eval('.fb-results .fb-file', e => e.textContent));
await p.evaluate(() => { const v = window.texbench.app.editor.view; const t = v.state.doc.toString(); const i = t.indexOf('sword'); v.dispatch({ changes: { from: i, to: i + 5, insert: 'word' } }); });
await sleep(700); console.log('project after edit:', await p.$eval('.fb-results .fb-file', e => e.textContent), '| this file:', await p.$eval('.fb-count', e => e.textContent));
await p.keyboard.press('Escape'); await sleep(300);
// B7 table picker
await p.click('[data-tb="table"]'); await sleep(400);
console.log('picker focus:', await p.evaluate(() => document.activeElement.className + ' ' + document.activeElement.getAttribute('role')));
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown'); await sleep(100);
console.log('label:', await p.$eval('.vz-tabgrid-l', e => e.textContent));
await p.keyboard.press('Tab'); console.log('tab ->', await p.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent));
await p.keyboard.press('Escape'); await sleep(200); console.log('closed:', !(await p.$('.vz-tabgrid')), 'focus back:', await p.evaluate(() => document.activeElement.dataset?.tb || document.activeElement.className));
await p.click('[data-tb="table"]'); await sleep(400); await p.keyboard.press('Enter'); await sleep(800);
s = await src(); console.log('inserted 3x3 table:', /\\begin\{tabular\}\{lcc\}/.test(s));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
