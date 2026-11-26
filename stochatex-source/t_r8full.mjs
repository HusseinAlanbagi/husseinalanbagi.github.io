// Round 8: in the full equation editor a second click on an accent takes it off.
import { open } from './t_app.mjs';
const { b, p, errs } = await open({ path: 'equation/index.html' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForFunction(() => window.__olveCards, { timeout: 30000 }); await sleep(600);
const val = () => p.evaluate(() => document.getElementById('mf').getValue('latex'));
await p.evaluate(() => { const mf = document.getElementById('mf'); mf.value = 'a+x'; mf.focus(); mf.position = mf.lastOffset; });
await p.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Accents$/.test(b.textContent.trim()))?.click()); await sleep(200);
const hat = () => p.evaluate(() => { const b = [...document.querySelectorAll('.rb, button')].find(b => /^Hat/.test(b.title || '')); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); });
await hat(); await sleep(200); console.log('hat once:', await val());
await hat(); await sleep(200); console.log('hat twice:', await val());
console.log(errs);
await b.close();
