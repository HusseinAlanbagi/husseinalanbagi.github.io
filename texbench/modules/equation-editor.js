// Visual equation editor, docked under the source. Put the cursor in an equation and it appears in the
// dock, drawn and editable; what you change there goes straight into the source, and what you type in
// the source shows in the dock. With the cursor outside any equation, build a new one and insert it.
export default {
  id: 'equation-editor',
  name: 'Visual equation editor',
  description: 'Edit the equation under the cursor visually, in a strip under the source (Ctrl+E). Changes go both ways as you type. Also symbols, matrices, alignment, units and Word paste.',
  category: 'Writing',
  activate(ctx) {
    const { EditorView } = ctx.cm, h = ctx.h;
    let dock = null, frame = null, ready = false, range = null, lastText = null, dockText = '', btn = null;
    const post = (m) => frame?.contentWindow?.postMessage({ target: 'equation-editor', ...m }, location.origin);
    const lineOf = (pos) => ctx.editor.view.state.doc.lineAt(Math.min(pos, ctx.editor.view.state.doc.length)).number;
    const insertBtn = h('button', { class: 'small primary', hidden: true, onClick: () => insertNew() }, 'Insert at the cursor');
    // keep the tracked equation in place while the text around it changes
    ctx.editor.addExtension(EditorView.updateListener.of((u) => { if (u.docChanged && range) range = { from: u.changes.mapPos(range.from, -1), to: u.changes.mapPos(range.to, 1) }; }));

    function follow(focus = false) {
      if (!dock || !ready) return;
      if (!/\.(tex|ltx|sty|cls)$/i.test(ctx.project.activeFile || '')) { range = null; insertBtn.hidden = true; return dock.setInfo('Open a .tex file to edit its equations here.'); }
      const text = ctx.editor.getText(), pos = ctx.editor.getCursor().pos;
      const here = findMath(text, pos);
      range = here;
      if (!range) {
        insertBtn.hidden = false;
        dock.setInfo('New equation: build it here, then insert it. Or put the cursor in an equation to edit that one.');
        if (lastText !== null) { lastText = null; dockText = ''; post({ type: 'set', latex: '', focus }); }
        return;
      }
      insertBtn.hidden = true;
      const src = text.slice(range.from, range.to);
      dock.setInfo(`Line ${lineOf(range.from)}. Changes here go straight into the source.`);
      if (src !== lastText) { lastText = dockText = src; post({ type: 'set', latex: src, focus }); }
      else if (focus) post({ type: 'focus' });
    }
    function insertNew() {
      let latex = dockText.trim(); if (!latex) return ctx.ui.toast('The equation is empty.');
      if (!/^\s*(\\begin\{|\\\[|\$|\\\()/.test(latex)) latex = `\\begin{equation}\n  ${latex}\n\\end{equation}`;
      const sel = ctx.editor.getSelection(), text = ctx.editor.getText();
      const pre = sel.from > 0 && text[sel.from - 1] !== '\n' && /^\\begin|^\\\[/.test(latex) ? '\n' : '';
      ctx.editor.replaceRange(sel.from, sel.to, pre + latex + (pre ? '\n' : ''));
      range = { from: sel.from + pre.length, to: sel.from + pre.length + latex.length };
      lastText = dockText = latex; post({ type: 'set', latex, focus: true }); follow();
    }
    const onMsg = (e) => {
      if (!frame || e.origin !== location.origin || e.source !== frame.contentWindow || e.data?.source !== 'equation-editor') return;
      if (e.data.type === 'ready') { ready = true; lastText = null; post({ type: 'theme', theme: document.documentElement.dataset.theme }); follow(true); if (!range) post({ type: 'focus' }); }
      else if (e.data.type === 'change') {
        const latex = e.data.latex || ''; dockText = latex;
        if (!range) return;
        const cur = ctx.editor.view.state.sliceDoc(range.from, range.to);
        if (cur === latex) { lastText = latex; return; }
        lastText = latex;
        ctx.editor.view.dispatch({ changes: { from: range.from, to: range.to, insert: latex }, userEvent: 'input' });
      }
    };
    function open() {
      if (dock?.open) return post({ type: 'focus' });
      ready = false; range = null; lastText = null; dockText = '';
      frame = h('iframe', { src: new URL('./equation/index.html?embed=dock', document.baseURI).href, title: 'Equation editor' });
      dock = ctx.ui.openDock({ title: 'Equation', body: frame, actions: [insertBtn], height: 270, onClose: () => { dock = null; frame = null; ready = false; btn?.classList.remove('on'); ctx.editor.focus(); } });
      btn?.classList.add('on');
    }
    const toggle = () => { if (dock?.open) dock.close(); else open(); };
    addEventListener('message', onMsg);
    let timer; const later = () => { clearTimeout(timer); timer = setTimeout(() => follow(false), 120); };
    ctx.on('cursor', later); ctx.on('open', () => { range = null; later(); });
    const themeWatch = new MutationObserver(() => post({ type: 'theme', theme: document.documentElement.dataset.theme }));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    ctx.ui.addCommand({ id: 'equation.edit', name: 'Equation editor: open, or move into it', key: 'Mod+E', run: open });
    ctx.ui.addCommand({ id: 'equation.close', name: 'Equation editor: close', run: () => dock?.close() });
    ctx.editor.addKeymap([{ key: 'Mod-e', run: () => (open(), true) }]);
    btn = ctx.ui.addToolbarButton({ label: 'Equation', icon: 'sigma', title: 'Show or hide the visual equation editor under the source (Ctrl+E)', onClick: toggle }).el;
    if (ctx.settings.get('open', false)) setTimeout(open, 0);
    ctx.on('modules', () => {});
    ctx.onDispose(() => { removeEventListener('message', onMsg); clearTimeout(timer); themeWatch.disconnect(); dock?.close(); });
    // remember whether the dock was open
    const remember = setInterval(() => ctx.settings.set('open', !!dock?.open), 2000); ctx.onDispose(() => clearInterval(remember));
  },
};

const ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math';
// Find the maths block that contains position `pos`: an environment, \[ \], $$ $$, \( \) or $ $.
export function findMath(text, pos) {
  const hits = [];
  const env = new RegExp(`\\\\begin\\{(${ENVS})(\\*?)\\}[\\s\\S]*?\\\\end\\{\\1\\2\\}`, 'g');
  for (const m of text.matchAll(env)) hits.push({ from: m.index, to: m.index + m[0].length });
  for (const m of text.matchAll(/\\\[[\s\S]*?\\\]/g)) hits.push({ from: m.index, to: m.index + m[0].length });
  for (const m of text.matchAll(/\\\([\s\S]*?\\\)/g)) hits.push({ from: m.index, to: m.index + m[0].length });
  const inside = hits.filter(r => pos >= r.from && pos <= r.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
  if (inside) return inside;
  // dollars: scan the paragraph around the cursor, skipping escaped \$ and comments
  const start = Math.max(text.lastIndexOf('\n\n', pos - 1), 0), endIdx = text.indexOf('\n\n', pos), end = endIdx < 0 ? text.length : endIdx;
  let openAt = -1, dbl = false;
  for (let i = start; i < end; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') { const nl = text.indexOf('\n', i); i = nl < 0 ? end : nl; continue; }
    if (c !== '$') continue;
    const two = text[i + 1] === '$';
    if (openAt < 0) { openAt = i; dbl = two; if (two) i++; }
    else if (dbl === two || !dbl) { const to = i + (dbl ? 2 : 1); if (pos >= openAt && pos <= to) return { from: openAt, to }; openAt = -1; if (dbl) i++; }
  }
  return null;
}
