import { open } from './t_app.mjs'; import { MOD } from './t_dyn.mjs';
const { b, p, errs, waitCompiled } = await open();
await p.waitForSelector('body.ready', { timeout: 30000 }); console.log('first:', await waitCompiled());
console.log('toolbar:', await p.$$eval('#toolbar button', e => e.map(x => x.textContent)));
console.log('panel:', await p.$eval('#panel-model-checks', e => e.innerText.replace(/\n+/g, ' | ')));
// Dynare import
await p.evaluate((mod) => { const a = window.texbench.app; a.project.write('rbc.mod', mod); const t = a.editor.getText(); a.editor.setPos(t.indexOf('\\section{Calibration}')); }, MOD);
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /Dynare/.test(x.textContent)).click());
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Import from rbc.mod/.test(x.textContent)).click());
await p.waitForSelector('.modal textarea'); console.log('dialog:', await p.$eval('.modal .muted', e => e.textContent.slice(0, 90)));
await p.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find(x => /Insert/.test(x.textContent)).click());
await new Promise(r => setTimeout(r, 400)); await p.evaluate(() => window.texbench.app.compile());
await new Promise(r => setTimeout(r, 300)); console.log('after import:', await waitCompiled());
console.log('has euler label:', await p.evaluate(() => window.texbench.app.editor.getText().includes('\\label{eq:euler-equation}')));
// export
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /Dynare/.test(x.textContent)).click());
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Equations as Dynare/.test(x.textContent)).click());
console.log('export:\n' + (await p.$eval('.modal textarea', e => e.value)).split('\n').slice(0, 14).join('\n'));
await p.evaluate(() => document.querySelector('.modal-head button').click());
// IRF
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /IRF/.test(x.textContent)).click());
await p.waitForSelector('.modal iframe'); const fr = await (await p.$('.modal iframe')).contentFrame();
await fr.waitForSelector('#embedApply', { timeout: 20000 }); await fr.click('#demoBtn'); await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: '/tmp/irf.png' });
await fr.click('#embedApply'); await new Promise(r => setTimeout(r, 600));
console.log('files:', await p.evaluate(() => window.texbench.app.project.files()));
console.log('preamble:', await p.evaluate(() => window.texbench.app.project.read('main.tex').split('\\begin{document}')[0].split('\n').slice(-5)));
await p.evaluate(() => window.texbench.app.compile()); await new Promise(r => setTimeout(r, 300));
console.log('after irf:', await waitCompiled(240000));
await new Promise(r => setTimeout(r, 2500));
console.log('pages', await p.$$eval('.pdfpage', e => e.length), await p.$$eval('.problem', els => els.map(e => e.textContent.slice(0, 160)).slice(0, 10)));
await p.evaluate(() => { const v = document.querySelector('#pdf'); v.scrollTop = document.querySelectorAll('.pdfpage')[1].offsetTop - 10; }); await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: '/tmp/after.png' }); console.log(errs.slice(0, 10)); await b.close();
