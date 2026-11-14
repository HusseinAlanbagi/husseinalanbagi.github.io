// Formatting keys and a few typing helpers for the source (and the visual view, which is the same editor):
//   Ctrl+B bold, Ctrl+I italic, Ctrl+U underline, Ctrl+Shift+E emphasis, Ctrl+Shift+M inline maths $…$,
//   Ctrl+Shift+K small capitals. Inside maths the same keys give \boldsymbol, \mathit, \underline.
//   Pressing a key again on formatted text removes the command.
//   Enter at the end of a line that holds only bold/italic text or only an inline equation starts a new row
//   (a blank line, i.e. a new paragraph); Shift+Enter gives a plain line break.
//   Pasting $$ … $$ gives \[ … \] (with Undo).

const TEXT = { b: 'textbf', i: 'textit', u: 'underline', e: 'emph', k: 'textsc' };
const MATH = { b: 'boldsymbol', i: 'mathit', u: 'underline', e: 'mathit', k: 'mathrm' };
const MATH_ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math|split|aligned|gathered';

// is pos inside maths? (display environments, \[ \], \( \), or $ … $ in the same paragraph)
export function inMath(text, pos) {
  const from = Math.max(0, pos - 6000), before = text.slice(from, pos).replace(/(^|[^\\])%.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
  let depth = 0; const stack = [];
  for (const m of before.matchAll(new RegExp(`\\\\begin\\{(${MATH_ENVS})\\*?\\}|\\\\end\\{(${MATH_ENVS})\\*?\\}|\\\\\\[|\\\\\\]|\\\\\\(|\\\\\\)`, 'g'))) {
    if (m[1] || m[0] === '\\[' || m[0] === '\\(') stack.push(m[0]); else stack.pop();
  }
  depth = stack.length;
  if (depth > 0) return true;
  const para = before.slice(Math.max(before.lastIndexOf('\n\n'), 0));
  let n = 0; for (let i = 0; i < para.length; i++) { if (para[i] === '\\') { i++; continue; } if (para[i] === '$') { if (para[i + 1] === '$') i++; n++; } }
  return n % 2 === 1;
}

// the \cmd{…} group around [a, b], if any: { start, open, close, end }
function groupAround(text, a, b, cmd) {
  const re = new RegExp(`\\\\${cmd}\\s*\\{`, 'g');
  let best = null;
  for (const m of text.slice(Math.max(0, a - 3000), a + cmd.length + 2).matchAll(re)) {
    const start = Math.max(0, a - 3000) + m.index, open = start + m[0].length;
    if (start > a) break;
    let d = 1, i = open;
    for (; i < text.length && d; i++) { if (text[i] === '\\') { i++; continue; } if (text[i] === '{') d++; else if (text[i] === '}') d--; }
    const close = i - 1;
    if (!d && open <= a && close >= b && (start < a || b <= close)) best = { start, open, close, end: close + 1 };
  }
  return best;
}

export default {
  id: 'formatting',
  name: 'Formatting keys',
  description: 'Ctrl+B bold, Ctrl+I italic, Ctrl+U underline, Ctrl+Shift+E emphasis, Ctrl+Shift+M inline maths (maths versions inside equations; press again to remove). Enter after a bold line or a lone inline equation starts a new row. Pasted $$ … $$ becomes \\[ … \\].',
  category: 'Editing',
  defaultEnabled: true,
  activate(ctx) {
    const { keymap, Prec, EditorSelection, EditorView } = ctx.cm;

    function format(view, key) {
      const st = view.state, text = st.doc.toString();
      const tr = st.changeByRange((r) => {
        const cmd = (inMath(text, r.from) ? MATH : TEXT)[key];
        // already formatted: \cmd{ selection } or the selection is \cmd{…} itself → remove the command
        const sel = text.slice(r.from, r.to), whole = new RegExp(`^\\\\${cmd}\\s*\\{([\\s\\S]*)\\}$`).exec(sel);
        if (whole && groupAround(text, r.from, r.from, cmd)?.end === r.to) {
          const inner = whole[1];
          return { changes: { from: r.from, to: r.to, insert: inner }, range: EditorSelection.range(r.from, r.from + inner.length) };
        }
        const g = groupAround(text, r.from, r.to, cmd);
        if (g && (r.empty ? true : g.open === r.from && g.close === r.to) ) {
          const shift = g.open - g.start;
          return { changes: [{ from: g.start, to: g.open, insert: '' }, { from: g.close, to: g.end, insert: '' }], range: EditorSelection.range(r.anchor - shift, r.head - shift) };
        }
        const open = `\\${cmd}{`;
        if (r.empty) return { changes: { from: r.from, insert: open + '}' }, range: EditorSelection.cursor(r.from + open.length) };
        return { changes: [{ from: r.from, insert: open }, { from: r.to, insert: '}' }], range: EditorSelection.range(r.from + open.length, r.to + open.length) };
      });
      view.dispatch(st.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
      return true;
    }
    function inlineMath(view) {
      const st = view.state, text = st.doc.toString();
      view.dispatch(st.update(st.changeByRange((r) => {
        const sel = text.slice(r.from, r.to);
        if (/^\$[^$]*\$$/.test(sel)) return { changes: { from: r.from, to: r.to, insert: sel.slice(1, -1) }, range: EditorSelection.range(r.from, r.to - 2) };
        if (text[r.from - 1] === '$' && text[r.to] === '$' && text[r.from - 2] !== '$') return { changes: [{ from: r.from - 1, to: r.from, insert: '' }, { from: r.to, to: r.to + 1, insert: '' }], range: EditorSelection.range(r.from - 1, r.to - 1) };
        return { changes: [{ from: r.from, insert: '$' }, { from: r.to, insert: '$' }], range: EditorSelection.range(r.from + 1, r.to + 1) };
      }), { userEvent: 'input.format' }));
      return true;
    }
    // a line that is only formatted text, or only one inline equation (with maybe a full stop or colon)
    const LONE = /^\s*(?:\\(?:textbf|textit|emph|underline|textsc)\s*\{.*\}|\$[^$]+\$|\\\([^]*?\\\))\s*[.:,;]?\s*$/;
    function enter(view) {
      const st = view.state, r = st.selection.main;
      if (!r.empty || st.selection.ranges.length > 1) return false;
      const line = st.doc.lineAt(r.head);
      if (r.head !== line.to || !LONE.test(line.text) || inMath(st.doc.toString(), line.from)) return false;
      const next = line.number < st.doc.lines ? st.doc.line(line.number + 1).text : '';
      if (!next.trim() && line.number < st.doc.lines) return false; // already followed by a blank line
      view.dispatch({ changes: { from: r.head, insert: '\n\n' }, selection: { anchor: r.head + 2 }, scrollIntoView: true, userEvent: 'input' });
      return true;
    }
    const plainBreak = (view) => { const r = view.state.selection.main; view.dispatch(view.state.replaceSelection('\n'), { userEvent: 'input' }); return true; };

    ctx.editor.addExtension(Prec.high(keymap.of([
      { key: 'Mod-b', run: (v) => format(v, 'b') },
      { key: 'Mod-i', run: (v) => format(v, 'i') },
      { key: 'Mod-u', run: (v) => format(v, 'u') },
      { key: 'Mod-Shift-e', run: (v) => format(v, 'e') },
      { key: 'Mod-Shift-k', run: (v) => format(v, 'k') },
      { key: 'Mod-Shift-m', run: inlineMath },
      { key: 'Enter', run: enter },
      { key: 'Shift-Enter', run: plainBreak },
    ])));

    // pasting $$ … $$: write it as \[ … \] (plain TeX $$ is discouraged in LaTeX)
    ctx.editor.addExtension(EditorView.updateListener.of((u) => {
      for (const tr of u.transactions) {
        if (!tr.isUserEvent('input.paste')) continue;
        const edits = [];
        tr.changes.iterChanges((fa, ta, fb, tb, ins) => {
          const s = ins.toString();
          for (const m of s.matchAll(/\$\$([\s\S]+?)\$\$/g)) edits.push({ from: fb + m.index, to: fb + m.index + m[0].length, insert: `\\[${m[1]}\\]`, was: m[0] });
        });
        if (!edits.length) continue;
        setTimeout(() => {
          const v = u.view, ok = edits.every(e => v.state.sliceDoc(e.from, e.to) === e.was); if (!ok) return;
          v.dispatch({ changes: edits.map(({ from, to, insert }) => ({ from, to, insert })), userEvent: 'input.convert' });
          let delta = 0; const back = edits.map(e => { const from = e.from + delta, to = from + e.insert.length; delta += e.insert.length - (e.to - e.from); return { from, to, insert: e.was, now: e.insert }; });
          ctx.ui.toast(ctx.h('span', {}, 'Pasted $$ … $$ written as \\[ … \\]. ', ctx.h('button', { class: 'small', onClick: (ev) => { ev.target.closest('.toast')?.remove(); if (back.every(b => v.state.sliceDoc(b.from, b.to) === b.now)) v.dispatch({ changes: back.map(({ from, to, insert }) => ({ from, to, insert })), userEvent: 'input' }); } }, 'Undo')), '', 8000);
        });
      }
    }));

    for (const [id, name, key] of [['bold', 'Bold (Ctrl+B)', 'b'], ['italic', 'Italic (Ctrl+I)', 'i'], ['underline', 'Underline (Ctrl+U)', 'u'], ['emph', 'Emphasis (Ctrl+Shift+E)', 'e'], ['smallcaps', 'Small capitals (Ctrl+Shift+K)', 'k']])
      ctx.ui.addCommand({ id: 'format.' + id, name: 'Format: ' + name, run: () => format(ctx.editor.view, key) });
    ctx.ui.addCommand({ id: 'format.math', name: 'Format: inline maths $…$ (Ctrl+Shift+M)', run: () => inlineMath(ctx.editor.view) });
  },
};
