import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:8123/equation/index.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
p.on('console', m => console.log('LOG', m.text()));
const V = (f, ...a) => p.evaluate(f, ...a);
await V(() => { const mf = document.getElementById('mf'); const ex = mf.executeCommand.bind(mf); mf.executeCommand = (c) => { console.log('exec', JSON.stringify(c)); return ex(c); }; mf.addEventListener('input', (e) => console.log('input', e.inputType, mf.getValue('latex'))); mf.addEventListener('keydown', (e) => console.log('kd', e.key), true); });
const val = () => V(() => document.getElementById('mf').getValue('latex'));
async function tryit(v, pos, key) {
  await V((v) => { document.getElementById('mf').value = v; }, v); await p.click('#mf');
  await V((pos) => { const mf = document.getElementById('mf'); mf.position = pos < 0 ? mf.lastOffset + pos + 1 : pos; }, pos);
  await p.keyboard.press(key); await new Promise(r => setTimeout(r, 200));
  console.log(v, 'pos', pos, key, '->', await val());
}
for (const v of ['x=\\left(a+b\\right)+c', 'x=\\left[a+b\\right]']) for (const [pos, key] of [[-3, 'Backspace'], [3, 'Backspace'], [2, 'Delete'], [-1, 'Backspace']]) await tryit(v, pos, key);
await b.close();
