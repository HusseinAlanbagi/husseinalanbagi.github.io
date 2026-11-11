import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1500);
const ed = () => p.evaluate(() => { const v = window.texbench.app.editor.view, pos = v.state.selection.main.head, l = v.state.doc.lineAt(pos); return { line: l.text, col: pos - l.from, around: v.state.sliceDoc(pos - 30, pos) + '|' + v.state.sliceDoc(pos, pos + 40) }; });
const opts = () => p.$$eval('.cm-tooltip-autocomplete li', e => e.slice(0, 6).map(x => x.textContent));
await p.evaluate(() => { const v = window.texbench.app.editor.view; const l = v.state.doc.line(v.state.doc.lines - 1); v.focus(); v.dispatch({ changes: { from: l.from, insert: '\n\n' }, selection: { anchor: l.from + 1 } }); });
await p.keyboard.type('\\be', { delay: 60 }); await sleep(400);
console.log('after \\be:', await opts());
await p.keyboard.press('Enter'); await sleep(400);
console.log('after Enter:', await ed(), await opts());
await p.keyboard.type('al', { delay: 60 }); await sleep(300); console.log('typed al:', await opts());
await p.keyboard.press('Enter'); await sleep(300);
console.log('after env:', JSON.stringify(await p.evaluate(() => { const v = window.texbench.app.editor.view, pos = v.state.selection.main.head; return v.state.sliceDoc(pos - 20, pos) + '|' + v.state.sliceDoc(pos, pos + 20); })));
await p.keyboard.type('x &= 1'); await p.keyboard.press('Escape');
// typed manually with closeBrackets: \begin{ -> \begin{|}
await p.keyboard.press('ArrowDown'); await p.keyboard.press('End'); await p.keyboard.press('Enter');
await p.keyboard.type('\\begin{', { delay: 60 }); await sleep(400); console.log('manual brace:', await ed(), await opts());
await p.keyboard.type('fig', { delay: 60 }); await sleep(300); await p.keyboard.press('Enter'); await sleep(300);
console.log('figure:', JSON.stringify(await p.evaluate(() => { const v = window.texbench.app.editor.view, pos = v.state.selection.main.head; return v.state.sliceDoc(pos - 80, pos) + '|' + v.state.sliceDoc(pos, pos + 120); })));
await p.keyboard.press('Escape');
// \end suggestion of the open environment
await p.evaluate(() => { const v = window.texbench.app.editor.view; const t = '\n\\begin{itemize}\n  \\item a\n'; const at = v.state.selection.main.head; const e = v.state.doc.lineAt(at).to; v.dispatch({ changes: { from: e, insert: t }, selection: { anchor: e + t.length } }); });
await p.keyboard.type('\\en', { delay: 60 }); await sleep(300); await p.keyboard.press('Enter'); await sleep(400); console.log('end list:', await opts());
await p.keyboard.press('Enter'); await sleep(200); console.log('end ->', (await ed()).line);
await p.screenshot({ path: '/tmp/ac.png' });
console.log(errs.slice(0, 5)); await b.close();
