import { open } from './t_app.mjs';
const { b, p, errs, waitCompiled } = await open();
await p.waitForSelector('body.ready'); await waitCompiled();
// put cursor inside the first equation and open the visual editor
await p.evaluate(() => { const { app } = window.texbench; const t = app.editor.getText(); app.editor.setPos(t.indexOf('\\hat{y}_t = ') + 3); });
await p.keyboard.down('Control'); await p.keyboard.press('e'); await p.keyboard.up('Control');
await p.waitForSelector('.modal iframe'); const fr = await (await p.$('.modal iframe')).contentFrame();
await fr.waitForFunction(() => window.__olveCards && window.__olveCards.all().includes('hat{y}'), { timeout: 20000 });
console.log('loaded into equation editor:', (await fr.evaluate(() => window.__olveCards.all())).slice(0, 90).replace(/\n/g, '⏎'));
await new Promise(r => setTimeout(r, 1200)); await p.screenshot({ path: '/tmp/eq.png' });
// change the LaTeX in the box, then apply
await fr.evaluate(() => { const ta = window.__olveCards.box(0); ta.focus(); ta.value = ta.value.replace('\\varepsilon^d_t', '\\varepsilon^d_t + \\xi_t'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
await fr.click('#embedApply');
await p.waitForFunction(() => !document.querySelector('.modal'));
console.log('applied:', await p.evaluate(() => window.texbench.app.editor.getText().includes('\\varepsilon^d_t + \\xi_t')), '| status:', await (async () => { await new Promise(r => setTimeout(r, 1500)); return waitCompiled(); })());
// inline math and no-math cases
console.log(await p.evaluate(async () => { const { findMath } = await import('./modules/equation-editor.js'); const t = 'a $x+y$ b \\$5 and $$z$$ end\n\n\\[ q \\] % $c$\n'; return [findMath(t, 4), findMath(t, 0), findMath(t, 22), findMath(t, 33)].map(r => r && t.slice(r.from, r.to)); }));
console.log(errs); await b.close();
