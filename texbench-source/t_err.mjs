import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await waitCompiled();
const doc = String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage[round]{natbib}
\begin{document}
\section{Test}\label{sec:a}
We have $\alpah + 1$ and $\mathbb{R}$.
A table with Smith & Jones and a file_name here.
\begin{itemize}
  \item one
\end{enumerate}
See \ref{sec:b} and \cite{refx}.
\bibliographystyle{plainnat}
\bibliography{references}
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await sleep(1500); console.log(await waitCompiled()); await sleep(300);
const list = await p.$$eval('.problem', e => e.map(x => x.innerText.replace(/\n+/g, ' | ')));
console.log(list.join('\n'));
await p.evaluate(() => document.getElementById('tabProblems').click()); await sleep(300);
await p.screenshot({ path: '/tmp/e1.png' });
// apply the first actionable fix: \alpah -> \alpha
const clicked = await p.evaluate(() => { const b = [...document.querySelectorAll('.fix.do')].find(x => /alpha/.test(x.textContent)); b?.click(); return b?.textContent; });
console.log('clicked', clicked, '->', await p.evaluate(() => window.texbench.app.editor.getText().split('\n')[5]));
await p.evaluate(() => { const b = [...document.querySelectorAll('.fix.do')].find(x => /amssymb/.test(x.textContent)); b?.click(); });
await p.evaluate(() => { const b = [...document.querySelectorAll('.fix.do')].find(x => /\\end\{itemize\}/.test(x.textContent)); b?.click(); });
console.log(await p.evaluate(() => window.texbench.app.editor.getText().split('\n').slice(0, 12).join('\n')));
// undo works for a fix
await p.evaluate(() => window.texbench.app.editor.focus()); await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await sleep(200);
console.log('after undo line 10:', await p.evaluate(() => window.texbench.app.editor.getText().split('\n')[9]));
await sleep(2500); await waitCompiled();
// hover card
const pos = await p.evaluate(() => { const v = window.texbench.app.editor.view; const ln = v.state.doc.line(7); const c = v.coordsAtPos(ln.from + 15); return c; });
if (pos) { await p.mouse.move(pos.left, pos.top + 5); await sleep(1200); }
await p.screenshot({ path: '/tmp/e2.png' });
console.log(errs.slice(0, 5)); await b.close();
