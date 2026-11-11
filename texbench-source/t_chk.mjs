import { checkProject } from './static/modules/model-checks.js';
const t = String.raw`
\begin{align}
\hat{y}_t &= \mathbb{E}_t \hat{y}_{t+1} - \frac{1}{\sigma}(\hat{\imath}_t - \mathbb{E}_t \pi_{t+1}) + \varepsilon^d_t \\
\pi_t &= \beta \pi_{t+1} + \kappa \hat{y}_t \\
K_{t+1} &= (1-\delta) K_t + I_t \\
Y_t &= A_t K_{t-1}^{\alpha} \bar{N} + N_{ss} + \sigma_t
\end{align}`;
const r = checkProject([{ path: 'main.tex', text: t }]);
console.log(r.problems.map(p => `${p.line} ${p.severity}: ${p.message}`).join('\n')); console.log(JSON.stringify(r.summary, (k, v) => k === 'first' ? undefined : v));
const sample = (await import('./src/template.js')).default ?? null; 
