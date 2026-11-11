import { open } from './t_app.mjs'; import fs from 'node:fs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); console.log('first:', await waitCompiled());
await p.screenshot({ path: '/tmp/n1.png' });
console.log('rail', await p.$$eval('.rail-btn', e => e.map(x => x.title)), 'toolbar', await p.$$eval('#toolbar button', e => e.map(x => x.textContent)));
// ---- proofreading
const tex = fs.readFileSync('/tmp/sample.tex', 'utf8');
await p.evaluate((t) => { const a = window.texbench.app; a.project.write('proof.tex', t, { open: true }); }, tex);
await p.evaluate(() => document.querySelector('.rail-btn[aria-label="Proofreading"]').click());
for (let i = 0; i < 40; i++) { await sleep(1000); const s = await p.$eval('button.status-item', e => e.textContent).catch(() => ''); if (/suggestion/.test(s)) { console.log('proof status:', s, 'after', i + 1, 's'); break; } if (i === 39) console.log('proof status (timeout):', s); }
console.log(await p.$$eval('.pr-item', e => e.map(x => x.querySelector('mark').textContent + ' | ' + x.querySelector('.pr-msg').textContent.slice(0, 70) + ' | ' + [...x.querySelectorAll('.pr-fix')].map(b => b.textContent).join(','))));
await p.screenshot({ path: '/tmp/n2.png' });
console.log(errs.slice(0, 10)); await b.close();
