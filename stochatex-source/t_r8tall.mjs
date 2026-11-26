// Round 8b: a tall table whose top is above the screen: typing in a cell (text or maths), copy, cut and paste
// must not scroll the page.   node t_r8tall.mjs [width]
import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(600);
await p.setViewport({ width: +(process.argv[2] || 1500), height: 860 });
let paras = ''; for (let i = 0; i < 20; i++) paras += `Paragraph ${i} with some words that fill the line and make the paper long enough to scroll a good deal. More words here.\n\n`;
const rows = Array.from({ length: 40 }, (_, i) => `    Row ${i} & $x_{${i}}$ & ${i} \\\\`).join('\n');
const doc = `\\documentclass{article}\n\\usepackage{amsmath,booktabs}\n\\begin{document}\n${paras}\n\\begin{table}[htbp]\n  \\centering\n  \\caption{Tall}\n  \\begin{tabular}{lcc}\n    \\toprule\n    Name & Symbol & Value \\\\\n    \\midrule\n${rows}\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n${paras}\\end{document}\n`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
if ((await p.$eval('.vz-switch', e => e.getAttribute('aria-checked'))) !== 'true') await p.click('.vz-switch');
await sleep(2000);
const findRow = async (txt) => { for (let y = 0; y < 30000; y += 250) { const ok = await p.evaluate((y, txt) => { const v = window.texbench.app.editor.view; v.scrollDOM.scrollTop = y; const td = [...document.querySelectorAll('.cm-content td')].find(t => t.textContent.trim() === txt); return td ? Math.round(td.getBoundingClientRect().top) : null; }, y, txt); await sleep(80); if (ok != null && ok > 300 && ok < 600) return true; } return false; };
await findRow('Row 30');
const sc = () => p.evaluate(() => { const out = [Math.round(window.texbench.app.editor.view.scrollDOM.scrollTop)]; const extra = []; for (const el of [document.scrollingElement, ...document.querySelectorAll('*')]) { if (el && el.scrollTop > 0 && el !== window.texbench.app.editor.view.scrollDOM) extra.push((el.id || el.className || el.tagName).toString().slice(0, 20) + '=' + Math.round(el.scrollTop)); if (el && el.scrollLeft > 0) extra.push((el.id || el.className || el.tagName).toString().slice(0, 20) + ':L' + Math.round(el.scrollLeft)); } return out.concat(extra).join(' '); });
const tdTop = (t) => p.evaluate((t) => { const td = [...document.querySelectorAll('.cm-content td')].find(x => x.textContent.trim().startsWith(t)); return td ? Math.round(td.getBoundingClientRect().top) : null; }, t);
console.log('start      scroll', await sc(), 'Row 30 at', await tdTop('Row 30'), 'table top', await p.evaluate(() => Math.round(document.querySelector('.cm-content table').getBoundingClientRect().top)));
await p.evaluate(() => {
  window.__log = [];
  const sd = window.texbench.app.editor.view.scrollDOM, d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(sd, 'scrollTop', { get() { return d.get.call(this); }, set(v) { if (Math.abs(v - d.get.call(this)) > 200) window.__log.push('set ' + Math.round(d.get.call(this)) + '->' + Math.round(v) + ' ' + new Error().stack.split('\n').slice(2, 7).map(x => x.trim().replace(/https?:[^ )]*\//, '')).join(' < ')); d.set.call(this, v); } });
  const siv = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { window.__log.push('scrollIntoView ' + (this.className || this.tagName) + ' ' + new Error().stack.split('\n').slice(2, 5).map(x => x.trim().replace(/https?:[^ )]*\//, '')).join(' < ')); return siv.apply(this, a); };
  const fo = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (o) { if (!(o && o.preventScroll)) window.__log.push('focus ' + (this.className || this.tagName).toString().slice(0, 30) + ' ' + new Error().stack.split('\n').slice(2, 4).map(x => x.trim().replace(/https?:[^ )]*\//, '')).join(' < ')); return fo.call(this, o); };
  let last = sd.scrollTop; sd.addEventListener('scroll', () => { const n = sd.scrollTop; if (Math.abs(n - last) > 200) window.__log.push('scroll event ' + Math.round(last) + '->' + Math.round(n)); last = n; });
});
const td = await p.evaluateHandle(() => [...document.querySelectorAll('.cm-content td')].find(t => t.textContent.trim() === 'Row 30'));
const box = await td.boundingBox(); console.log('td box', JSON.stringify(box), 'el at point', await p.evaluate((b) => { const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return e && (e.tagName + '.' + e.className + ' ' + (e.textContent || '').slice(0, 20)); }, box));
await td.click();
for (const ms of [0, 40, 80, 150, 300, 600]) { await sleep(ms ? 40 : 0); console.log(ms, await p.evaluate(() => { const v = window.texbench.app.editor.view, t = v.state.doc.toString().indexOf('\\begin{tabular}'); return `tabedit ${!!document.querySelector('.vz-tabedit')} tables ${document.querySelectorAll('.cm-content table').length} scroll ${Math.round(v.scrollDOM.scrollTop)} vp ${v.viewport.from}-${v.viewport.to} tab@${t} h ${Math.round(v.contentHeight)} active ${document.activeElement.className.slice(0, 20)}`; })); }
await sleep(500);
console.log('tabedit?', !!(await p.$('.vz-tabedit')), 'cm sel line:', await p.evaluate(() => { const v = window.texbench.app.editor.view, h = v.state.selection.main.head; return v.state.doc.lineAt(h).number + ' ' + v.state.doc.lineAt(h).text.slice(0, 40); }));
console.log('opened     scroll', await sc(), 'Row 30 at', await tdTop('Row 30'), await p.evaluate(() => { const a = document.activeElement; return a.tagName + '.' + a.className + ' sel in ' + (getSelection().anchorNode?.parentElement?.closest('td')?.textContent || '-'); })); console.log((await p.evaluate(() => window.__log.splice(0))).join('\n'));
await p.keyboard.press('End'); await p.keyboard.type('ab'); await sleep(100);
console.log('typed text scroll', await sc(), 'Row 30 at', await tdTop('Row 30')); console.log((await p.evaluate(() => window.__log)).join('\n'));
await sleep(1200); console.log('+1.2s      scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
await p.keyboard.down('Control'); await p.keyboard.press('c'); await p.keyboard.up('Control'); await sleep(300);
console.log('Ctrl+C     scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
await p.keyboard.press('ArrowDown'); await sleep(200);
await p.keyboard.down('Control'); await p.keyboard.press('v'); await p.keyboard.up('Control'); await sleep(400);
console.log('Ctrl+V     scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
await p.keyboard.down('Control'); await p.keyboard.press('x'); await p.keyboard.up('Control'); await sleep(400);
console.log('Ctrl+X     scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
// maths in row 30
const mtd = await p.evaluateHandle(() => { const r = [...document.querySelectorAll('.vz-tabedit td')].find(t => t.textContent.trim().startsWith('Row 30')); return r.nextElementSibling; });
await mtd.click(); await sleep(500);
const chip = await p.$('.vz-tabedit td.editing .vz-cm');
await chip.click(); await sleep(900);
console.log('math open  scroll', await sc(), 'Row 30 at', await tdTop('Row 30'), 'mf', await p.evaluate(() => !!document.querySelector('.vz-cellmath')));
for (const ch of ['+', 'y']) { await p.keyboard.type(ch); await sleep(120); console.log('math ' + ch + '     scroll', await sc(), 'Row 30 at', await tdTop('Row 30')); }
await sleep(1200); console.log('math +1.2s scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.press('c'); await p.keyboard.up('Control'); await sleep(300);
console.log('math copy  scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
await p.keyboard.down('Control'); await p.keyboard.press('v'); await p.keyboard.up('Control'); await sleep(400);
console.log('math paste scroll', await sc(), 'Row 30 at', await tdTop('Row 30'));
console.log(errs.filter(e => !/google|favicon/.test(e)));
await b.close();
