import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/equation/index.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1500));
const V = (f, ...a) => p.evaluate(f, ...a);
await V(() => { const mf = document.getElementById('mf'); mf.value = 'x+y=z'; }); await p.click('#mf');
const pts = await V(() => { const mf = document.getElementById('mf'); const out = []; for (let k = 0; k <= mf.lastOffset; k++) { const i = mf.getElementInfo(k); out.push(i && i.bounds ? [k, Math.round(i.bounds.left), Math.round(i.bounds.right), Math.round(i.bounds.top + i.bounds.height / 2)] : [k, null]); } return out; });
console.log(pts);
await V(() => { const mf = document.getElementById('mf'); mf.selection = { ranges: [[2, 3]] }; }); // y
const yb = pts.find(x => x[0] === 3), zb = pts.find(x => x[0] === 5);
await p.mouse.move((yb[1] + yb[2]) / 2, yb[3]); await p.mouse.down();
await p.mouse.move((yb[1] + yb[2]) / 2 + 10, yb[3], { steps: 3 }); await p.mouse.move(zb[2] + 2, zb[3], { steps: 5 });
await p.mouse.up(); await new Promise(r => setTimeout(r, 300));
console.log('after move:', await V(() => document.getElementById('mf').getValue('latex')));
console.log(errs); await b.close();
