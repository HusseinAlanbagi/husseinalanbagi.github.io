import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:8124/texbench/?x=1#y', { waitUntil: 'networkidle2' }); await sleep(500);
console.log('old address ->', p.url());
await p.waitForSelector('body.ready', { timeout: 60000 });
for (let i = 0; i < 90; i++) { const s = await p.$eval('#status', e => e.textContent).catch(() => ''); if (/Compiled|error/i.test(s)) { console.log('status:', s); break; } await sleep(1000); }
console.log('title:', await p.title(), '| pages:', await p.$$eval('.pdfpage', e => e.length));
await p.goto('http://localhost:8124/texbench/equation/', { waitUntil: 'networkidle2' }); await sleep(300); console.log('old equation ->', p.url());
await p.goto('http://localhost:8124/overleaf-equation-editor/', { waitUntil: 'networkidle2' }); await sleep(500); console.log('older equation ->', p.url());
console.log(errs.slice(0, 4)); await b.close();
