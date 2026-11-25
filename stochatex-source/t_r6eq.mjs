// Round 6: align labels stay on their rows (B2), multline* (B4), labels on inline maths (B3), Undo per equation box (B1)
import { open } from './t_app.mjs';
const { b, p, errs } = await open({ path: 'equation/index.html' }); p.on('response', r => { if (r.status() >= 400) console.log('404', r.url()); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForFunction(() => window.__olveCards, { timeout: 30000 }); await sleep(800);
const setIn = (t) => p.evaluate((t) => { const i = document.getElementById('input'); i.value = t; i.dispatchEvent(new Event('input')); }, t);
const val = () => p.evaluate(() => document.getElementById('input').value);
// B2
await setIn('\\begin{align}\nx_t &= a_t \\label{eq:rowone} \\\\\ny_t &= b_t \\label{eq:rowtwo}\n\\end{align}'); await sleep(400);
await p.evaluate(() => { const mf = document.getElementById('mf'); mf.focus(); mf.executeCommand('moveToMathfieldEnd'); });
await p.evaluate(() => { const mf = document.getElementById('mf'); mf.executeCommand('moveToMathfieldEnd'); mf.insert('+z'); mf.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(400);
console.log('B2:', JSON.stringify(await val()));
// B2 numbering toggle keeps rows
await p.click('#numBtn'); await sleep(300); console.log('R7 asks:', await p.evaluate(() => document.querySelector('.unnum-pop')?.textContent.replace(/\s+/g, ' ').slice(0, 120))); await p.evaluate(() => [...document.querySelectorAll('.unnum-pop button')].find(b => /only the labelled/.test(b.textContent))?.click()); await sleep(300); console.log('B2 star:', JSON.stringify(await val()));
await p.click('#numBtn'); await sleep(300); console.log('B2 unstar:', JSON.stringify(await val()));
// B4
await setIn('\\begin{multline}\na + b \\\\\n+ c \\label{eq:m}\n\\end{multline}'); await sleep(300);
await p.click('#numBtn'); await sleep(300); await p.evaluate(() => [...document.querySelectorAll('.unnum-pop button')].find(b => /Remove numbers/.test(b.textContent))?.click()); await sleep(300); console.log('B4:', JSON.stringify(await val()), await p.$eval('#note', e => e.textContent).catch(() => ''));
await p.click('#numBtn'); await sleep(300); console.log('B4 back:', JSON.stringify(await val()));
// B3
await setIn('$x_t=a_t$'); await sleep(300);
await p.click('#labelBtn'); await sleep(300);
await p.evaluate(() => { const i = document.querySelector('.lblpop input, input[type=text]:focus') || document.activeElement; i.value = 'eq:inline'; });
await p.keyboard.press('Enter'); await sleep(400);
console.log('B3:', JSON.stringify(await val()), await p.$eval('#note', e => e.textContent).catch(() => ''));
await setIn('\\begin{equation*}\nx = 1\n\\end{equation*}'); await sleep(300);
await p.click('#labelBtn'); await sleep(300);
await p.evaluate(() => { document.activeElement.value = 'eq:s'; }); await p.keyboard.press('Enter'); await sleep(400);
console.log('B3 star:', JSON.stringify(await val()));
// B1: undo scoped to cards
await setIn('a = b'); await sleep(200);
await p.click('#numBtn'); await sleep(200);                   // tool change on card 1 (pushes undo)
await p.evaluate(() => { const c = window.__olveCards; }); 
await p.click('#addEq'); await sleep(200); await p.keyboard.type('c = d'); await sleep(300);
console.log('cards:', await p.evaluate(() => window.__olveCards.all()));
await p.click('#undoBtn'); await sleep(300);
console.log('B1 after undo:', JSON.stringify(await p.evaluate(() => window.__olveCards.all())), 'active', await p.evaluate(() => window.__olveCards.active()));
console.log('cdot in Accents:', await p.evaluate(() => [...document.querySelectorAll('.rbody .rb')].slice(0, 2).map(b => b.title).join(' | ')));
console.log(errs);
await b.close();
