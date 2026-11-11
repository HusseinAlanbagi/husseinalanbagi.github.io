// Typeset view. The source stays one document; you choose which parts of it are shown the way they will
// look: equations, headings and emphasis, citations and labels, the preamble, and a page layout with the
// text set in a serif face on a sheet. Each part is a separate switch in the View menu above the editor,
// so "source only" and "the whole page" are just the two ends. Wherever the cursor is, the LaTeX shows.

const MATH_ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math';
const STAR_FOR = { equation: '', displaymath: '', math: '', align: 'align*', gather: 'gather*', multline: 'multline*', eqnarray: 'eqnarray*', flalign: 'flalign*', alignat: 'alignat*' };
const HEADINGS = { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 4 };
const FORMATS = { textbf: 'vz-b', textit: 'vz-i', emph: 'vz-i', textsl: 'vz-i', underline: 'vz-u', texttt: 'vz-tt', textsc: 'vz-sc', mathbf: 'vz-b' };
const REFS = /^(ref|eqref|cref|Cref|autoref|pageref|cite|citep|citet|citealp|citeauthor|citeyear|parencite|textcite|autocite|label|footnote|url|href)$/;

// ---------------------------------------------------------------- MathJax (already shipped with the equation editor)
let mj = null;
function loadMathJax() {
  if (mj) return mj;
  mj = new Promise((resolve, reject) => {
    if (window.MathJax && window.MathJax.tex2svg) return resolve(window.MathJax);
    window.MathJax = { tex: { tags: 'none' }, svg: { fontCache: 'local' }, startup: { typeset: false, ready() { window.MathJax.startup.defaultReady(); window.MathJax.startup.promise.then(() => { try { document.head.append(window.MathJax.svgStylesheet()); } catch {} resolve(window.MathJax); }); } }, options: { enableMenu: false } };
    const s = document.createElement('script');
    s.src = new URL('./equation/mathjax/tex-svg-full.js', document.baseURI).href; s.async = true;
    s.onerror = () => reject(new Error('MathJax could not be loaded'));
    document.head.append(s);
  });
  return mj;
}
const svgCache = new Map();
function renderMath(tex, display, macros) {
  const key = (display ? 'D' : 'I') + macros + '\u0000' + tex;
  if (svgCache.has(key)) return svgCache.get(key);
  let html;
  try {
    const node = window.MathJax.tex2svg(macros + tex, { display });
    node.querySelectorAll('mjx-assistive-mml').forEach(n => n.remove());   // screen-reader copy; we set aria-label instead
    const err = node.querySelector('[data-mjx-error]');
    node.setAttribute('aria-label', tex.trim()); node.setAttribute('role', 'img');
    html = { html: node.outerHTML, error: err ? err.getAttribute('data-mjx-error') : null };
  } catch (e) { html = { html: null, error: e.message }; }
  if (svgCache.size > 3000) svgCache.clear();
  svgCache.set(key, html);
  return html;
}

