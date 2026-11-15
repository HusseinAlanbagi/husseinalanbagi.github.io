// Brackets, as you type:
//   - closing pairs: \[ → \[ | \]  (a block on an empty line), \( → \), \{ → \} in maths, \left( → \right) (also
//     [ \{ |), $ → $; Backspace right after removes both halves; typing $ over an inserted $ steps over it
//   - a live checker (no compile needed) for { }, \begin … \end, $ … $, \[ \], \( \), \left … \right and ( ) [ ] in
//     maths: the bracket at fault is underlined, with a note saying what is wrong and buttons to fix it; the same
//     notes appear in Problems
//   - optional rainbow brackets (each depth its own colour)

const MATH_ENVS = /^(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math|split|aligned|gathered|cases|matrix|[pbBvV]matrix|array)\*?$/;
const VERBATIM = /^(verbatim|lstlisting|minted|comment|Verbatim)\*?$/;
const DESC = { '{': '{', '$': '$', '$$': '$$', '\\[': '\\[', '\\(': '\\(', left: '\\left', env: '\\begin', '(': '(', '[': '[' };

// scan a LaTeX text: returns problems [{ from, to, msg, severity, fix?: { label, at, insert } | { label, from, to } , partner? }]
export function checkBrackets(text) {
  const out = [], stack = [], n = text.length;
  const lineOf = (i) => { let l = 1; for (let k = 0; k < i; k++) if (text.charCodeAt(k) === 10) l++; return l; };
  const lineStarts = [0]; for (let k = 0; k < n; k++) if (text.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const ln = (i) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStarts[m] <= i) lo = m; else hi = m - 1; } return lo + 1; };
  const lineEnd = (i) => { const e = text.indexOf('\n', i); return e < 0 ? n : e; };
  const inMath = () => stack.some(t => t.math);
  const report = (t, msg, extra = {}) => out.push({ from: t.at, to: t.at + t.len, msg, severity: extra.severity || 'warning', ...extra });
  // an opener that never closed: suggest closing at the end of its line (before \\ or a trailing comment) or of its environment
  const unclosed = (t, until, why) => {
    const RD = { '(': ')', '[': ']', '\\{': '\\}', '|': '|', '\\|': '\\|', '\\langle': '\\rangle', '.': '.' };
    const close = t.kind === '{' ? '}' : t.kind === '$' ? '$' : t.kind === '\\[' ? '\\]' : t.kind === '\\(' ? '\\)' : t.kind === 'left' ? '\\right' + (RD[t.delim] || '.') : t.kind === 'env' ? `\\end{${t.name}}` : t.kind === '(' ? ')' : t.kind === '[' ? ']' : '';
    let at = Math.min(lineEnd(t.at), until ?? n);
    const lineText = text.slice(t.at, at), m = /\s*(\\\\)?\s*(%.*)?$/.exec(lineText); if (m) at = t.at + m.index;
    if (at <= t.at + t.len) at = Math.min(lineEnd(t.at), until ?? n);
    const what = t.kind === 'env' ? `\\begin{${t.name}}` : t.kind === 'left' ? '\\left' + (t.delim || '') : DESC[t.kind] || t.kind;
    report(t, `This ${what}${t.after ? ` (after ${t.after})` : ''} is never closed${why ? ' — ' + why : ''}.`, { severity: t.soft ? 'info' : 'warning', fix: close ? { label: 'Close it here', at, insert: close } : null, remove: t.kind !== 'env' });
  };
  const popTo = (pred, closerAt, why) => { // pop to the first opener matching pred; report the ones skipped
    let j = stack.length - 1; while (j >= 0 && !pred(stack[j])) j--;
    if (j < 0) return null;
    for (let k = stack.length - 1; k > j; k--) if (!stack[k].soft || stack[k].kind === 'left') unclosed(stack[k], closerAt, why);
    const t = stack[j]; stack.length = j; return t;
  };
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '%') { i = lineEnd(i); continue; }
    if (c === '\n') {
      // a blank line ends a paragraph: inline maths cannot run across it
      if (text[i + 1] === '\n' || /^\n[ \t]*\n/.test(text.slice(i, i + 40))) {
        for (let k = stack.length - 1; k >= 0; k--) {
          const t = stack[k];
          if (t.kind === '$' || t.kind === '\\(') { report(t, `${t.kind === '$' ? '$' : '\\('} opened on line ${ln(t.at)} but the paragraph ends before it is closed.`, { fix: { label: 'Close it here', at: (() => { let e = i; while (e > t.at && /\s/.test(text[e - 1])) e--; return e; })(), insert: t.kind === '$' ? '$' : '\\)' }, remove: true }); stack.splice(k); break; }
        }
      }
      i++; continue;
    }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+\*?|.)/.exec(text.slice(i, i + 40)); if (!m) { i++; continue; }
      const w = m[1];
      if (w === 'begin' || w === 'end') {
        const a = /^\\(begin|end)\s*\{([^}\n]*)\}/.exec(text.slice(i, i + 80));
        if (!a) { i += m[0].length; continue; }
        const name = a[2].trim(), len = a[0].length;
        if (w === 'begin') {
          if (VERBATIM.test(name)) { const e = text.indexOf(`\\end{${name}}`, i + len); i = e < 0 ? n : e + `\\end{${name}}`.length; continue; }
          stack.push({ kind: 'env', name, at: i, len, math: MATH_ENVS.test(name) && !/^(cases|matrix|[pbBvV]matrix|array|split|aligned|gathered)\*?$/.test(name) || undefined });
        } else {
          const t = popTo(x => x.kind === 'env' && x.name === name, i, `\\end{${name}} comes first (line ${ln(i)})`);
          if (!t) {
            const top = [...stack].reverse().find(x => x.kind === 'env');
            if (top) stack.splice(stack.indexOf(top)); // count it as closed (by the wrong name), so it is reported once
            report({ at: i, len }, top ? `\\end{${name}} has no \\begin{${name}} — the open environment is \\begin{${top.name}} (line ${ln(top.at)}).` : `\\end{${name}} has no matching \\begin{${name}}.`,
              { fix: top ? { label: `Change to \\end{${top.name}}`, from: i, to: i + len, insert: `\\end{${top.name}}` } : null, remove: true });
          }
        }
        i += len; continue;
      }
      if (w === '[' || w === '(') { stack.push({ kind: '\\' + w, at: i, len: 2, math: true }); i += 2; continue; }
      if (w === ']' || w === ')') {
        const open = '\\' + (w === ']' ? '[' : '(');
        const t = popTo(x => x.kind === open, i, `the maths ends at line ${ln(i)}`);
        if (!t) report({ at: i, len: 2 }, `\\${w} closes maths that was never opened with ${open}.`, { remove: true });
        i += 2; continue;
      }
      if (w === 'left' || w === 'right') {
        const d = /^\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.<>/])/.exec(text.slice(i + 5 + (w === 'right' ? 1 : 0), i + 30));
        const len = (w === 'left' ? 5 : 6) + (d ? d[0].length : 0);
        if (w === 'left') stack.push({ kind: 'left', at: i, len, delim: d ? d[1] : '?', math: true });
        else {
          const t = popTo(x => x.kind === 'left', i, `\\right${d ? d[1] : ''} comes first`);
          if (!t) report({ at: i, len }, `\\right${d ? d[1] : ''} has no \\left before it.`, { fix: { label: 'Make it a plain bracket', from: i, to: i + len, insert: d ? d[1].replace(/^\\(?=[{}|])/, '\\') : '' } });
        }
        i += len; continue;
      }
      if ((w === '{' || w === '}') && inMath()) {
        // \{ \} in maths are brackets (soft check)
        if (w === '{') stack.push({ kind: '\\{', at: i, len: 2, soft: true }); else popTo(x => x.kind === '\\{', i);
        i += 2; continue;
      }
      i += m[0].length; continue;
    }
    if (c === '{') {
      // remember the command just before, for the note ("after \frac")
      const b = /\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\])?\s*(?:\{[^{}]*\})?\s*$/.exec(text.slice(Math.max(0, i - 40), i));
      stack.push({ kind: '{', at: i, len: 1, after: b ? '\\' + b[1] : null }); i++; continue;
    }
    if (c === '}') {
      const t = popTo(x => x.kind === '{', i, `a } comes first (line ${ln(i)})`);
      if (!t) report({ at: i, len: 1 }, 'This } closes nothing: there is no { before it that is still open.', { remove: true });
      i++; continue;
    }
    if (c === '$') {
      const dbl = text[i + 1] === '$', kind = dbl ? '$$' : '$', len = dbl ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top && top.kind === kind) stack.pop();
      else if (stack.some(x => x.kind === kind)) popTo(x => x.kind === kind, i, `the maths ends at line ${ln(i)}`);
      else stack.push({ kind, at: i, len, math: true });
      i += len; continue;
    }
    if ((c === '(' || c === '[') && inMath()) { stack.push({ kind: c, at: i, len: 1, soft: true }); i++; continue; }
    if ((c === ')' || c === ']') && inMath()) {
      // intervals such as [0,1) are fine: any plain opener closes with any plain closer
      const top = stack[stack.length - 1];
      if (top && (top.kind === '(' || top.kind === '[')) stack.pop();
      i++; continue;
    }
    i++;
  }
  for (const t of stack) if (!t.soft || t.kind === 'left') unclosed(t, n, 'the file ends first');
  // mismatched \left( … \right] are fine in LaTeX (half-open intervals), so they are not reported
  return out.sort((a, b) => a.from - b.from).slice(0, 50);
}

