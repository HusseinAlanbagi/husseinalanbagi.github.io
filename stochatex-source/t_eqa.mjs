import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/equation/index.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
const r = await p.evaluate(() => {
  const A = window.__olveAutoSize, F = window.__olveFlip;
  return {
    a1: A('(\\frac{a}{b}+c)'), a2: A('\\left(a+b\\right)'), a3: A('[x_t, y)'), a4: A('|\\frac{1}{2}|'), a5: A('\\sqrt[3]{(\\frac{1}{x})}'),
    a6: A('P(A|B)'), a7: A('\\{\\sum_i x_i\\}'), a8: A('\\left[\\frac{1}{2}\\right]'), a9: A('\\bigl(x\\bigr)'),
    f1: F('x=\\frac{a+b}{c}', 6, 6), f2: F('\\dfrac{1}{\\frac{a}{b}}', 15, 15), f3: F('\\frac12', 2, 2)?.text,
  };
});
console.log(JSON.stringify(r, null, 1));
// visual flip
await p.evaluate(() => { const i = document.getElementById('input'); i.value = 'y=\\frac{a}{b}'; i.dispatchEvent(new Event('input')); });
await new Promise(r => setTimeout(r, 300));
await p.evaluate(() => { const mf = document.getElementById('mf'); mf.focus(); mf.position = 4; });
await p.keyboard.down('Alt'); await p.keyboard.press('Slash'); await p.keyboard.up('Alt');
await new Promise(r => setTimeout(r, 300));
console.log('visual flip ->', await p.evaluate(() => document.getElementById('input').value));
// auto-size: toggle and type
await p.click('#sizeBtn');
await p.evaluate(() => { const i = document.getElementById('input'); i.value = ''; i.dispatchEvent(new Event('input')); const mf = document.getElementById('mf'); mf.focus(); });
await p.evaluate(() => { const mf = document.getElementById('mf'); mf.insert('(\\frac{1}{2})', { format: 'latex' }); mf.dispatchEvent(new InputEvent('input', { bubbles: true })); });
await new Promise(r => setTimeout(r, 300));
console.log('autosize typed ->', await p.evaluate(() => document.getElementById('input').value));
await p.click('#cleanBtn'); await new Promise(r => setTimeout(r, 300));
console.log('clean has leftRight?', await p.evaluate(() => document.getElementById('clean').innerText.slice(0, 200)));
await p.click('#sizeBtn');
console.log(errs); await b.close();
