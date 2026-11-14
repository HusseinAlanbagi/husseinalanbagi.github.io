import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = 'Hello world here\n\\textbf{The Central Bank}\nNext $x_t$ and \\[ a = b \\] end\n';
await p.evaluate((d) => window.texbench.app.project.write('notes.tex', d, { open: true }), doc);
await sleep(300);
const txt = () => p.evaluate(() => window.texbench.app.editor.getText());
const sel = (a, b2) => p.evaluate((a, b2) => { const v = window.texbench.app.editor.view; v.focus(); v.dispatch({ selection: { anchor: a, head: b2 } }); }, a, b2);
const key = async (k, shift) => { await p.keyboard.down('Control'); if (shift) await p.keyboard.down('Shift'); await p.keyboard.press(k); if (shift) await p.keyboard.up('Shift'); await p.keyboard.up('Control'); await sleep(100); };
await sel(6, 11); await key('b'); console.log('bold:', JSON.stringify((await txt()).split('\n')[0]));
await key('b'); console.log('unbold:', JSON.stringify((await txt()).split('\n')[0]));
await sel(0, 5); await key('i'); console.log('italic:', JSON.stringify((await txt()).split('\n')[0]));
await sel(0, 0); await key('Shift'); 
// maths
let t = await txt(); let i = t.indexOf('x_t'); await sel(i, i + 1); await key('b'); console.log('math bold:', (await txt()).split('\n')[2]);
// enter after bold line
t = await txt(); i = t.indexOf('Bank}') + 5; await sel(i, i); await p.keyboard.press('Enter'); await p.keyboard.type('Balance');
console.log('enter:', JSON.stringify((await txt()).split('\n').slice(1, 5)));
// paste $$
t = await txt(); await sel(t.length, t.length);
await p.evaluate(() => { const v = window.texbench.app.editor.view; const dt = new DataTransfer(); dt.setData('text/plain', '$$ y = c + i $$'); v.contentDOM.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await sleep(300); console.log('paste:', JSON.stringify((await txt()).slice(-30)), await p.$$eval('.toast', x => x.map(y => y.textContent)));
console.log(errs.slice(0, 3)); await b.close();
