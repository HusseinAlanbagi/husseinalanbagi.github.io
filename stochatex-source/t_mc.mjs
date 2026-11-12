import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{Model}
\begin{align}
  \hat{y}_t &= \mathbb{E}_t \hat{y}_{t+1} - \frac{1}{\sigma}\left(\hat{\imath}_t - \mathbb{E}_t \pi_{t+1}\right) \label{eq:is} \\
  \pi_t &= \beta \mathbb{E}_t \pi_{t+1} + \kappa \hat{y}_t + u_t \\
  \hat{\imath}_t &= \phi_\pi \pi_t + rer_t \\
  rer_t &= \rho rer_{t-1} + \varepsilon_t
\end{align}
A derivation that is not part of the model:
\begin{equation*}
  \hat{y}_t = -\frac{1}{\sigma}\sum_{k=0}^\infty \mathbb{E}_t (\hat{\imath}_{t+k} - \pi_{t+k+1})
\end{equation*}
\begin{equation}
  z_t = \rho_z z_{t-1} + e_t
\end{equation}
\end{document}
`;
const MOD = `var y i pi rer;\nvarexo eps u e_z;\nparameters sigma beta kappa phi_pi rho;\nmodel;\ny = y(+1) - 1/sigma*(i - pi(+1));\npi = beta*pi(+1) + kappa*y + u;\ni = phi_pi*pi + rer;\nrer = rho*rer(-1) + eps;\nend;\n`;
await p.evaluate((d, m) => { window.texbench.app.project.write('model.mod', m); window.texbench.app.project.write('main.tex', d, { open: true }); }, doc, MOD);
await sleep(1500);
await p.evaluate(() => document.querySelector('[data-panel="model-checks"]') || [...document.querySelectorAll('button')].find(x => /Model check/i.test(x.title || x.textContent))?.click());
const panelText = () => p.evaluate(() => document.querySelector('[data-panel="model-checks"]')?.innerText.replace(/\n+/g, ' | '));
// open the panel
await p.evaluate(() => { const b = [...document.querySelectorAll('.rail button, nav button, button')].find(x => /Model check/i.test(x.title || '')); b?.click(); });
await sleep(1000);
console.log('panel 1:', await panelText());
// read rer as one
await p.evaluate(() => [...document.querySelectorAll('.mc-sugg button')].find(x => x.textContent === 'rer')?.click()); await sleep(800);
console.log('panel 2:', await panelText());
// visual chips
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
console.log('chips:', await p.$$eval('.vz-mc', e => e.map(x => x.textContent + (x.classList.contains('vz-mc-set') ? '*' : ''))));
// put the derivation in the model? no: put the z equation out
await p.evaluate(() => { const c = [...document.querySelectorAll('.vz-mc')].pop(); c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
await sleep(1500);
console.log('src line:', await p.evaluate(() => window.texbench.app.editor.getText().split('\n').find(l => /model/.test(l) && /begin\{equation\}/.test(l))));
console.log('chips 2:', await p.$$eval('.vz-mc', e => e.map(x => x.textContent + (x.classList.contains('vz-mc-set') ? '*' : ''))));
console.log('panel 3:', await panelText());
// visualise
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent === 'Visualise variables').click()); await sleep(1200);
console.log('table rows:', await p.$$eval('.mc-table tbody tr', r => r.map(x => x.querySelector('.mc-sym').title + ':' + x.querySelector('.mc-seg .on').textContent + ':' + x.querySelector('.mc-name').value)));
// make u a shock? it is guessed; change kappa to ignore just to test, then back
await p.evaluate(() => { const r = [...document.querySelectorAll('.mc-table tbody tr')].find(x => x.querySelector('.mc-sym').title === '\\imath'); });
await p.evaluate(() => { const inp = [...document.querySelectorAll('.mc-name')].find(x => x.value === 'i_hat' || x.value === 'i'); inp.value = 'i'; inp.dispatchEvent(new Event('change')); });
await sleep(500);
await p.screenshot({ path: '/tmp/mc1.png' });
await p.evaluate(() => [...document.querySelectorAll('.mc-tabs button')][1].click()); await sleep(500);
console.log('map rows:', await p.$$eval('.mc-map tbody tr', r => r.length), 'cols:', await p.$$eval('.mc-map thead th', r => r.length));
await p.screenshot({ path: '/tmp/mc2.png' });
await p.keyboard.press('Escape'); await sleep(300);
// compare with .mod
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent === 'Compare with .mod').click()); await sleep(200);
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => x.textContent === 'model.mod').click()); await sleep(400);
console.log('compare:', await p.$eval('.mc-cmp', e => e.innerText.replace(/\n+/g, ' | ')));
await p.screenshot({ path: '/tmp/mc3.png' });
await p.keyboard.press('Escape'); await sleep(300);
// export
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /Dynare/.test(x.textContent)).click());
await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Equations as Dynare/.test(x.textContent)).click()); await sleep(300);
console.log('export:\n' + (await p.$eval('.modal textarea', e => e.value)));
console.log(errs.slice(0, 5)); await b.close();
