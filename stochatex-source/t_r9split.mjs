// Round 9: split screen. Same file in both panes stays in step; another file is edited and saved; LaTeX in one pane
// while the other is Visual; side by side or rows; remembered after a reload.
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
await p.evaluate(() => { const a = window.texbench.app; a.project.write('main.tex', '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello main.\n\\begin{equation}\n  y_t = x_t\n\\end{equation}\n\\input{ch2}\n\\end{document}\n', { open: true }); a.project.write('ch2.tex', 'Chapter two text.\n', {}); });
await sleep(600);
await p.click('#splitBtn'); await sleep(800);
const panes = () => p.evaluate(() => [...document.querySelectorAll('.cm-editor')].filter(e => e.closest('#ed, .ed2-body')).map(e => e.closest('.ed2-body') ? 'R:' + e.querySelector('.cm-content').textContent.slice(0, 40) : 'L:' + e.querySelector('.cm-content').textContent.slice(0, 40)));
console.log('open:', await p.evaluate(() => !!document.querySelector('.ed2')), await p.$eval('.ed2-file', s => s.value));
// type in the right pane (same file)
await p.evaluate(() => { const v = window.texbench.app.editor.panes[0].view; const i = v.state.doc.toString().indexOf('Hello main.') + 11; v.dispatch({ changes: { from: i, insert: ' From right.' }, userEvent: 'input' }); });
await sleep(300);
console.log('left has right edit:', await p.evaluate(() => window.texbench.app.editor.view.state.doc.toString().includes('From right.')), '| project:', await p.evaluate(() => window.texbench.app.project.read('main.tex').includes('From right.')));
await p.evaluate(() => { const v = window.texbench.app.editor.view; const i = v.state.doc.toString().indexOf('From right.') + 11; v.dispatch({ changes: { from: i, insert: ' From left.' }, userEvent: 'input' }); });
await sleep(300);
console.log('right has left edit:', await p.evaluate(() => window.texbench.app.editor.panes[0].view.state.doc.toString().includes('From left.')));
// undo in the right pane only undoes its own edit
// other file
await p.select('.ed2-file', 'ch2.tex'); await sleep(400);
await p.evaluate(() => { const v = window.texbench.app.editor.panes[0].view; v.dispatch({ changes: { from: v.state.doc.length, insert: 'More in ch2.\n' }, userEvent: 'input' }); });
await sleep(300);
console.log('ch2 saved in project:', await p.evaluate(() => window.texbench.app.project.read('ch2.tex').includes('More in ch2')), '| left still main:', await p.evaluate(() => window.texbench.app.editor.path));
// left opens ch2: both the same
await p.evaluate(() => window.texbench.app.goto('ch2.tex')); await sleep(400);
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ changes: { from: 0, insert: '% left on ch2\n' }, userEvent: 'input' }); }); await sleep(300);
console.log('right follows ch2:', await p.evaluate(() => window.texbench.app.editor.panes[0].view.state.doc.toString().startsWith('% left on ch2')));
await p.evaluate(() => window.texbench.app.goto('main.tex')); await sleep(400);
// Visual on: right pane LaTeX
await p.select('.ed2-file', 'main.tex'); await sleep(300);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(1200);
console.log('both visual:', await p.evaluate(() => [document.querySelector('#ed .cm-editor').classList.contains('cm-typeset'), document.querySelector('.ed2-body .cm-editor').classList.contains('cm-typeset')]));
await p.click('.ed2-code'); await sleep(600);
console.log('left visual, right LaTeX:', await p.evaluate(() => [document.querySelector('#ed .cm-editor').classList.contains('cm-typeset'), document.querySelector('.ed2-body .cm-editor').classList.contains('cm-typeset')]));
await p.evaluate(() => [...document.querySelectorAll('.ed2-bar button')].find(b => /above the other/.test(b.title)).click()); await sleep(300);
console.log('rows:', await p.evaluate(() => document.getElementById('edrow').classList.contains('rows')));
await p.screenshot({ path: '/tmp/stx/split.png' });
// reload: remembered
await p.reload(); await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(1800);
console.log('after reload:', await p.evaluate(() => ({ open: !!document.querySelector('.ed2'), file: document.querySelector('.ed2-file')?.value, rows: document.getElementById('edrow')?.classList.contains('rows'), code: document.querySelector('.ed2-code')?.classList.contains('on') })));
await p.keyboard.down('Control'); await p.keyboard.down('Alt'); await p.keyboard.press('Backslash'); await p.keyboard.up('Alt'); await p.keyboard.up('Control'); await sleep(300);
console.log('Ctrl+Alt+\\ closes:', !(await p.$('.ed2')));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
