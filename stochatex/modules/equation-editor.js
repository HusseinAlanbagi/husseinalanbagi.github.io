// The full equation editor, in a panel beside the paper (where the PDF is) and linked live to the source: put the
// cursor in an equation and press Σ (Ctrl+E); what you change there goes straight into the paper, and what you
// type in the source shows there. Press Σ again to close it. With the cursor outside any equation, what you
// build becomes a new equation at the cursor. "Pop out" moves it to its own browser tab.
export default {
  id: 'equation-editor',
  name: 'Equation editor',
  description: 'The full visual equation editor beside the paper (Σ or Ctrl+E opens and closes it). Changes go both ways as you type. Also symbols, matrices, alignment, units and Word paste.',
  category: 'Writing',
  activate(ctx) {
    const { EditorView } = ctx.cm, h = ctx.h;
    let btn = null;
    // ---- the live link to the editor (side panel or tab) over a BroadcastChannel ----
    let chan = null, linkRange = null, linkText = null, linkTimer = 0, newAt = null;
    // maths that is not in the source as it is (e.g. in a table cell being edited): another module hands it over
    // with { latex, where, onChange(latex), onClose() } and gets every change back
    let target = null;
    const linkPost = (m) => chan?.postMessage({ target: 'equation-editor', ...m });
    function unlink() { try { chan?.close(); } catch (e) {} chan = null; linkRange = null; linkText = null; newAt = null; if (target) { const t = target; target = null; try { t.onClose?.(); } catch {} } }
    let side = null;
    const syncBtn = () => { btn?.classList.toggle('on', !!side); btn?.setAttribute('aria-pressed', String(!!side)); };
    function closeSide() { if (!side) return; side.el.remove(); side = null; document.body.classList.remove('eq-side'); if (chan) { linkPost({ type: 'gone' }); unlink(); } syncBtn(); ctx.editor.focus(); }
    function openSide(forTarget) {
      const wrap = document.getElementById('pdfwrap'); if (!wrap) return openFull(true);
      if (side) closeSide();
      const id = forTarget ? linkTarget(forTarget) : link(); if (!id) return;
      const frameEl = h('iframe', { class: 'eqside-frame', title: 'Full equation editor', src: new URL('./equation/index.html?link=' + id + '&embed=side', document.baseURI).href });
      const el = h('div', { class: 'eqside', role: 'complementary', 'aria-label': 'Full equation editor' },
        h('div', { class: 'eqside-head' }, h('strong', {}, 'Equation editor'), h('span', { class: 'muted eqside-where' }), h('span', { class: 'spacer' }),
          h('button', { class: 'small ghost icon-only', title: 'Pop out: move it to its own browser tab (a second screen)', 'aria-label': 'Pop out', onClick: () => { const lid = side?.id; side.el.remove(); side = null; document.body.classList.remove('eq-side'); syncBtn(); window.open(new URL('./equation/index.html?link=' + lid, document.baseURI).href, '_blank'); } }, ctx.ui.icon('external')),
          h('button', { class: 'small ghost icon-only', title: 'Close (Esc, or Σ again)', 'aria-label': 'Close', onClick: closeSide }, ctx.ui.icon('close'))),
        frameEl);
      wrap.append(el); document.body.classList.add('eq-side');
      side = { el, id }; syncBtn(); where();
    }
    const where = () => { const w = side?.el.querySelector('.eqside-where'); if (!w) return; w.textContent = target ? '· ' + (target.where || 'maths') + ', linked' : linkRange ? `· line ${ctx.editor.view.state.doc.lineAt(Math.min(linkRange.from, ctx.editor.view.state.doc.length)).number}, linked to the paper` : '· a new equation, inserted at the cursor as you type'; };
    // start a live link to the equation at the cursor (or to a new one); returns the channel id
    function link() {
      if (!/\.(tex|ltx)$/i.test(ctx.project.activeFile || '')) { ctx.ui.toast('Open a .tex file first.'); return null; }
      const r = findMath(ctx.editor.getText(), ctx.editor.getCursor().pos);
      if (chan) { linkPost({ type: 'gone' }); unlink(); }
      const id = Math.random().toString(36).slice(2, 10);
      chan = new BroadcastChannel('stochatex-eq-' + id);
      linkRange = r ? { ...r } : null; newAt = r ? null : ctx.editor.getSelection(); linkText = null;
      chan.onmessage = onLinkMsg;
      return id;
    }
    function linkTarget(t) {
      if (chan) { linkPost({ type: 'gone' }); unlink(); }
      const id = Math.random().toString(36).slice(2, 10);
      chan = new BroadcastChannel('stochatex-eq-' + id);
      target = t; linkRange = null; newAt = null; linkText = null;
      chan.onmessage = onLinkMsg;
      return id;
    }
    const strip = (x) => { const m = /^\s*(?:\$([\s\S]*)\$|\\\(([\s\S]*)\\\))\s*$/.exec(x || ''); return (m ? (m[1] ?? m[2]) : (x || '')).trim(); };
    function insertNew(latex) {
      if (!/^\s*(\\begin\{|\\\[|\$|\\\()/.test(latex)) latex = `\\begin{equation}\n  ${latex}\n\\end{equation}`;
      const sel = newAt || ctx.editor.getSelection(), text = ctx.editor.getText();
      const pre = sel.from > 0 && text[sel.from - 1] !== '\n' ? '\n' : '', post = text[sel.to] && text[sel.to] !== '\n' ? '\n' : '';
      ctx.editor.view.dispatch({ changes: { from: sel.from, to: sel.to, insert: pre + latex + post }, userEvent: 'input' });
      linkRange = { from: sel.from + pre.length, to: sel.from + pre.length + latex.length }; newAt = null; where();
      return latex;
    }
    function onLinkMsg(e) {
      const d = e.data; if (!d || d.source !== 'equation-editor') return;
      if (target) {
        if (d.type === 'ready') { linkText = '$' + (target.latex || '') + '$'; linkPost({ type: 'set', latex: linkText, theme: document.documentElement.dataset.theme, focus: true }); }
        else if (d.type === 'change') { linkText = d.latex || ''; try { target.onChange(strip(linkText)); } catch {} }
        else if (d.type === 'close-panel') closeSide();
        else if (d.type === 'closed' && !side) unlink();
        return;
      }
      if (d.type === 'ready') { linkText = linkRange ? ctx.editor.view.state.sliceDoc(linkRange.from, linkRange.to) : ''; linkPost({ type: 'set', latex: linkText, theme: document.documentElement.dataset.theme, focus: true }); }
      else if (d.type === 'change') {
        const latex = d.latex || '';
        if (!linkRange) { if (!latex.trim()) return; linkText = insertNew(latex); if (linkText !== latex) linkPost({ type: 'set', latex: linkText, focus: false }); return; }
        const cur = ctx.editor.view.state.sliceDoc(linkRange.from, linkRange.to);
        linkText = latex; if (cur === latex) return;
        const at = linkRange.from;
        ctx.editor.view.dispatch({ changes: { from: linkRange.from, to: linkRange.to, insert: latex }, userEvent: 'input' });
        linkRange = { from: at, to: at + latex.length };
      } else if (d.type === 'close-panel') closeSide();
      else if (d.type === 'closed' && !side) unlink();
    }
    // the side panel follows the cursor to another equation
    ctx.on('cursor', () => {
      if (!side || !chan || target) return;
      const r = findMath(ctx.editor.getText(), ctx.editor.getCursor().pos);
      if (r && (!linkRange || r.from !== linkRange.from)) { linkRange = { ...r }; newAt = null; linkText = ctx.editor.view.state.sliceDoc(r.from, r.to); linkPost({ type: 'set', latex: linkText, focus: false }); where(); }
    });
    ctx.on('open', () => { if (side) closeSide(); });
    function openFull(tab) {
      if (!tab) return openSide();
      const id = link(); if (!id) return;
      const w = window.open(new URL('./equation/index.html?link=' + id, document.baseURI).href, '_blank');
      if (!w) { unlink(); ctx.ui.toast('Your browser blocked the new tab. Allow pop-ups for this site and try again.'); }
    }
    // Σ / Ctrl+E: a module may claim it first (the table editor, for the maths of the cell being edited)
    const toggle = () => { if (side) return closeSide(); if (window.__stxMathTarget && window.__stxMathTarget()) return; openSide(); };
    const onOpenMath = (e) => openSide(e.detail);
    const onCloseMath = () => { if (target) closeSide(); };
    addEventListener('stochatex:open-math', onOpenMath); addEventListener('stochatex:close-math', onCloseMath);
    ctx.onDispose(() => { removeEventListener('stochatex:open-math', onOpenMath); removeEventListener('stochatex:close-math', onCloseMath); });
    // keep the linked equation in place while the text around it changes, and show source edits in the editor
    ctx.editor.addExtension(EditorView.updateListener.of((u) => {
      if (!u.docChanged || !linkRange) return;
      linkRange = { from: u.changes.mapPos(linkRange.from, -1), to: u.changes.mapPos(linkRange.to, 1) };
      clearTimeout(linkTimer);
      linkTimer = setTimeout(() => { if (!chan || !linkRange) return; const t = u.view.state.sliceDoc(linkRange.from, linkRange.to); if (t !== linkText) { linkText = t; linkPost({ type: 'set', latex: t, focus: false }); } }, 150);
    }));
    const themeWatch = new MutationObserver(() => linkPost({ type: 'theme', theme: document.documentElement.dataset.theme }));
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    ctx.ui.addCommand({ id: 'equation.edit', name: 'Equation editor: open or close (beside the paper)', key: 'Mod+E', run: toggle });
    ctx.ui.addCommand({ id: 'equation.side', name: 'Equation editor: open the equation at the cursor', run: () => openSide() });
    ctx.ui.addCommand({ id: 'equation.fullTab', name: 'Equation editor: open in a new tab (linked)', run: () => openFull(true) });
    ctx.ui.addCommand({ id: 'equation.close', name: 'Equation editor: close', run: () => closeSide() });
    ctx.editor.addKeymap([{ key: 'Mod-e', run: () => (toggle(), true) }]);
    const onKey = (e) => { if (e.key === 'Escape' && side && !e.defaultPrevented && !document.querySelector('.modal-back, .menu')) closeSide(); };
    addEventListener('keydown', onKey);
    btn = ctx.ui.addToolbarButton({ label: 'Equation', icon: 'sigma', title: 'Equation editor beside the paper: open or close (Ctrl+E)', onClick: toggle }).el;
    btn.dataset.tb = 'equation';
    syncBtn();
    const bye = () => { linkPost({ type: 'gone' }); }; addEventListener('pagehide', bye);
    ctx.onDispose(() => { bye(); closeSide(); unlink(); removeEventListener('pagehide', bye); removeEventListener('keydown', onKey); themeWatch.disconnect(); });
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
