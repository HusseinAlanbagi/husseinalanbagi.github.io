// Round 6 (24 Nov 2026): a table's maths editor closed by a click beside the table must not move the page; coming back to a file keeps its place.
//   node t_r6jump.mjs <sel|tree|blur> <top|right|left|below|pdf>   (node serve.mjs ../stochatex first)
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1000);
let paras = ''; for (let i = 0; i < 40; i++) paras += `Paragraph ${i} with some words that fill the line and make the paper long enough to scroll a good deal. More words here.\n\n`;
const doc = String.raw`\documentclass{article}
\usepackage{amsmath,booktabs}
\begin{document}
\section{Intro}
` + paras + String.raw`
\begin{table}[htbp]
  \centering
  \caption{Calibration}
  \begin{tabular}{lcc}
    \toprule
    Name & Symbol & Value \\
    \midrule
    Discount & $\beta$ & 0.99 \\
    Habit & $\hat{c}_t^{*}$ & 0.7 \\
    \bottomrule
  \end{tabular}
\end{table}
` + paras + '\\end{document}\n';
await p.evaluate((d) => { const a = window.texbench.app; a.project.write('main.tex', d, { open: true }); a.project.write('other.tex', 'Other file.\n\n', {}); }, doc);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1500);
const sc = () => p.evaluate(() => window.texbench.app.editor.view.scrollDOM.scrollTop);
const tabTop = () => p.evaluate(() => { const t = document.querySelector('.vz-tabedit, .cm-content table'); return t ? Math.round(t.getBoundingClientRect().top) : null; });
const state = async (l) => console.log(l.padEnd(22), 'scroll', await sc(), 'table', await tabTop(), 'cellmath', !!(await p.$('.vz-cellmath')), 'tabedit', !!(await p.$('.vz-tabedit')), 'cellbar', await p.$$eval('.vz-cellbar', x => x.length), 'file', await p.evaluate(() => window.texbench.app.editor.path));
const openCell = async () => {
  const td = await p.evaluateHandle(() => document.querySelector('.vz-tabedit .vz-cm') || [...document.querySelectorAll('.cm-content td')].find(td => td.querySelector('svg')));
  await td.click(); await sleep(900);
  const mc = await p.$('.vz-tabedit .vz-cm'); if (mc && !(await p.$('.vz-cellmath'))) { await mc.click(); await sleep(900); }
};
const away = async () => { const bx = await p.evaluate(() => { const r = window.texbench.app.editor.view.scrollDOM.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 }; }); await p.mouse.click(bx.x, bx.y); await sleep(1500); };
await p.evaluate(() => { window.texbench.app.editor.view.scrollDOM.scrollTop = 2791; }); await sleep(800);
const mode = process.argv[2] || 'tree';
if (mode === 'sel') { await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ selection: { anchor: 5 }, scrollIntoView: false }); v.scrollDOM.scrollTop = 2791; }); await sleep(600); await state('sel at top'); }
await openCell(); await state('cell open');
await p.keyboard.down('Control'); await p.keyboard.press('c'); await p.keyboard.up('Control'); await sleep(300);
if (mode === 'sel') { } else if (mode === 'blur') {
  await p.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); });
  const p2 = await b.newPage(); await p2.goto('about:blank'); await sleep(800); await p.bringToFront(); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(1200);
  await state('back from tab');
} else {
  // click other.tex in the file tree
  const other = await p.evaluateHandle(() => [...document.querySelectorAll('#tree *')].find(e => e.children.length === 0 && /other\.tex/.test(e.textContent)));
  await other.click(); await sleep(1000); await state('in other');
  await p.click('.cm-content'); await p.keyboard.down('Control'); await p.keyboard.press('v'); await p.keyboard.up('Control'); await sleep(400);
  const main = await p.evaluateHandle(() => [...document.querySelectorAll('#tree *')].find(e => e.children.length === 0 && /main\.tex/.test(e.textContent)));
  await main.click(); await sleep(1500); await state('back in main');
  const back = await p.$('.nav-back, [class*="back"]'); 
  await p.evaluate(() => { window.texbench.app.editor.view.scrollDOM.scrollTop = 2791; }); await sleep(1000); await state('scrolled to table');
  await openCell(); await state('cell open again');
}
const where = process.argv[3] || 'top';
const bx = await p.evaluate((w) => { const r = window.texbench.app.editor.view.scrollDOM.getBoundingClientRect(); const pdf = document.getElementById('pdfwrap')?.getBoundingClientRect();
  return w === 'right' ? { x: r.right - 25, y: r.top + r.height / 2 } : w === 'left' ? { x: r.left + 8, y: r.top + r.height / 2 } : w === 'below' ? { x: r.left + r.width / 2, y: r.bottom - 15 } : w === 'pdf' && pdf ? { x: pdf.left + pdf.width / 2, y: pdf.top + pdf.height / 2 } : { x: r.left + r.width / 2, y: r.top + 40 }; }, where);
console.log('click at', where, bx, await p.evaluate((b) => { const e = document.elementFromPoint(b.x, b.y); return e && (e.className || e.tagName); }, bx));
await p.mouse.click(bx.x, bx.y); await sleep(1500);
await state('after click away'); await p.screenshot({ path: '/tmp/stx/away.png' }); console.log('sel', await p.evaluate(() => { const v = window.texbench.app.editor.view; const h = v.state.selection.main.head; return h + ' line ' + v.state.doc.lineAt(h).number + ': ' + v.state.doc.lineAt(h).text; }));

console.log(errs.filter(e => !/google/.test(e)).slice(0, 10));
await b.close();
