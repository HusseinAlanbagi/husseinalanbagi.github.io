import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); console.log('first:', await waitCompiled());
// 1. editor fills its column
console.log('editor height', await p.$eval('#ed', e => e.getBoundingClientRect().height), 'binview shown', await p.$eval('#binview', e => getComputedStyle(e).display));
// 2. selection in dark mode
await p.evaluate(() => [...document.querySelectorAll('#toolbar button')].find(x => /Dark/.test(x.textContent))?.click());
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.line(9).from, head: v.state.doc.line(12).to } }); });
await sleep(300); await p.screenshot({ path: '/tmp/sel.png', clip: { x: 230, y: 40, width: 640, height: 400 } });
// 3. visual mode
await p.evaluate(() => [...document.querySelectorAll('.seg button')].find(x => x.textContent === 'Visual').click());
await p.evaluate(() => { const v = window.texbench.app.editor.view; v.dispatch({ selection: { anchor: 0 } }); });
await sleep(2500); await p.screenshot({ path: '/tmp/vis.png' });
console.log('math widgets', await p.$$eval('.vz-dmath', e => e.length), await p.$$eval('.vz-imath', e => e.length), 'errors', await p.$$eval('.vz-err', e => e.map(x => x.title)));
// click on an equation reveals its source
await p.click('.vz-dmath'); await sleep(300);
console.log('after click: dmath', await p.$$eval('.vz-dmath', e => e.length), 'cursor', await p.$eval('#cursorInfo', e => e.textContent));
await p.screenshot({ path: '/tmp/vis2.png' });
// typing still works in visual mode
await p.keyboard.type(' + 1'); await sleep(200);
console.log('typed ok:', await p.evaluate(() => window.texbench.app.editor.getText().includes(' + 1')));
await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace');
// 4. PDF hidden / side / tab
await p.click('#pdfHideBtn'); await sleep(300);
console.log('hidden:', await p.$eval('#pdfwrap', e => getComputedStyle(e).display), 'editor width', await p.$eval('#edwrap', e => Math.round(e.getBoundingClientRect().width)));
await p.screenshot({ path: '/tmp/hidden.png' });
await p.click('#pdfModeBtn'); await p.evaluate(() => [...document.querySelectorAll('.menu button')].find(x => /Beside/.test(x.textContent)).click()); await sleep(300);
console.log('side again:', await p.$eval('#pdfwrap', e => getComputedStyle(e).display));
const newTab = new Promise(r => b.once('targetcreated', t => r(t)));
await p.click('#pdfTabBtn'); const t = await (await newTab).page(); await sleep(2500);
console.log('tab url', t.url().replace(/^.*\//, ''), 'tab pages', await t.$$eval('.pdfpage', e => e.length), 'main pdf shown', await p.$eval('#pdfwrap', e => getComputedStyle(e).display), 'button', await p.$eval('#pdfModeBtn', e => e.textContent));
await t.screenshot({ path: '/tmp/tab.png' });
// recompile updates the tab
await p.bringToFront(); await p.evaluate(() => window.texbench.app.compile()); for (let i = 0; i < 20; i++) { await sleep(1000); const st = await p.$eval('#status', e => e.className + ' | ' + e.textContent); if (i % 4 == 0 || !/busy/.test(st)) console.log('status', st); if (!/busy/.test(st)) break; } await sleep(1200);
console.log('tab stamp', await t.$eval('#stamp', e => e.textContent));
// double-click in the tab jumps to the source
await t.evaluate(() => { const pg = document.querySelector('.pdfpage'); const r = pg.getBoundingClientRect(); pg.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.45 })); });
await sleep(500); console.log('after dblclick in tab, cursor', await p.$eval('#cursorInfo', e => e.textContent));
// dock it back
t.evaluate(() => document.getElementById('dock').click()).catch(() => {}); await sleep(1000); await p.bringToFront(); await sleep(300);
console.log('docked:', await p.$eval('#pdfwrap', e => getComputedStyle(e).display), await p.$eval('#pdfModeBtn', e => e.textContent));
console.log(errs.slice(0, 10)); await b.close();
