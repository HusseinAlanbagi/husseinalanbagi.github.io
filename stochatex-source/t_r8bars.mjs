// Round 8: rearranged equation bars stay on screen; accent on/off; flip beside fraction; Box/Unbox.
import { open } from './t_app.mjs';
const W = +(process.argv[2] || 1500);
const { b, p, errs } = await open();
await p.setViewport({ width: W, height: 800 });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
await p.evaluate(() => window.texbench.app.project.write('main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nWe have $\\bar{\\Xi} = \\frac{\\varepsilon_d}{\\varepsilon_d - 1}$, and more text after it to fill the line.\n\\begin{equation}\\label{eq:a}\n  y_t = \\frac{a}{b} + x\n\\end{equation}\n\\end{document}\n', { open: true }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
const src = () => p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
const inside = () => p.evaluate(() => { const sd = window.texbench.app.editor.view.scrollDOM.getBoundingClientRect(); return [...document.querySelectorAll('.vz-edit-bar, .vz-fmt-bar')].map(e => { const r = e.getBoundingClientRect(); return `${e.className.split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(sd.left)}..${Math.round(sd.right)} ${r.left >= sd.left - 1 && r.right <= sd.right + 1 ? 'OK' : 'OUT'}`; }); });
// inline maths
await (await p.$('.vz-imath, .cm-content mjx-container')).click(); await sleep(1200);
console.log(W, 'inline:', await inside());
console.log('top bar:', await p.$$eval('.vz-edit-bar > button', bs => bs.map(x => x.getAttribute('aria-label')).join(' | ')));
console.log('rows:', await p.$$eval('.vz-frow', rs => rs.map(r => r.querySelectorAll('button').length).join(' / ')), '| flip after fraction:', await p.$$eval('.vz-frow:nth-child(3) button', bs => bs[1]?.title.slice(0, 20)));
await p.keyboard.press('Escape'); await sleep(500);
// display: accent on/off
await (await p.$('.vz-dmath')).click(); await sleep(1200);
console.log(W, 'display:', await inside()); await p.screenshot({ path: `/tmp/stx/bars${W}.png` });
const mfv = () => p.evaluate(() => document.querySelector('.vz-edit math-field').getValue('latex'));
const clickBtn = (re) => p.evaluate((re) => { const b = [...document.querySelectorAll('.vz-fmt-bar button')].find(x => new RegExp(re).test(x.title)); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, re);
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.selection = { ranges: [[0, 1]] }; });
console.log('selected:', await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); return mf.getValue(0, 1, 'latex'); }));
await clickBtn('^Hat'); await sleep(200); console.log('hat once:', await mfv());
await clickBtn('^Hat'); await sleep(200); console.log('hat twice:', await mfv());
await clickBtn('^Bar'); await sleep(200); await clickBtn('^Bar'); await sleep(200); console.log('bar twice:', await mfv());
// select an accented thing and click
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.value = '\\tilde{p}_t = x'; mf.selection = { ranges: [[0, 3]] }; });
console.log('sel:', await p.evaluate(() => document.querySelector('.vz-edit math-field').getValue(0, 1, 'latex')));
await clickBtn('^Tilde'); await sleep(200); console.log('tilde off on selected \\tilde{p}:', await mfv());
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.value = 'a+\\hat{q}'; mf.position = mf.lastOffset; });
await clickBtn('^Hat'); await sleep(200); console.log('hat off at cursor after \\hat{q}:', await mfv());
// flip
await p.evaluate(() => { const mf = document.querySelector('.vz-edit math-field'); mf.value = '\\frac{a}{b}'; mf.position = 1; });
await clickBtn('^Flip'); await sleep(200); console.log('flip:', await mfv());
// box / unbox label
await p.evaluate(() => [...document.querySelectorAll('.vz-edit-bar > button')].find(x => /^More/.test(x.getAttribute('aria-label'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(300); console.log('menu:', await p.$$eval('.menu button', bs => bs.map(x => x.textContent).filter(t => /Box|Unbox|LaTeX|full editor|Delete/.test(t)).join(' | ')));
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Box it/.test(x.textContent)).click()); await sleep(300);
await p.evaluate(() => [...document.querySelectorAll('.vz-edit-bar > button')].find(x => /^More/.test(x.getAttribute('aria-label'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(300); console.log('after boxing:', await mfv(), '|', await p.$$eval('.menu button', bs => bs.map(x => x.textContent).filter(t => /Box|Unbox/.test(t)).join(' | ')));
await p.keyboard.press('Escape');
await p.screenshot({ path: `/tmp/stx/bars${W}.png` });
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