// ---------------------------------------------------------------- reading the source
// Comments are blanked out (keeping positions), so nothing inside them is read.
function blankComments(s) {
  return s.replace(/(^|[^\\])(%.*)$/gm, (m, a, c) => a + ' '.repeat(c.length));
}
function closeBrace(s, open) {     // s[open] === '{'  -> index of the matching '}'
  let d = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return i;
  }
  return -1;
}
function skipOptional(s, i) {      // skip spaces, *, and [optional] arguments
  for (;;) {
    while (s[i] === ' ' || s[i] === '*') i++;
    if (s[i] !== '[') return i;
    let d = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && --d === 0) break; }
    if (j >= s.length) return i;
    i = j + 1;
  }
}
// Definitions from the preamble, so equations that use \newcommand macros still draw.
function macroDefs(src) {
  const pre = src.split('\\begin{document}')[0], out = [];
  for (const m of pre.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?\s*(\[\d\])?\s*(?:\[[^\]]*\])?\s*\{/g)) {
    const open = m.index + m[0].length - 1, close = closeBrace(pre, open);
    if (close > 0) out.push(`\\newcommand{\\${m[1]}}${m[2] || ''}{${pre.slice(open + 1, close)}}`);
  }
  for (const m of pre.matchAll(/\\DeclareMathOperator(\*?)\s*\{\\([A-Za-z]+)\}\s*\{([^{}]*)\}/g)) out.push(`\\newcommand{\\${m[2]}}{\\operatorname${m[1]}{${m[3]}}}`);
  return out.join('');
}
function titleInfo(src) {
  const pre = src.split('\\begin{document}')[0], get = (cmd) => {
    const m = new RegExp(`\\\\${cmd}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(blankComments(pre)); if (!m) return null;
    const open = m.index + m[0].length - 1, close = closeBrace(pre, open); return close > 0 ? pre.slice(open + 1, close) : null;
  };
  return { title: get('title'), author: get('author'), date: get('date') };
}
const plainText = (t) => (t || '').replace(/\\thanks\{[^}]*\}/g, '').replace(/\\today/g, new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))
  .replace(/\\\\(\[[^\]]*\])?/g, ', ').replace(/\\and\b/g, ' · ').replace(/\\[a-zA-Z]+\*?\s*/g, '').replace(/[{}~]/g, ' ').replace(/\s+/g, ' ').trim();

// One pass over the document. Returns a list of items {from, to, kind, ...}, sorted by position.
export function parse(doc) {
  const s = blankComments(doc), items = [];
  const taken = [];                 // maths ranges: nothing else is read inside them
  const inTaken = (i) => taken.some(r => i >= r.from && i < r.to);
  const lineStart = (i) => doc.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (i) => { const e = doc.indexOf('\n', i); return e < 0 ? doc.length : e; };
  const wholeLines = (from, to) => doc.slice(lineStart(from), from).trim() === '' && doc.slice(to, lineEnd(to)).trim() === '';

  // preamble
  const bd = /\\begin\{document\}/.exec(s);
  const bodyStart = bd ? bd.index : 0;
  if (bd && bd.index > 0) {
    const end = Math.max(0, lineStart(bd.index) - 1);
    if (end > 0) items.push({ kind: 'preamble', from: 0, to: end, lines: doc.slice(0, end).split('\n').length });
  }
  // display maths
  const disp = new RegExp(`\\\\begin\\{(${MATH_ENVS})(\\*?)\\}([\\s\\S]*?)\\\\end\\{\\1\\2\\}|\\\\\\[([\\s\\S]*?)\\\\\\]|\\$\\$([\\s\\S]*?)\\$\\$`, 'g');
  for (const m of s.matchAll(disp)) {
    if (m.index < bodyStart) continue;
    const from = m.index, to = from + m[0].length;
    let body = doc.slice(from, to), env = m[1];
    if (env) body = body.slice(body.indexOf('}') + 1, body.lastIndexOf('\\end{'));
    else body = m[4] != null ? doc.slice(from + 2, to - 2) : doc.slice(from + 2, to - 2);
    const labels = [...body.matchAll(/\\label\s*\{([^}]*)\}/g)].map(x => x[1]);
    let tex = body.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '');
    if (env && STAR_FOR[env]) tex = `\\begin{${STAR_FOR[env]}}${tex}\\end{${STAR_FOR[env]}}`;
    const numbered = env ? !m[2] && env !== 'displaymath' && env !== 'math' : false;
    const inner = env ? from + doc.slice(from, to).indexOf('}') + 1 : from + 2;
    items.push({ kind: 'dmath', from, to, inner, tex, labels, numbered, block: wholeLines(from, to) });
    taken.push({ from, to });
  }
  // inline maths: \( \) and $ $ (paragraph by paragraph, skipping escaped \$)
  for (const m of s.matchAll(/\\\(([\s\S]*?)\\\)/g)) if (m.index >= bodyStart && !inTaken(m.index)) { items.push({ kind: 'imath', from: m.index, to: m.index + m[0].length, tex: doc.slice(m.index + 2, m.index + m[0].length - 2) }); taken.push({ from: m.index, to: m.index + m[0].length }); }
  for (let i = bodyStart, open = -1; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '\n' && s[i + 1] === '\n') { open = -1; continue; }
    if (c !== '$' || inTaken(i)) continue;
    if (s[i + 1] === '$') { i++; continue; }
    if (open < 0) open = i;
    else { if (i > open + 1) { items.push({ kind: 'imath', from: open, to: i + 1, tex: doc.slice(open + 1, i) }); taken.push({ from: open, to: i + 1 }); } open = -1; }
  }
  // typographic characters in running text: dashes, ties, TeX quotes
  for (const m of s.matchAll(/---|--|~|``|''/g)) {
    const i = m.index; if (i < bodyStart || inTaken(i) || s[i - 1] === '\\' || s[i - 1] === '-' || s[i + m[0].length] === '-') continue;
    items.push({ kind: 'char', from: i, to: i + m[0].length, text: { '---': '—', '--': '–', '~': '\u00a0', '``': '“', "''": '”' }[m[0]] });
  }
  // commands
  const enumStack = [];
  for (const m of s.matchAll(/\\([A-Za-z]+)\*?/g)) {
    const i = m.index, name = m[1];
    if (i < bodyStart || inTaken(i)) continue;
    const after = i + m[0].length;
    if (name === 'begin' || name === 'end') {
      const e = /^\s*\{([^}]*)\}/.exec(s.slice(after)); if (!e) continue;
      const env = e[1]; let to = after + e[0].length;
      if (name === 'begin') { const o = /^\[[^\]\n]*\]/.exec(s.slice(to)); if (o) to += o[0].length; }
      if (/^(itemize|enumerate|description)$/.test(env)) { if (name === 'begin') enumStack.push({ env, n: 0 }); else enumStack.pop(); }
      if (env !== 'document') items.push({ kind: 'env', from: i, to, env, end: name === 'end' });
      else items.push({ kind: 'hide', from: i, to });
      continue;
    }
    if (name === 'item') {
      const top = enumStack[enumStack.length - 1];
      let to = after; const opt = /^\s*\[([^\]]*)\]/.exec(s.slice(after));
      let mark = top && top.env === 'enumerate' ? `${++top.n}.` : '•';
      if (opt) { mark = opt[1]; to = after + opt[0].length; }
      if (s[to] === ' ') to++;
      items.push({ kind: 'bullet', from: i, to, mark, depth: Math.max(0, enumStack.length - 1) });
      continue;
    }
    if (name === 'maketitle') { items.push({ kind: 'title', from: i, to: after }); continue; }
    if (name === 'includegraphics') {
      const j = skipOptional(s, after); if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      items.push({ kind: 'image', from: i, to: close + 1, file: doc.slice(j + 1, close).trim() });
      continue;
    }
    if (name in HEADINGS || name in FORMATS) {
      const j = skipOptional(s, after); if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      items.push({ kind: name in HEADINGS ? 'heading' : 'format', from: i, to: close + 1, open: j, close, level: HEADINGS[name], cls: FORMATS[name], cmd: name });
      continue;
    }
    if (REFS.test(name)) {
      const j = skipOptional(s, after); if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      let to = close + 1, arg = doc.slice(j + 1, close).trim();
      if (name === 'href') { const k = closeBrace(s, to); if (s[to] === '{' && k > 0) { arg = doc.slice(to + 1, k).trim(); to = k + 1; } }
      items.push({ kind: 'ref', from: i, to, cmd: name, arg });
      continue;
    }
  }
  return items.sort((a, b) => a.from - b.from || b.to - a.to);
}

// ---------------------------------------------------------------- the module
export default {
  id: 'visual-mode',
  name: 'Typeset view',
  description: 'A View menu above the editor: show equations, headings, citations or the whole text the way they will look, each on its own switch, up to a full page layout. The LaTeX appears wherever you put the cursor.',
  category: 'Writing',
  activate(ctx) {
    const { StateField, StateEffect, EditorView, Decoration, WidgetType, Compartment } = ctx.cm;
    const h = ctx.h;
    const LAYERS = [['math', 'Equations', 'Draw equations instead of showing their code'], ['format', 'Headings and emphasis', 'Section titles, bold, italics, lists, the title block and images'], ['tags', 'Citations and labels', 'Show \\cite, \\ref and \\label as small tags'], ['preamble', 'Fold the preamble', 'Collapse everything before \\begin{document} into one line'], ['page', 'Page layout', 'Set the text in a serif face on a sheet, without line numbers']];
    let layers = ctx.settings.get('layers', {}), ready = !!(window.MathJax && window.MathJax.tex2svg);
    const any = () => LAYERS.some(([k]) => layers[k]);
    const refresh = StateEffect.define();

    // ---- widgets
    const reveal = (view, pos) => (e) => { e.preventDefault(); view.dispatch({ selection: { anchor: pos }, scrollIntoView: false }); view.focus(); };
    class MathWidget extends WidgetType {
      constructor(it, macros, ready) { super(); this.it = it; this.macros = macros; this.ready = ready; }
      eq(o) { return o.it.tex === this.it.tex && o.macros === this.macros && o.ready === this.ready && o.it.from === this.it.from && o.it.labels?.join() === this.it.labels?.join(); }
      toDOM(view) {
        const display = this.it.kind === 'dmath';
        const el = h(display ? 'div' : 'span', { class: display ? 'vz-dmath' : 'vz-imath', title: 'Click to edit the LaTeX (Ctrl+E opens the visual equation editor)' });
        if (this.ready) {
          const r = renderMath(this.it.tex, display, this.macros);
          if (r.html) el.innerHTML = r.html; else el.textContent = this.it.tex;
          if (r.error) { el.classList.add('vz-err'); el.title = 'This equation has a problem: ' + r.error; }
        } else { el.textContent = this.it.tex.trim(); el.classList.add('vz-wait'); }
        if (display && this.it.labels?.length) el.append(h('span', { class: 'vz-eqlabel' }, this.it.labels.map(l => '(' + l + ')').join(' ')));
        else if (display && this.it.numbered) el.append(h('span', { class: 'vz-eqlabel' }, '(#)'));
        el.addEventListener('mousedown', reveal(view, display ? this.it.inner : this.it.from + 1));
        return el;
      }
      ignoreEvent() { return true; }
      get estimatedHeight() { return this.it.kind === 'dmath' ? 48 : -1; }
    }
    class TagWidget extends WidgetType {
      constructor(text, cls, pos, title) { super(); this.text = text; this.cls = cls; this.pos = pos; this.title = title || ''; }
      eq(o) { return o.text === this.text && o.cls === this.cls && o.pos === this.pos; }
      toDOM(view) { const el = h('span', { class: 'vz-tag ' + this.cls, title: this.title }, this.text); el.addEventListener('mousedown', reveal(view, this.pos)); return el; }
      ignoreEvent() { return true; }
    }
    class BlockWidget extends WidgetType {
      constructor(key, build, pos) { super(); this.key = key; this.build = build; this.pos = pos; }
      eq(o) { return o.key === this.key && o.pos === this.pos; }
      toDOM(view) { const el = this.build(); el.addEventListener('mousedown', reveal(view, this.pos)); return el; }
      ignoreEvent() { return true; }
    }
    const urls = new Map();
    function imageUrl(file) {
      const base = (ctx.project.mainFile || '').includes('/') ? ctx.project.mainFile.replace(/[^/]*$/, '') : '';
      const cands = [file, base + file].flatMap(f => /\.[a-z]{3,4}$/i.test(f) ? [f] : ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].map(x => f + '.' + x));
      const path = cands.find(p => ctx.project.exists(p)); if (!path) return null;
      const data = ctx.project.read(path); if (data == null || typeof data === 'string' && !/\.svg$/i.test(path)) return null;
      const key = path + ':' + (data.length || 0);
      if (!urls.has(key)) urls.set(key, URL.createObjectURL(new Blob([data], { type: /\.svg$/i.test(path) ? 'image/svg+xml' : /\.png$/i.test(path) ? 'image/png' : /\.gif$/i.test(path) ? 'image/gif' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg' })));
      return urls.get(key);
    }

    // ---- decorations
    function build(state, items, info) {
      const ranges = [], sel = state.selection.ranges;
      // the cursor at the very start of the file (where it is when a file opens) leaves the preamble folded
      const touched = (it) => sel.some(r => r.from <= it.to && r.to >= it.from && !(it.kind === 'preamble' && r.to === 0));
      const add = (from, to, deco) => { if (to > from || deco.point) ranges.push(deco.range(from, to)); };
      const L = layers, layerOf = { preamble: 'preamble', dmath: 'math', imath: 'math', ref: 'tags' };
      for (const it of items) {
        if (!L[layerOf[it.kind] || 'format']) continue;
        if (touched(it)) { if (it.kind === 'dmath' || it.kind === 'imath') add(it.from, it.to, Decoration.mark({ class: 'vz-src-math' })); continue; }
        switch (it.kind) {
          case 'preamble': ranges.push(Decoration.replace({ block: true, widget: new BlockWidget('pre' + it.lines, () => h('div', { class: 'vz-preamble', title: 'Click to show the preamble' }, `▸ Preamble · ${it.lines} lines (packages and settings) — click to show`), 1) }).range(it.from, it.to)); break;
          case 'dmath': ranges.push(Decoration.replace({ block: it.block, widget: new MathWidget(it, info.macros, ready) }).range(it.block ? state.doc.lineAt(it.from).from : it.from, it.block ? state.doc.lineAt(it.to).to : it.to)); break;
          case 'imath': ranges.push(Decoration.replace({ widget: new MathWidget(it, info.macros, ready) }).range(it.from, it.to)); break;
          case 'heading': add(it.from, it.open + 1, Decoration.replace({})); add(it.open + 1, it.close, Decoration.mark({ class: 'vz-h vz-h' + it.level })); add(it.close, it.close + 1, Decoration.replace({})); break;
          case 'format': add(it.from, it.open + 1, Decoration.replace({})); add(it.open + 1, it.close, Decoration.mark({ class: it.cls })); add(it.close, it.close + 1, Decoration.replace({})); break;
          case 'ref': {
            const label = it.cmd === 'label' ? '🏷 ' + it.arg : /cite/.test(it.cmd) ? it.arg.split(',').map(x => x.trim()).join('; ') : it.cmd === 'footnote' ? '¹ footnote' : /url|href/.test(it.cmd) ? '🔗 ' + it.arg : (it.cmd === 'eqref' ? '(' + it.arg + ')' : '→ ' + it.arg);
            const cls = it.cmd === 'label' ? 'vz-label' : /cite/.test(it.cmd) ? 'vz-cite' : 'vz-ref';
            ranges.push(Decoration.replace({ widget: new TagWidget(label, cls, it.from + 1, it.cmd === 'footnote' ? state.sliceDoc(it.from, it.to) : '\\' + it.cmd + '{' + it.arg + '}') }).range(it.from, it.to)); break;
          }
          case 'bullet': ranges.push(Decoration.replace({ widget: new TagWidget(it.mark, 'vz-bullet', it.from + 1) }).range(it.from, it.to)); break;
          case 'env': {
            const label = it.end || /^(itemize|enumerate|description|center|flushleft|flushright|minipage|subfigure)$/.test(it.env) ? null : it.env.replace(/\*$/, '');
            ranges.push(Decoration.replace(label ? { widget: new TagWidget(label === 'abstract' ? 'Abstract' : label, label === 'abstract' ? 'vz-abs' : 'vz-envtag', it.from + 1, '\\begin{' + it.env + '}') } : {}).range(it.from, it.to)); break;
          }
          case 'hide': add(it.from, it.to, Decoration.replace({})); break;
          case 'char': ranges.push(Decoration.replace({ widget: new TagWidget(it.text, 'vz-char', it.from) }).range(it.from, it.to)); break;
          case 'title': {
            const t = info.title, key = JSON.stringify(t);
            ranges.push(Decoration.replace({ widget: new BlockWidget(key, () => h('span', { class: 'vz-title' }, h('span', { class: 'vz-title-t' }, plainText(t.title) || 'Untitled'), t.author ? h('span', { class: 'vz-title-a' }, plainText(t.author)) : null, t.date !== '' ? h('span', { class: 'vz-title-a' }, plainText(t.date ?? '\\today')) : null), it.from + 1) }).range(it.from, it.to)); break;
          }
          case 'image': {
            const url = imageUrl(it.file);
            ranges.push(Decoration.replace({ widget: new BlockWidget('img' + it.file + url, () => url ? h('span', { class: 'vz-img' }, h('img', { src: url, alt: it.file })) : h('span', { class: 'vz-tag vz-ref', title: 'Images in PDF format are not shown here' }, '🖼 ' + it.file), it.from + 1) }).range(it.from, it.to)); break;
          }
        }
      }
      try { return Decoration.set(ranges, true); }
      catch (e) { console.warn('visual mode', e); return Decoration.none; }
    }
    const read = (state) => { const doc = state.doc.toString(); return { items: parse(doc), info: { macros: macroDefs(doc), title: titleInfo(doc) } }; };
    const field = StateField.define({
      create(state) { const v = read(state); return { ...v, deco: build(state, v.items, v.info) }; },
      update(v, tr) {
        const again = tr.effects.some(e => e.is(refresh));
        if (!tr.docChanged && !tr.selection && !again) return v;
        const r = tr.docChanged ? read(tr.state) : v;
        return { items: r.items, info: r.info, deco: build(tr.state, r.items, r.info) };
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });
    const comp = new Compartment();
    ctx.editor.addExtension([comp.of([])]);
    const view = () => ctx.editor.view;
    let btn;
    const apply = () => {
      const on = any();
      view().dispatch({ effects: comp.reconfigure(on ? [field, EditorView.editorAttributes.of({ class: 'cm-typeset' + (layers.page ? ' cm-page' : '') })] : []) });
      if (btn) btn.classList.toggle('on', on);
      if (layers.math && !ready) loadMathJax().then(() => { ready = true; if (layers.math) view().dispatch({ effects: refresh.of(null) }); }).catch((e) => ctx.ui.toast('Equations cannot be drawn: ' + e.message, 'err'));
    };
    const set = (next) => { if (any()) ctx.settings.set('last', layers); layers = next; ctx.settings.set('layers', layers); apply(); };
    const all = () => Object.fromEntries(LAYERS.map(([k]) => [k, true]));
    const flip = () => set(any() ? {} : (Object.values(ctx.settings.get('last', {})).some(Boolean) ? ctx.settings.get('last') : all()));
    const openMenu = () => ctx.ui.menu(btn, [
      { heading: 'Show as it will look' },
      ...LAYERS.map(([k, label, title]) => ({ label: (layers[k] ? '✓ ' : '\u2003') + label, title, onClick: () => { set({ ...layers, [k]: !layers[k] }); setTimeout(openMenu, 0); } })),
      '-',
      { label: 'Source only', hint: any() ? '' : 'now', onClick: () => set({}) },
      { label: 'The whole page', hint: LAYERS.every(([k]) => layers[k]) ? 'now' : '', onClick: () => set(all()) },
    ]);
    btn = h('button', { class: 'ghost', title: 'Choose what is shown the way it will look (Ctrl+Shift+V switches between source and your last choice)', 'aria-haspopup': 'menu', onClick: openMenu }, ctx.ui.icon('eye'), h('span', { class: 'lbl' }, 'View'));
    ctx.ui.addEditorButton(btn);
    ctx.ui.addCommand({ id: 'visual.toggle', name: 'View: switch between source and typeset', key: 'Mod+Shift+V', run: flip });
    ctx.ui.addCommand({ id: 'visual.page', name: 'View: the whole page', run: () => set(all()) });
    ctx.ui.addCommand({ id: 'visual.source', name: 'View: source only', run: () => set({}) });
    ctx.editor.addKeymap([{ key: 'Mod-Shift-v', run: () => (flip(), true) }]);
    // a new file opened in the editor gets a fresh state: re-apply the view
    ctx.on('open', () => setTimeout(apply, 0));
    apply();
    ctx.onDispose(() => { try { view().dispatch({ effects: comp.reconfigure([]) }); } catch {} urls.forEach(u => URL.revokeObjectURL(u)); });
    // styles
    const css = h('style', {}, `
.cm-page .cm-scroller { background: var(--bg); }
.cm-page .cm-gutters { display: none; }
.cm-page .cm-content { font-family: var(--serif); font-size: 1.14em; line-height: 1.62; max-width: 44rem; margin: 22px auto 60px; padding: 52px 64px 72px; background: var(--paper); box-shadow: 0 1px 2px rgba(23,32,43,.10), 0 10px 30px rgba(23,32,43,.08); border-radius: 2px; min-height: calc(100% - 82px); }
.cm-page .cm-line { padding: 0; }
.cm-page .cm-activeLine { background: transparent; }
.cm-page .vz-h, .cm-page .vz-title-t, .cm-page .vz-abs { font-family: var(--serif); }
.cm-page .vz-src-math, .cm-page .vz-envtag { font-family: var(--mono); }
@container (max-width: 640px) { .cm-page .cm-content { padding: 28px 26px 48px; margin: 10px 8px 40px; } }
.vz-h { font-weight: 700; color: var(--ink); }
.vz-h0 { font-size: 1.6em; } .vz-h1 { font-size: 1.4em; } .vz-h2 { font-size: 1.2em; } .vz-h3 { font-size: 1.08em; } .vz-h4 { font-size: 1em; }
.vz-b { font-weight: 700; } .vz-i { font-style: italic; } .vz-u { text-decoration: underline; } .vz-tt { font-family: var(--mono); } .vz-sc { font-variant: small-caps; }
.vz-dmath { display: flex; justify-content: center; align-items: center; position: relative; padding: 6px 70px; min-height: 2.2em; cursor: text; overflow-x: auto; }
.vz-dmath mjx-container { margin: 0 !important; }
.vz-dmath:hover, .vz-imath:hover { background: var(--accent-soft); border-radius: 4px; }
.vz-imath { cursor: text; padding: 0 1px; }
.vz-wait { font-family: var(--mono); color: var(--muted); font-size: .9em; }
.vz-err { outline: 1px dashed var(--err); outline-offset: 2px; border-radius: 3px; }
.vz-eqlabel { position: absolute; right: 10px; color: var(--muted); font: 12px var(--mono); }
.vz-src-math { background: color-mix(in srgb, var(--accent-soft) 60%, transparent); font-family: var(--mono); font-size: .92em; }
.vz-tag { display: inline-block; font: 12px/1.5 var(--ui); padding: 0 6px; border-radius: 9px; margin: 0 1px; cursor: text; vertical-align: 1px; }
.vz-cite { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
.vz-ref { background: var(--accent-soft); color: var(--accent); }
.vz-label { background: var(--panel-2); color: var(--muted); }
.vz-bullet { background: none; color: var(--accent); font-weight: 700; padding: 0 6px 0 2px; font-size: 1em; }
.vz-envtag { background: none; color: var(--faint); font: 11px var(--mono); padding: 0; }
.vz-abs { background: none; color: var(--ink); font: 700 1em var(--ui); padding: 0; }
.vz-char { background: none; padding: 0; margin: 0; font: inherit; border-radius: 0; vertical-align: baseline; }
.vz-preamble { margin: 4px 8px; padding: 6px 10px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); font: 12px var(--ui); cursor: pointer; }
.vz-preamble:hover { border-color: var(--accent); color: var(--accent); }
.vz-title { display: inline-flex; flex-direction: column; align-items: center; width: 100%; padding: 8px 0 10px; cursor: text; }
.vz-title-t { font-size: 1.6em; font-weight: 700; text-align: center; } .vz-title-a { color: var(--muted); }
.vz-img { display: inline-block; max-width: 100%; padding: 4px 0; cursor: text; } .vz-img img { max-width: min(100%, 520px); max-height: 340px; background: #fff; border: 1px solid var(--line); }
`);
    document.head.append(css);
    ctx.onDispose(() => css.remove());
  },
};
