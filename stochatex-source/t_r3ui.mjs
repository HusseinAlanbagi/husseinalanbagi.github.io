import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const V = (f) => p.evaluate(f);
console.log('pdf switch:', await V(() => [document.getElementById('pdfSw').getAttribute('aria-checked'), document.body.classList.contains('pdf-off')]));
await p.click('#pdfSw'); await sleep(300);
console.log('after click:', await V(() => [document.getElementById('pdfSw').getAttribute('aria-checked'), document.body.classList.contains('pdf-off'), Math.round(document.getElementById('edwrap').getBoundingClientRect().width)]));
await p.click('#pdfSw'); await sleep(300);
// find bar + menu
await V(() => window.texbench.app.editor.view.focus());
await p.keyboard.down('Control'); await p.keyboard.press('f'); await p.keyboard.up('Control'); await sleep(300);
await p.click('#pdfModeBtn'); await sleep(300);
console.log('menu items visible:', await V(() => [...document.querySelectorAll('.menu button')].map(b => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return b.textContent.trim() + ':' + (b.contains(el) || el === b); })));
await p.keyboard.press('Escape'); await V(() => document.querySelector('.menu')?.remove());
// appearance
await p.click('[data-appearance]'); await sleep(300);
const pos1 = await V(() => document.querySelector('.ap-pop').getBoundingClientRect().left);
await V(() => [...document.querySelectorAll('.ap-row button')].find(b => b.textContent === 'Dark').click()); await sleep(300);
console.log('appearance stays:', pos1, await V(() => document.querySelector('.ap-pop')?.getBoundingClientRect().left), await V(() => document.documentElement.dataset.theme));
await V(() => [...document.querySelectorAll('.ap-row button')].find(b => b.textContent === 'Light').click()); await sleep(200);
await V(() => document.querySelector('.ap-x').click()); await sleep(200);
console.log('closed by ×:', !(await p.$('.ap-pop')));
await p.screenshot({ path: '/tmp/r3ui.png' });
console.log(errs.slice(0, 3)); await b.close();
