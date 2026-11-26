// Round 8: the cursor stays put while typing inside a table cell (text and maths), and the page does not move.
//   node t_r8table.mjs [layout: page|web] [auto: on|off]
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const LAYOUT = process.argv[2] || 'page', WIDTH = +(process.argv[3] || 1500);
await p.setViewport({ width: WIDTH, height: 860 });
await p.evaluate((L) => { for (const id of ['visual-mode', 'visual']) localStorage.setItem(`tb:m:${id}:layout`, JSON.stringify(L)); }, LAYOUT);
await p.reload(); await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
let paras = ''; for (let i = 0; i < 30; i++) paras += `Paragraph ${i} with some words that fill the line and make the paper long enough to scroll a good deal. More words here.\n\n`;
const doc = String.raw`\documentclass{article}
\usepackage{amsmath,booktabs}
\begin{document}
` + paras + String.raw`
\begin{table}[htbp]
  \centering
  \caption{Calibration}
  \label{tab:cal}
  \begin{tabular}{lcc}
    \toprule
    Name & Symbol & Value \\
    \midrule
    Discount factor & $\beta$ & 0.99 \\
    Habit & $h$ & 0.7 \\` + (process.argv[4] === 'tall' ? Array.from({ length: 30 }, (_, i) => `\n    Row ${i} & $x_{${i}}$ & ${i} \\\\`).join('') : '') + String.raw`
    \bottomrule
  \end{tabular}
\end{table}
` + paras + '\\end{document}\n';
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2500);
for (let y = 0; y < 20000; y += 300) { const ok = await p.evaluate((y) => { const v = window.texbench.app.editor.view; v.scrollDOM.scrollTop = y; return !!document.querySelector('.cm-content table'); }, y); await sleep(120); if (ok) break; }
await p.evaluate(() => { const t = document.querySelector('.cm-content table'), v = window.texbench.app.editor.view; v.scrollDOM.scrollTop += t.getBoundingClientRect().top - 350; }); await sleep(800);
const st = () => p.evaluate(() => {
  const v = window.texbench.app.editor.view, sel = getSelection(), td = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('td');
  let off = null; if (td) { const r = document.createRange(); r.selectNodeContents(td); r.setEnd(sel.anchorNode, sel.anchorOffset); off = r.toString().length; }
  const t = document.querySelector('.vz-tabedit table, .cm-content table');
  const ed = document.querySelector('.vz-tabedit'), bar = document.querySelector('.vz-tabbar');
  const extra = ed ? ` [edTop ${Math.round(ed.getBoundingClientRect().top)} barH ${bar ? Math.round(bar.getBoundingClientRect().height) + "x" + Math.round(bar.getBoundingClientRect().width) : "-"} edW ${Math.round(ed.getBoundingClientRect().width)} par ${ed.parentElement.className.slice(0,30)}:${Math.round(ed.parentElement.getBoundingClientRect().width)} edH ${Math.round(ed.getBoundingClientRect().height)}]` : '';
  return extra + ` scroll ${Math.round(v.scrollDOM.scrollTop)} tableTop ${t ? Math.round(t.getBoundingClientRect().top) : '-'} cell "${td ? td.textContent : '-'}" caret ${off} active ${document.activeElement.tagName}.${document.activeElement.className}`;
});
const cell = await p.evaluateHandle(() => [...document.querySelectorAll('.cm-content td')].find(td => /Discount/.test(td.textContent)));
await cell.click(); await sleep(800);
console.log('opened   ', await st());
// put the caret after "Discount"
await p.evaluate(() => { const td = [...document.querySelectorAll('.vz-tabedit td')].find(td => /Discount/.test(td.textContent)); const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT); const n = w.nextNode(); const r = document.createRange(); r.setStart(n, 8); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
console.log('placed   ', await st());
const barDump = () => p.evaluate(() => [...document.querySelectorAll('.vz-tabbar > *')].map(e => `${e.tagName}.${(e.className || '').toString().slice(0, 18)}:${Math.round(e.getBoundingClientRect().width)}@${Math.round(e.getBoundingClientRect().top)}${e.hidden || getComputedStyle(e).display === 'none' ? '(hid)' : ''}${e.title ? '[' + e.title.slice(0, 14) + ']' : ''}`).join(' '));
const d0 = await barDump();
for (const ch of [' ', 'r', 'a', 't', 'e']) { await p.keyboard.type(ch); await sleep(60); console.log('typed ' + JSON.stringify(ch).padEnd(4), await st()); }
await sleep(1500); console.log('after 1.5s', await st()); { const d1 = await barDump(); const A = d0.split(' '), B = d1.split(' '); console.log('bar diff:', A.filter(x => !B.includes(x)).join(' '), ' => ', B.filter(x => !A.includes(x)).join(' ')); }
await p.keyboard.press('Backspace'); await sleep(80); console.log('backspace ', await st());
await sleep(1500); console.log('after 1.5s', await st());
await p.keyboard.type('x'); await sleep(1200); console.log('typed x+1.2', await st());
// auto-compile finishing while typing
await p.evaluate(() => window.texbench.app.compile()); for (let i = 0; i < 6; i++) { await p.keyboard.type('y'); await sleep(500); } console.log('during compile', await st());
await sleep(3000); console.log('compiled ', await st());
// maths cell
const mst = () => p.evaluate(() => { const v = window.texbench.app.editor.view, mf = document.querySelector('.vz-cellmath'); const t = document.querySelector('.vz-tabedit table'); return `scroll ${Math.round(v.scrollDOM.scrollTop)} tableTop ${t ? Math.round(t.getBoundingClientRect().top) : '-'} math ${mf ? mf.getValue('latex') + ' pos ' + mf.position + '/' + mf.lastOffset : '-'} active ${document.activeElement.tagName}`; });
const btd = await p.evaluateHandle(() => [...document.querySelectorAll('.vz-tabedit td')].find(td => td.querySelector('svg, mjx-container') && /β|\\beta/.test(td.textContent + (td.querySelector('.vz-cm')?.dataset.tex || ''))) || [...document.querySelectorAll('.vz-tabedit td')][4]);
await btd.click(); await sleep(600);
const chip = await p.$('.vz-tabedit td.editing .vz-cm') || await p.$('.vz-tabedit .vz-cm'); await chip.click(); await sleep(1000);
console.log('math open ', await mst());
await p.evaluate(() => { const mf = document.querySelector('.vz-cellmath'); mf.position = mf.lastOffset; });
for (const ch of ['+', 'a', 'b']) { await p.keyboard.type(ch); await sleep(80); console.log('m typed ' + ch, await mst()); }
await sleep(1500); console.log('m 1.5s    ', await mst());
for (const ch of ['c', 'd']) { await p.keyboard.type(ch); await sleep(500); console.log('m typed ' + ch, await mst()); }
await sleep(1500); console.log('m 1.5s    ', await mst());
console.log('source row:', await p.evaluate(() => window.texbench.app.editor.view.state.doc.toString().match(/Discount[^\n]*/)[0]));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
