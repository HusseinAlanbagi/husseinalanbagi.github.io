import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open(); const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready'); await waitCompiled();
await p.click('#pdfHideBtn'); await sleep(200); console.log('hidden', await p.$eval('#pdfwrap', e => getComputedStyle(e).display), await p.$eval('#pdfModeBtn', e => e.textContent));
await p.click('#pdfModeBtn'); await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Beside/.test(x.textContent)).click()); await sleep(200);
const nt = new Promise(r => b.once('targetcreated', t => r(t))); await p.click('#pdfTabBtn'); const t = await (await nt).page(); await sleep(2500);
console.log('tab pages', await t.$$eval('.pdfpage', e => e.length), await p.$eval('#pdfModeBtn', e => e.textContent)); await t.screenshot({ path: '/tmp/tab.png' });
t.evaluate(() => document.getElementById('dock').click()).catch(() => {}); await sleep(900); await p.bringToFront(); await sleep(300);
console.log('docked', await p.$eval('#pdfwrap', e => getComputedStyle(e).display), await p.$eval('#pdfModeBtn', e => e.textContent));
// rail collapse + features dialog
await p.evaluate(() => document.querySelector('.rail-btn.on').click()); await sleep(200); console.log('side collapsed', await p.$eval('#side', e => getComputedStyle(e).display));
await p.evaluate(() => document.querySelector('.rail-btn').click());
await p.click('#featBtn'); await sleep(300); await p.screenshot({ path: '/tmp/feat.png' });
console.log(errs); await b.close();
