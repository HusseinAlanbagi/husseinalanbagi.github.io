import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await waitCompiled();
const doc = String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\title{Long equations}
\author{Test}
\begin{document}
\maketitle
\section{Model}
The household's problem gives the Euler equation and the budget constraint below, which are long.
\begin{equation}
  \mathbb{E}_t\left[\beta \frac{\lambda_{t+1}}{\lambda_t}\left(r^k_{t+1} u_{t+1} - a(u_{t+1}) + (1-\delta) q_{t+1}\right)\right] = q_t + \psi_I \left(\frac{I_t}{I_{t-1}} - 1\right)\frac{I_t}{I_{t-1}} - \beta \psi_I \mathbb{E}_t \frac{\lambda_{t+1}}{\lambda_t}\left(\frac{I_{t+1}}{I_t}-1\right)\left(\frac{I_{t+1}}{I_t}\right)^2 + \kappa_1 x_t + \kappa_2 x_{t-1} + \kappa_3 x_{t-2} \label{eq:euler}
\end{equation}
\begin{align}
  c_t + i_t + g_t + \frac{\phi}{2}\left(\frac{w_t}{w_{t-1}}\pi_t - \bar\pi\right)^2 w_t n_t &= w_t n_t + r^k_t u_t k_{t-1} - a(u_t) k_{t-1} + d_t + t_t + \frac{b_{t-1} R_{t-1}}{\pi_t} - b_t + \Omega_1 z_t + \Omega_2 z_{t-1} + \Omega_3 z_{t-2} + \Omega_4 z_{t-3} \\
  y_t &= a_t k_{t-1}^\alpha n_t^{1-\alpha} \label{eq:prod}
\end{align}
A short one: $x = 1$, and a displayed short equation:
\[ y = x^2 \]
See \eqref{eq:euler} and \eqref{eq:prod}.
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await p.click('.vz-more'); await sleep(200);
await p.evaluate(() => [...document.querySelectorAll('.vz-seg button')].find(x => /^Web/.test(x.textContent)).click()); await sleep(200);
await p.screenshot({ path: '/tmp/wb0.png' });
await p.mouse.click(700, 850); await sleep(3000);
const over = () => p.evaluate(() => { const s = document.querySelector('.cm-scroller'); return { scroll: s.scrollWidth, client: s.clientWidth, eqs: [...document.querySelectorAll('.vz-dmath')].map(e => Math.round(e.scrollWidth) + '/' + Math.round(e.clientWidth) + (e.firstElementChild?.style.zoom ? ' zoom ' + (+e.firstElementChild.style.zoom).toFixed(2) : '')) }; });
console.log('narrow:', await over(), 'classes', await p.$eval('.cm-editor', e => e.className));
await p.screenshot({ path: '/tmp/wb1.png' });
await p.click('#pdfHideBtn'); await sleep(1500);
console.log('wide:', await over()); await p.screenshot({ path: '/tmp/wb2.png' });
// page layout still scrolls as before (unchanged behaviour)
await p.click('.vz-more'); await sleep(200); await p.evaluate(() => [...document.querySelectorAll('.vz-seg button')].find(x => /^Page/.test(x.textContent)).click()); await p.mouse.click(700, 850); await sleep(1500);
console.log('page layout:', await p.$eval('.cm-editor', e => e.className.includes('cm-web')));
console.log(errs.slice(0, 5)); await b.close();
