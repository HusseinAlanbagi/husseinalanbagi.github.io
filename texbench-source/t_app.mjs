import puppeteer from 'puppeteer-core';
export async function open(opts = {}) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--window-size=1500,900'], headless: 'new', defaultViewport: { width: 1500, height: 900 } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 300)); });
  p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
  await p.goto('http://localhost:8123/' + (opts.path || 'index.html'));
  const waitCompiled = async (t = 120000) => { await p.waitForFunction(() => { const s = document.getElementById('status'); return s && !s.classList.contains('busy') && /Compiled|error/.test(s.textContent); }, { timeout: t }); return p.$eval('#status', e => e.textContent); };
  return { b, p, errs, waitCompiled };
}
if (process.argv[1].endsWith('t_app.mjs')) {
  const { b, p, errs, waitCompiled } = await open();
  await p.waitForSelector('body.ready', { timeout: 30000 });
  console.log('status:', await waitCompiled());
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: '/tmp/shot.png' });
  console.log('pages', await p.$$eval('.pdfpage', e => e.length), 'problems', await p.$eval('#tabProblems', e => e.textContent));
  console.log(await p.$$eval('.problem', els => els.map(e => e.textContent).slice(0, 8)));
  console.log(errs.slice(0, 15));
  await b.close();
}
