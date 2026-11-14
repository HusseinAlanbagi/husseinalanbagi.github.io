// Appearance: light or dark theme, and a brightness control. The PDF stays white, as it will print,
// unless "Dim the PDF preview too" is on (a filter on the screen only; the PDF file is not changed).
const LIGHT = { '--bg': '#edf0f4', '--panel': '#f7f8fa', '--panel-2': '#e9edf2', '--paper': '#ffffff', '--line': '#dfe4ea', '--line-2': '#c8d0da', '--pdf-bg': '#d5dae1' };
const DARK = { '--bg': '#0f1318', '--panel': '#151a21', '--panel-2': '#1f2630', '--paper': '#1a2029', '--line': '#272f3a', '--line-2': '#37414f', '--pdf-bg': '#0a0d11' };
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');

export default {
  id: 'dark-mode',
  name: 'Appearance',
  description: 'Light or dark theme (or follow your system setting), and a brightness slider that softens the white of the light theme or lifts the dark one.',
  category: 'Appearance',
  activate(ctx) {
    const h = ctx.h, root = document.documentElement;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const wanted = () => { const s = ctx.settings.get('theme', 'system'); return s === 'system' ? (mq.matches ? 'dark' : 'light') : s; };
    // brightness 0..100: 100 = the normal colours. Light: lower = toward a soft warm grey. Dark: lower = toward black.
    const bright = () => ctx.settings.get('bright', 100), pdfDim = () => ctx.settings.get('pdfDim', false);
    function paint() {
      const dark = wanted() === 'dark', base = dark ? DARK : LIGHT, b = bright();
      const t = (100 - b) / 100;
      for (const [k, v] of Object.entries(base)) {
        if (b >= 100) { root.style.removeProperty(k); continue; }
        root.style.setProperty(k, dark ? mix(v, '#000000', t * 0.9) : mix(v, k === '--paper' ? '#ece6da' : '#c9c3b6', t * 0.85));
      }
      root.style.setProperty('--pdf-filter', pdfDim() && b < 100 ? `brightness(${(1 - t * 0.35).toFixed(3)}) sepia(${(t * 0.25).toFixed(3)})` : 'none');
    }
    let off = null, pop = null;
    const close = () => { pop?.remove(); pop = null; removeEventListener('mousedown', outside, true); };
    const outside = (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('[data-appearance]')) close(); };
    function openPop(anchor) {
      if (pop) return close();
      const seg = (v, label) => h('button', { class: 'small' + (ctx.settings.get('theme', 'system') === v ? ' primary' : ''), onClick: () => { ctx.settings.set('theme', v); apply(); close(); openPop(anchor); } }, label);
      const slider = h('input', { type: 'range', min: 40, max: 100, step: 1, value: bright(), 'aria-label': 'Brightness', onInput: (e) => { ctx.settings.set('bright', +e.target.value); paint(); } });
      pop = h('div', { class: 'ap-pop', role: 'dialog', 'aria-label': 'Appearance' },
        h('div', { class: 'ap-row' }, seg('light', 'Light'), seg('dark', 'Dark'), seg('system', 'System')),
        h('label', { class: 'ap-lab' }, h('span', {}, 'Brightness'), h('span', { class: 'ap-ends' }, h('span', {}, 'Soft'), slider, h('span', {}, 'Bright'))),
        h('label', { class: 'ap-chk' }, h('input', { type: 'checkbox', checked: pdfDim(), onChange: (e) => { ctx.settings.set('pdfDim', e.target.checked); paint(); } }), 'Dim the PDF preview too'),
        h('button', { class: 'small', onClick: () => { ctx.settings.set('bright', 100); slider.value = 100; paint(); } }, 'Reset'));
      document.body.append(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
      addEventListener('mousedown', outside, true);
    }
    const apply = () => {
      ctx.ui.setTheme(wanted()); paint(); off && off();
      const dark = wanted() === 'dark';
      off = ctx.ui.addToolbarButton({ label: 'Appearance', icon: dark ? 'moon' : 'sun', where: 'top', title: 'Light or dark theme, and brightness', onClick: (e) => openPop(e.currentTarget) });
      setTimeout(() => document.querySelectorAll('button[title="Light or dark theme, and brightness"]').forEach(b => b.dataset.appearance = '1'));
    };
    const toggle = () => { ctx.settings.set('theme', wanted() === 'dark' ? 'light' : 'dark'); apply(); };
    ctx.ui.addCommand({ id: 'theme.toggle', name: 'Switch between light and dark theme', run: toggle });
    ctx.ui.addCommand({ id: 'theme.system', name: 'Theme: follow the system setting', run: () => { ctx.settings.set('theme', 'system'); apply(); } });
    const css = h('style', {}, `
.ap-pop { position: fixed; z-index: 60; width: 250px; padding: 12px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--shadow); display: grid; gap: 10px; }
.ap-row { display: flex; gap: 6px; } .ap-row button { flex: 1; justify-content: center; }
.ap-lab { display: grid; gap: 4px; font-weight: 500; } .ap-ends { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 400; } .ap-ends input { flex: 1; accent-color: var(--accent); }
.ap-chk { display: flex; gap: 6px; align-items: center; color: var(--muted); }
.ap-pop > button { justify-self: start; }
#pdf canvas, #pdf .page canvas { filter: var(--pdf-filter, none); }`);
    document.head.append(css);
    mq.addEventListener('change', apply);
    apply();
    return () => { close(); css.remove(); mq.removeEventListener('change', apply); for (const k of Object.keys(LIGHT)) root.style.removeProperty(k); root.style.removeProperty('--pdf-filter'); ctx.ui.setTheme('light'); };
  },
};
