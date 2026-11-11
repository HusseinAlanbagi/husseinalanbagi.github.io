// Dark theme for the interface and the editor. The PDF stays white, as it will print.
export default {
  id: 'dark-mode',
  name: 'Dark mode',
  description: 'A dark theme for the editor and side bars, with a button to switch. Can follow your system setting.',
  category: 'Appearance',
  activate(ctx) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const wanted = () => { const s = ctx.settings.get('theme', 'system'); return s === 'system' ? (mq.matches ? 'dark' : 'light') : s; };
    let btn;
    const apply = () => { ctx.ui.setTheme(wanted()); if (btn) btn.lastChild.textContent = wanted() === 'dark' ? 'Light' : 'Dark'; };
    const toggle = () => { ctx.settings.set('theme', wanted() === 'dark' ? 'light' : 'dark'); apply(); };
    btn = ctx.ui.addToolbarButton({ label: 'Dark', icon: '◐', title: 'Switch between the light and dark theme', onClick: toggle }).el;
    ctx.ui.addCommand({ id: 'theme.toggle', name: 'Switch between light and dark theme', run: toggle });
    ctx.ui.addCommand({ id: 'theme.system', name: 'Theme: follow the system setting', run: () => { ctx.settings.set('theme', 'system'); apply(); } });
    mq.addEventListener('change', apply);
    apply();
    return () => { mq.removeEventListener('change', apply); ctx.ui.setTheme('light'); };
  },
};
