import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
let body = '';
for (let s = 1; s <= 12; s++) { body += `\\section{Part ${s}}\\label{sec:${s}}\n`; for (let k = 1; k <= 4; k++) { body += `\\subsection{Sub ${s}.${k}}\n` + `Households in part ${s} maximise utility as in \\citet{calvo1983} and eq.~\\eqref{eq:${s}${k}}. `.repeat(8) + `\n\\begin{equation}\\label{eq:${s}${k}}\n  y_{t} = \\mathbb{E}_t y_{t+1} - \\frac{1}{\\sigma}\\left(i_t - \\pi_{t+1}\\right) + \\varepsilon_t\n\\end{equation}\n\\begin{align}\n  a_t &= b_t \\\\\n  c_t &= d_t\n\\end{align}\n\n`; } }
const doc = `\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\usepackage{natbib}\n\\begin{document}\n${body}\\bibliography{references}\n\\end{document}\n`;
await p.evaluate((d) => window.texbench.app.project.write('long.tex', d, { open: true }), doc);
console.log('lines:', await p.evaluate(() => window.texbench.app.editor.view.state.doc.lines));
const run = async (label) => {
  const t = await p.evaluate(async () => {
    const v = window.texbench.app.editor.view; const pos = v.state.doc.toString().indexOf('Households in part 6'); const out = [];
    for (let i = 0; i < 30; i++) { const t0 = performance.now(); v.dispatch({ changes: { from: pos + 5, insert: 'x' }, userEvent: 'input.type' }); out.push(performance.now() - t0); await new Promise(r => setTimeout(r, 30)); }
    for (let i = 0; i < 30; i++) v.dispatch({ changes: { from: pos + 5, to: pos + 6 }, userEvent: 'delete' });
    out.sort((a, b) => a - b); return [out[15], out[27]];
  });
  console.log(label, 'median/p90 ms:', t.map(x => x.toFixed(1)));
};
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) === 'true') await p.click('.vz-switch');
await sleep(1000); await run('code view');
await p.click('.vz-switch'); await sleep(3000); await run('visual page'); await run('visual page again'); await run('visual page 3');
// per-module: navigation off
await p.evaluate(() => window.texbench.modules.disable('navigation')); await sleep(500); await run('visual, no navigation');
await p.evaluate(() => window.texbench.modules.enable('navigation'));
await p.evaluate(() => window.texbench.modules.disable('model-checks')); await sleep(500); await run('visual, no model check');
await p.evaluate(() => window.texbench.modules.enable('model-checks'));
// profile parse
console.log(await p.evaluate(async () => { const m = await import('./modules/visual-mode.js'); const t = window.texbench.app.editor.getText(); const t0 = performance.now(); for (let i = 0; i < 10; i++) m.parse ? m.parse(t) : null; return 'parse x10: ' + (performance.now() - t0).toFixed(1) + ' (exported: ' + !!m.parse + ')'; }));
console.log(errs.slice(0, 3)); await b.close();
