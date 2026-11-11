// Visual equation editor. Put the cursor in an equation (or select one) and press Ctrl+E:
// the equation opens in the visual editor, and your changes go back into the source.
export default {
  id: 'equation-editor',
  name: 'Visual equation editor',
  description: 'Edit the equation under the cursor visually (Ctrl+E). Also converts pasted Word equations, builds matrices and aligns.',
  category: 'Writing',
  activate(ctx) {
    const open = () => {
      const text = ctx.editor.getText(), sel = ctx.editor.getSelection();
      const found = sel.from !== sel.to ? { from: sel.from, to: sel.to } : findMath(text, sel.from);
      const original = found ? text.slice(found.from, found.to) : '';
      let frame, done = false;
      const m = ctx.ui.modal({
        title: found ? 'Edit equation' : 'New equation', wide: 'full',
        body(el) { frame = ctx.h('iframe', { src: new URL('./equation/index.html?embed', document.baseURI).href, title: 'Equation editor', style: { border: '0', width: '100%', height: '100%', flex: '1' } }); el.append(frame); },
        onClose() { removeEventListener('message', onMsg); ctx.editor.focus(); },
      });
      const onMsg = (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow || e.data?.source !== 'equation-editor') return;
        if (e.data.type === 'ready') frame.contentWindow.postMessage({ target: 'equation-editor', type: 'set', latex: original, theme: document.documentElement.dataset.theme }, location.origin);
        else if (e.data.type === 'cancel') m.close();
        else if (e.data.type === 'apply' && !done) {
          done = true;
          let latex = e.data.latex || '';
          if (!found && latex && !/^\s*(\\begin\{|\\\[|\$)/.test(latex)) latex = `\\begin{equation}\n  ${latex}\n\\end{equation}`;
          const range = found || { from: sel.from, to: sel.to };
          m.close();
          if (latex !== original) ctx.editor.replaceRange(range.from, range.to, latex, true);
        }
      };
      addEventListener('message', onMsg);
    };
    ctx.ui.addCommand({ id: 'equation.edit', name: 'Edit equation visually', key: 'Mod+E', run: open });
    ctx.editor.addKeymap([{ key: 'Mod-e', run: () => (open(), true) }]);
    ctx.ui.addToolbarButton({ label: 'Equation', icon: '∑', title: 'Edit the equation under the cursor visually, or start a new one (Ctrl+E)', onClick: open });
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
