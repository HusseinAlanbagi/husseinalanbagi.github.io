// Round 7 (25 Nov 2026): compile results never cross projects; out-of-date PDF bar; menus close with Esc;
// asking before unnumbering a labelled equation; Dynare export lists missing parameter values.
//   node serve.mjs ../stochatex  then  node t_r7.mjs
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(500);
const T = window => 0;
// 1. switch project while the sample compiles
await p.evaluate(() => { const a = window.texbench.app; a.project.write('main.tex', a.project.read('main.tex') + ' ', {}); a.compile(); });
await sleep(150);
await p.evaluate(() => window.texbench.createProject('Review B', { 'main.tex': { t: '\\documentclass{article}\n\\begin{document}\nHello B.\n\\end{document}\n' } }));
await sleep(25000);
const probs = await p.evaluate(() => document.getElementById('problemList').textContent);
console.log('1 no sample problems in B:', !/calvo|smets|\.bib/i.test(probs), '| status:', await p.$eval('#status', e => e.textContent));
// 2. freshness bar
console.log('2 fresh bar hidden after compile:', await p.$eval('#pdfFresh', e => e.hidden));
await p.evaluate(() => { document.getElementById('auto').checked && document.getElementById('auto').click(); });
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: v.state.doc.length - 15, insert: ' more' } }); });
await sleep(800);
console.log('2 stale bar:', await p.$eval('#pdfFresh', e => !e.hidden && e.textContent));
await p.evaluate(() => [...document.querySelectorAll('#pdfFresh button')][0]?.click()); await sleep(6000);
console.log('2 after Compile now hidden:', await p.$eval('#pdfFresh', e => e.hidden));
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: v.state.doc.length - 15, insert: ' \\undefinedcmd ' } }); window.texbench.app.compile(); });
await sleep(6000);
console.log('2 failed bar:', await p.$eval('#pdfFresh', e => !e.hidden && e.textContent));
// 3. menu Esc
await p.click('#pdfModeBtn'); await sleep(300);
console.log('3 menu open, focus in menu:', !!(await p.$('.menu')), await p.evaluate(() => !!document.activeElement.closest('.menu')));
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Escape'); await sleep(200);
console.log('3 Esc closed, focus back:', !(await p.$('.menu')), await p.evaluate(() => document.activeElement.id));
// 4. unnumber with labels (in-place)
await p.evaluate(() => window.texbench.app.project.write('main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nSee \\eqref{eq:c}.\n\\begin{align}\n  c_t &= d_t \\label{eq:c} \\\\\n  e_t &= f_t\n\\end{align}\n\\end{document}\n', { open: true }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
await (await p.$('.vz-dmath')).click(); await sleep(1200);
await p.evaluate(() => [...document.querySelectorAll('.vz-edit-bar > button')].find(x => /^Number/.test(x.getAttribute('aria-label'))).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(500);
console.log('4 dialog:', await p.evaluate(() => document.querySelector('.modal')?.textContent.replace(/\s+/g, ' ').slice(0, 220)));
await p.evaluate(() => [...document.querySelectorAll('.modal-foot button')].find(x => /labelled rows/.test(x.textContent)).click()); await sleep(400);
const s4 = await p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
console.log('4 result:', JSON.stringify(s4.slice(s4.indexOf('\\begin{align'), s4.indexOf('\\end{document}'))));
// 5. Dynare missing values
await p.evaluate(() => window.texbench.app.project.write('main.tex', '\\documentclass{article}\n\\begin{document}\n\\begin{equation}\n  y_t = \\rho y_{t-1} + \\varepsilon_t\n\\end{equation}\n\\end{document}\n', { open: true }));
await sleep(500);
await sleep(1500); await p.evaluate(() => window.texbench.app.ui.runCommand('dynare.export')); await sleep(1500);
console.log('5 modal:', await p.evaluate(() => document.querySelector('.modal h2')?.textContent), await p.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' / ')));
console.log('5 note:', await p.evaluate(() => document.querySelector('.dyn-missing')?.textContent));
console.log('5 code:', await p.evaluate(() => document.querySelector('.modal textarea')?.value.split('\n').filter(l => /rho|DRAFT/.test(l)).join(' | ')));
await p.keyboard.press('Escape');
await p.evaluate(() => window.texbench.app.project.write('old.mod', 'var y;\nvarexo e;\nparameters rho;\nrho = 0.9;\nmodel;\ny = rho*y(-1) + e;\nend;\n', {}));
await p.evaluate(() => window.texbench.app.ui.runCommand('dynare.export')); await sleep(800);
console.log('5 with .mod:', await p.evaluate(() => document.querySelector('.modal textarea')?.value.split('\n').filter(l => /^rho|DRAFT/.test(l)).join(' | ')), '|', await p.evaluate(() => document.querySelector('.dyn-missing')?.textContent || document.querySelector('.modal .muted')?.textContent));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
