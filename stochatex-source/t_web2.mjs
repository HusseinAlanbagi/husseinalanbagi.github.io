import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}
\section{Household}
The Lagrangian is
\begin{equation}
  \mathcal{L} = \mathbb{E}_0 \sum_{t=0}^{\infty} \beta^t \left[ \frac{C_t^{1-\sigma}}{1-\sigma} - \chi \frac{N_t^{1+\varphi}}{1+\varphi} + \lambda_t \left( W_t N_t + R_{t-1} B_{t-1} + D_t - P_t C_t - B_t - T_t \right) + \mu_t \left( (1-\delta) K_{t-1} + I_t - K_t \right) \right]
\end{equation}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await p.click('.vz-more'); await sleep(200);
await p.evaluate(() => [...document.querySelectorAll('.vz-seg button')].find(x => /^Web/.test(x.textContent)).click()); await sleep(200);
await p.keyboard.press('Escape'); await sleep(2500);
console.log(await p.$eval('.vz-dmath', e => ({ zoom: e.firstElementChild?.style.zoom, aria: e.querySelector('[aria-label]')?.getAttribute('aria-label').slice(0, 400), w: e.scrollWidth, cw: e.clientWidth })));
await (await p.$('.vz-dmath')).screenshot({ path: '/tmp/lag.png' });
console.log(errs.slice(0, 3)); await b.close();
