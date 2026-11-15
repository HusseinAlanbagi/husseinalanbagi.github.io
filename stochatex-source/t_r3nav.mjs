import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
let body = '';
for (let s = 1; s <= 8; s++) { body += `\\section{Part ${s}}\n`; for (let k = 1; k <= 3; k++) { body += `\\subsection{Sub ${s}.${k}}\n` + `Para ${s}.${k} text. `.repeat(30) + `\n\\begin{equation}\n  y_{${s}${k}} = \\frac{a}{b} + c_t\n\\end{equation}\n\n`; } }
const doc = `\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${body}\\end{document}\n`;
await p.evaluate((d) => { window.texbench.app.project.write('long.tex', d, { open: true }); }, doc);
await sleep(800);
const V = (f, ...a) => p.evaluate(f, ...a);
// side bar hide
await V(() => document.getElementById('sideHide').click()); await sleep(300);
console.log('sidebar hidden widths:', await V(() => ['rail', 'edwrap', 'pdfwrap'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().width))));
await V(() => document.querySelector('.rail-btn').click()); await sleep(300);
// visual toggle keeps place
const topText = () => V(() => { const v = window.texbench.app.editor.view; const h = v.scrollDOM.getBoundingClientRect().top - v.documentTop; const blk = v.lineBlockAtHeight(h + 2); return v.state.doc.sliceString(blk.from, blk.from + 30); });
await V(() => { const v = window.texbench.app.editor.view; v.scrollDOM.scrollTop = v.scrollDOM.scrollHeight * 0.55; }); await sleep(1500);
const before = await topText();
await p.click('.vz-switch'); await sleep(2500);
console.log('visual toggle: before', JSON.stringify(before), 'after', JSON.stringify(await topText()));
await p.click('.vz-switch'); await sleep(1500);
console.log('toggle back:', JSON.stringify(await topText()));
// back exactness: click to work at middle, then scroll in steps to top, then Back
const mid = await V(() => { const v = window.texbench.app.editor.view; const t = v.state.doc.toString(); return t.indexOf('Para 5.2'); });
await V((m) => { const v = window.texbench.app.editor.view; v.focus(); v.dispatch({ selection: { anchor: m }, scrollIntoView: true, userEvent: 'select.pointer' }); }, mid); await sleep(800);
const workTop = await topText();
for (const f of [0.35, 0.2, 0]) { await V((f) => { const v = window.texbench.app.editor.view; v.scrollDOM.scrollTop = v.scrollDOM.scrollHeight * f; }, f); await sleep(900); }
console.log('pill:', await V(() => [...document.querySelectorAll('.nv-back')].filter(x => !x.hidden).map(x => x.textContent)));
await p.keyboard.down('Alt'); await p.keyboard.press('ArrowLeft'); await p.keyboard.up('Alt'); await sleep(1200);
console.log('back: work top', JSON.stringify(workTop), 'now', JSON.stringify(await topText()), 'cursor at', await V(() => window.texbench.app.editor.view.state.selection.main.head), mid);
// reopen: switch to main.tex and back
await V(() => window.texbench.app.openFile ? window.texbench.app.openFile('main.tex') : window.texbench.app.goto('main.tex', 1)); await sleep(800);
await V(() => window.texbench.app.goto('long.tex', 1)); await sleep(1000);
console.log('reopen pill:', await V(() => [...document.querySelectorAll('.nv-back')].filter(x => !x.hidden).map(x => x.textContent)));
await V(() => [...document.querySelectorAll('.nv-back')].find(x => !x.hidden)?.click()); await sleep(1200);
console.log('after left-off back:', JSON.stringify(await topText()));
console.log(errs.slice(0, 4)); await b.close();
