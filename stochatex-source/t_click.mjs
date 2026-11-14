import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\textbf{Government Sector}
Government rule can be written as:
\[ a = b \]
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.editor.view.dispatch({ selection: { anchor: 0 } }));
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2500);
const V = (f, ...a) => p.evaluate(f, ...a);
const pt = await V(() => { const w = [...document.querySelectorAll('.cm-line')].find(l => /Government rule/.test(l.textContent)); const r = document.createRange(); const walker = document.createTreeWalker(w, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { const i = n.textContent.indexOf('rule'); if (i >= 0) { r.setStart(n, i + 1); r.setEnd(n, i + 2); const b = r.getBoundingClientRect(); return { x: b.left + 1, y: b.top + b.height / 2 }; } } });
console.log('pt', pt, 'posAtCoords:', await V((pt) => { const v = window.texbench.app.editor.view; const q = v.posAtCoords(pt); return [q, v.state.doc.sliceString(q - 4, q + 4)]; }, pt));
console.log(await V((pt) => { const v = window.texbench.app.editor.view; const top = v.documentTop; const out = [];
  v.viewportLineBlocks.forEach(bk => out.push(['blk', bk.from, bk.to, Math.round(bk.top + top), Math.round(bk.bottom + top), bk.type]));
  [...v.contentDOM.children].forEach(c => { const r = c.getBoundingClientRect(); out.push(['dom', c.className.slice(0, 20), Math.round(r.top), Math.round(r.bottom), c.textContent.slice(0, 20)]); });
  return out.map(x => x.join(' ')).join('\n'); }, pt));
await p.mouse.click(pt.x, pt.y); await sleep(500);
console.log('after click:', await V(() => { const s = window.texbench.app.editor.view.state.selection.main; const d = window.texbench.app.editor.view.state.doc; return [s.from, s.to, d.sliceString(s.from - 4, s.from + 4)]; }));
console.log('active', await V(() => document.activeElement.className));
await b.close();
