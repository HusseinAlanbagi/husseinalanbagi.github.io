// Round 10: an equation shown as LaTeX gets the same bars, acting on the text, with a live drawing of it.
//   node t_r10code.mjs [visual: on|off]
import { open } from './t_app.mjs';
const VIS = (process.argv[2] || 'off') === 'on';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
await p.evaluate(() => window.texbench.app.project.write('main.tex', String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
See \eqref{eq:a}.
\begin{equation}\label{eq:a}
  y_t = \frac{a}{b} + x_t
\end{equation}
Inline $c_t + d$ here.
\end{document}
`, { open: true }));
const on = (await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) === 'true';
if (on !== VIS) await p.click('.vz-switch');
await sleep(1200);
const src = () => p.evaluate(() => window.texbench.app.editor.view.state.doc.toString());
const put = (needle, off = 0) => p.evaluate((n, off) => { const v = window.texbench.app.editor.view; const i = v.state.doc.toString().indexOf(n) + off; v.focus(); v.dispatch({ selection: { anchor: i } }); }, needle, off);
const sel = (needle) => p.evaluate((n) => { const v = window.texbench.app.editor.view; const i = v.state.doc.toString().indexOf(n); v.focus(); v.dispatch({ selection: { anchor: i, head: i + n.length } }); }, needle);
await put('y_t', 1); await sleep(2500); await p.screenshot({ path: `/tmp/stx/code0-${VIS ? 'vis' : 'tex'}.png` });
if (VIS) { // in Visual, show the LaTeX first (from the drawn equation)
  console.log('visual: editor opened?', !!(await p.$('.vz-edit')));
}
console.log('bars:', !!(await p.$('.vz-codebar-top')), !!(await p.$('.vz-codebar-bottom')), '| preview svg:', await p.evaluate(() => !!document.querySelector('.vz-cb-preview svg')));
console.log('top bar:', await p.$$eval('.vz-cb-bar button', bs => bs.map(x => x.getAttribute('aria-label')).join(' | ')));
console.log('chips:', await p.$$eval('.vz-codebar .vz-idchip', cs => cs.map(c => c.getAttribute('aria-label')).join(' | ')));
const click = (re) => p.evaluate((re) => { const b = [...document.querySelectorAll('.vz-codebar button')].find(x => new RegExp(re).test(x.title)); if (!b) return 'none'; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }, re);
await sel('x_t'); await sleep(200);
await click('^Hat'); await sleep(250); console.log('hat:', (await src()).match(/y_t = .*/)[0]);
await click('^Hat'); await sleep(250); console.log('hat again:', (await src()).match(/y_t = .*/)[0]);
await put('\\frac{a}', 7); await sleep(200);
await click('^Flip'); await sleep(250); console.log('flip:', (await src()).match(/y_t = .*/)[0]);
await put('y_t', 1); await click('^Lead'); await sleep(250); console.log('lead (whole):', (await src()).match(/y_.*= .*/)[0]);
await put('= ', 2); await click('^Fraction'); await sleep(250); console.log('fraction inserted:', (await src()).match(/y_.*= .*/)[0], '| cursor in slot:', await p.evaluate(() => { const v = window.texbench.app.editor.view; const h = v.state.selection.main.head; return v.state.sliceDoc(h - 6, h + 3); }));
await put('y_{t', 1); await sleep(300); await click('^Box'); await sleep(300); console.log('box all:', JSON.stringify((await src()).match(/\\begin\{equation\}[\s\S]*?\\end\{equation\}/)[0]));
await sleep(500);
console.log('preview updates:', await p.evaluate(() => !!document.querySelector('.vz-cb-preview svg')));
// copy split: main click
await p.evaluate(() => { window.__clip = null; navigator.clipboard.writeText = async (t) => { window.__clip = t; }; });
await click('^Copy:'); await sleep(200); console.log('copied:', await p.evaluate(() => window.__clip));
// inline
await put('c_t', 1); await sleep(600);
console.log('inline bars:', !!(await p.$('.vz-codebar-top')), '| chips:', await p.$$eval('.vz-codebar .vz-idchip', cs => cs.length));
// leaving the equation hides the bars
await put('See', 1); await sleep(500);
console.log('outside: bars gone:', !(await p.$('.vz-codebar-top')));
await p.screenshot({ path: `/tmp/stx/code-${VIS ? 'vis' : 'tex'}.png` });
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