export default {
  id: 'brackets',
  name: 'Brackets',
  description: 'Closes \\[ \\], \\( \\), \\left( \\right) and $ $ as you type, and checks brackets, $ … $ and \\begin … \\end as you write: the one at fault is underlined, with a note and a fix. Optional rainbow brackets.',
  category: 'Editing',
  defaultEnabled: true,
  activate(ctx) {
    const { EditorView, EditorSelection, Prec, StateField, StateEffect, Decoration, keymap, hoverTooltip, ViewPlugin } = ctx.cm;
    const h = ctx.h;
    const autoOn = () => ctx.settings.get('auto', true);

    // ---- closing pairs
    const PAIRS = { '\\[': '\\]', '\\(': '\\)', '\\{': '\\}' };
    const followedBy = (text, pos, closer, opener) => { const rest = text.slice(pos, pos + 2000); const c = rest.indexOf(closer), o = rest.indexOf(opener); return c >= 0 && (o < 0 || c < o); };
    ctx.editor.addExtension(Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
      if (!autoOn() || from !== to || view.state.selection.ranges.length > 1) return false;
      const doc = view.state.doc, before = doc.sliceString(Math.max(0, from - 7), from), all = doc.toString();
      const esc = /(^|[^\\])(\\\\)*\\$/.test(before);   // an odd number of backslashes before: this character is escaped
      // \[  \(  \{
      if ((text === '[' || text === '(' || text === '{') && esc) {
        const open = '\\' + text, close = PAIRS[open];
        if (text === '{' && !inMathAt(all, from)) return false;
        if (followedBy(all, from, close, open)) return false;
        const line = doc.lineAt(from);
        if (text === '[' && !line.text.slice(0, from - line.from - 1).trim() && !line.text.slice(from - line.from).trim()) {
          const ind = /^\s*/.exec(line.text)[0];
          view.dispatch({ changes: { from, insert: `[\n${ind}  \n${ind}\\]` }, selection: { anchor: from + 2 + ind.length + 2 }, userEvent: 'input.type' });
          return true;
        }
        const pad = text === '[' ? ' ' : '';
        view.dispatch({ changes: { from, insert: text + pad + pad + close }, selection: { anchor: from + 1 + pad.length }, userEvent: 'input.type' });
        return true;
      }
      // \left( → \right)
      if (/\\left\\?$/.test(before) && /^[([|]$|^\\?\{$/.test(text) || (/\\left\\$/.test(before) && text === '{')) {
        const d = /\\left\\$/.test(before) ? '\\' + text : text;
        const closeD = { '(': ')', '[': ']', '|': '|', '\\{': '\\}', '{': '\\}' }[d] || null; if (!closeD) return false;
        if (followedBy(all, from, '\\right', '\\left')) return false;
        view.dispatch({ changes: { from, insert: text + '  \\right' + closeD }, selection: { anchor: from + text.length + 1 }, userEvent: 'input.type' });
        return true;
      }
      // $ → $ $ (and step over an inserted $)
      if (text === '$' && !esc) {
        if (all[from] === '$' && lastAuto === from) { view.dispatch({ selection: { anchor: from + 1 } }); lastAuto = -1; return true; }
        if (all[from - 1] === '$' || all[from] === '$' || inMathAt(all, from)) return false;
        const line = doc.lineAt(from), count = (line.text.slice(0, from - line.from).replace(/\\\$/g, '').match(/\$/g) || []).length;
        if (count % 2) return false; // closing an open $ on this line
        view.dispatch({ changes: { from, insert: '$$' }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
        lastAuto = from + 1; return true;
      }
      return false;
    })));
    let lastAuto = -1;
    function inMathAt(text, pos) {
      const before = text.slice(Math.max(0, pos - 4000), pos).replace(/(^|[^\\])%.*$/gm, '$1');
      const st = [];
      for (const m of before.matchAll(/\\begin\{(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math)\*?\}|\\end\{(equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math)\*?\}|\\\[|\\\]|\\\(|\\\)/g)) { if (m[1] || m[0] === '\\[' || m[0] === '\\(') st.push(1); else st.pop(); }
      if (st.length) return true;
      const para = before.slice(before.lastIndexOf('\n\n') + 1).replace(/\\\$/g, '');
      return ((para.match(/\$/g) || []).length % 2) === 1;
    }
    // Backspace right after an inserted pair removes both halves
    ctx.editor.addExtension(Prec.high(keymap.of([{ key: 'Backspace', run: (view) => {
      if (!autoOn()) return false;
      const r = view.state.selection.main; if (!r.empty) return false;
      const t = view.state.doc, a = t.sliceString(Math.max(0, r.from - 3), r.from), b = t.sliceString(r.from, r.from + 10);
      for (const [open, close] of [['\\[ ', ' \\]'], ['\\(', '\\)'], ['\\{', '\\}'], ['$', '$']]) {
        if (a.endsWith(open) && b.startsWith(close) && !(open === '$' && a.endsWith('\\$'))) { view.dispatch({ changes: { from: r.from - open.length, to: r.from + close.length }, userEvent: 'delete.backward' }); return true; }
      }
      const lt = /\\left(\\?.)$/.exec(t.sliceString(Math.max(0, r.from - 7), r.from)), rt = /^\s*\\right(\\?.)/.exec(b);
      if (lt && rt && t.sliceString(r.from, r.from + rt[0].length).trim() === rt[0].trim()) { view.dispatch({ changes: { from: r.from - lt[0].length, to: r.from + rt[0].length }, userEvent: 'delete.backward' }); return true; }
      return false;
    } }])));

    // ---- the checker
    const setMarks = StateEffect.define();
    const marks = StateField.define({
      create: () => ({ list: [], deco: Decoration.none }),
      update(v, tr) {
        for (const e of tr.effects) if (e.is(setMarks)) return e.value;
        return tr.docChanged ? { list: v.list.map(p => ({ ...p, from: tr.changes.mapPos(p.from), to: tr.changes.mapPos(p.to, 1) })), deco: v.deco.map(tr.changes) } : v;
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });
    const fixesFor = (p, file) => {
      const out = [];
      if (p.fix) out.push({ label: p.fix.label, edit: { file, run: (t) => p.fix.at != null ? t.slice(0, p.fix.at) + p.fix.insert + t.slice(p.fix.at) : t.slice(0, p.fix.from) + p.fix.insert + t.slice(p.fix.to) } });
      if (p.remove) out.push({ label: 'Remove it', edit: { file, run: (t) => t.slice(0, p.from) + t.slice(p.to) } });
      return out;
    };
    function apply(view, p) {
      const st = view.state;
      if (p.fix) {
        if (p.fix.at != null) view.dispatch({ changes: { from: p.fix.at, insert: p.fix.insert }, selection: { anchor: p.fix.at + p.fix.insert.length }, userEvent: 'input' });
        else view.dispatch({ changes: { from: p.fix.from, to: p.fix.to, insert: p.fix.insert }, userEvent: 'input' });
      }
      view.focus();
    }
    let timer = 0;
    function run() {
      const view = ctx.editor.view, path = ctx.editor.path;
      if (!/\.(tex|ltx|sty|cls)$/i.test(path || '')) { view.dispatch({ effects: setMarks.of({ list: [], deco: Decoration.none }) }); ctx.problems.set([]); return; }
      const text = view.state.doc.toString();
      let list = []; try { list = checkBrackets(text); } catch (e) { console.warn('bracket check', e); }
      const deco = Decoration.set(list.filter(p => p.to > p.from).map(p => Decoration.mark({ class: 'bk-bad' + (p.severity === 'info' ? ' soft' : ''), attributes: { 'data-bk': '1' } }).range(p.from, p.to)), true);
      view.dispatch({ effects: setMarks.of({ list, deco }) });
      ctx.problems.set(list.map(p => ({ severity: p.severity, file: path, line: view.state.doc.lineAt(p.from).number, message: p.msg, why: 'Found by the bracket check as you type (no compile needed).', fixes: fixesFor(p, path) })));
    }
    ctx.editor.addExtension([marks, EditorView.updateListener.of((u) => { if (u.docChanged) { clearTimeout(timer); timer = setTimeout(run, 450); } })]);
    ctx.on('open', () => setTimeout(run, 50));
    setTimeout(run, 100);
    // the note on the underlined bracket
    ctx.editor.addExtension(hoverTooltip((view, pos) => {
      const v = view.state.field(marks, false); if (!v) return null;
      const p = v.list.find(x => pos >= x.from && pos <= x.to); if (!p) return null;
      return { pos: p.from, end: p.to, above: true, create: () => {
        const dom = h('div', { class: 'bk-tip' }, h('div', {}, p.msg), h('div', { class: 'bk-acts' },
          p.fix ? h('button', { class: 'small primary', onClick: () => apply(view, p) }, p.fix.label) : null,
          p.remove ? h('button', { class: 'small', onClick: () => { view.dispatch({ changes: { from: p.from, to: p.to }, userEvent: 'delete' }); view.focus(); } }, 'Remove it') : null,
          p.fix && p.fix.at != null ? h('button', { class: 'small', onClick: () => { view.dispatch({ selection: { anchor: p.fix.at }, scrollIntoView: true }); view.focus(); } }, 'Go to where it should close') : null));
        return { dom };
      } };
    }, { hoverTime: 250 }));

    // ---- stronger matching bracket, optional rainbow brackets
    const rainbowOn = () => ctx.settings.get('rainbow', false);
    const rainbow = ViewPlugin.fromClass(class {
      constructor(view) { this.deco = this.build(view); }
      update(u) { if (u.docChanged || u.viewportChanged || this.on !== rainbowOn()) this.deco = this.build(u.view); }
      build(view) {
        this.on = rainbowOn();
        if (!this.on) return Decoration.none;
        const text = view.state.doc.toString(), ranges = [], vis = view.visibleRanges, end = vis.length ? vis[vis.length - 1].to : 0, startVis = vis.length ? vis[0].from : 0;
        let d = 0;
        for (let i = 0; i < end; i++) {
          const c = text[i];
          if (c === '%' && text[i - 1] !== '\\') { const e = text.indexOf('\n', i); i = e < 0 ? end : e; continue; }
          if (c === '\\') { i++; continue; }
          if (c === '{' || c === '(' || c === '[') { if (i >= startVis) ranges.push(Decoration.mark({ class: 'bk-d' + (d % 5) }).range(i, i + 1)); d++; }
          else if (c === '}' || c === ')' || c === ']') { d = Math.max(0, d - 1); if (i >= startVis) ranges.push(Decoration.mark({ class: 'bk-d' + (d % 5) }).range(i, i + 1)); }
        }
        return Decoration.set(ranges, true);
      }
    }, { decorations: v => v.deco });
    ctx.editor.addExtension(rainbow);
    ctx.ui.addCommand({ id: 'brackets.rainbow', get name() { return rainbowOn() ? 'Brackets: plain colours' : 'Brackets: rainbow colours by depth'; }, run: () => { ctx.settings.set('rainbow', !rainbowOn()); ctx.editor.view.dispatch({}); } });
    ctx.ui.addCommand({ id: 'brackets.auto', get name() { return autoOn() ? 'Brackets: stop closing \\[ \\( $ by themselves' : 'Brackets: close \\[ \\( \\left( $ by themselves'; }, run: () => { ctx.settings.set('auto', !autoOn()); ctx.ui.toast(autoOn() ? 'Brackets close by themselves.' : 'Brackets no longer close by themselves.'); } });

    const css = h('style', {}, `
.bk-bad { text-decoration: underline wavy var(--err, #b42318); text-decoration-skip-ink: none; text-underline-offset: 3px; background: color-mix(in srgb, var(--err, #b42318) 10%, transparent); border-radius: 2px; }
.bk-bad.soft { text-decoration-style: dotted; text-decoration-color: var(--warn, #9a6700); background: none; }
.bk-tip { max-width: 380px; padding: 8px 10px; font: 13px var(--ui); color: var(--ink); display: grid; gap: 8px; }
.bk-acts { display: flex; gap: 6px; flex-wrap: wrap; } .bk-acts:empty { display: none; }
.cm-matchingBracket { background: color-mix(in srgb, var(--accent) 22%, transparent) !important; outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); border-radius: 2px; }
.cm-nonmatchingBracket { background: color-mix(in srgb, var(--err, #b42318) 20%, transparent) !important; }
.bk-d0 { color: #2f6fbd; } .bk-d1 { color: #a2559c; } .bk-d2 { color: #b26b00; } .bk-d3 { color: #2b8a3e; } .bk-d4 { color: #c0392b; }
[data-theme=dark] .bk-d0 { color: #7fb0f0; } [data-theme=dark] .bk-d1 { color: #e09ad8; } [data-theme=dark] .bk-d2 { color: #f0b860; } [data-theme=dark] .bk-d3 { color: #7fd68f; } [data-theme=dark] .bk-d4 { color: #f28b82; }`);
    document.head.append(css);
    ctx.onDispose(() => { clearTimeout(timer); css.remove(); ctx.problems.clear(); });
  },
};
