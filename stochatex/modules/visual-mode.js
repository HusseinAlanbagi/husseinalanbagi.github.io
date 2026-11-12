// Visual view. The source stays one document; with the Visual switch on, it is drawn the way it will print:
// numbered sections and equations, citations as author–year or numbers, tables, captions, theorem headings,
// footnotes, a table of contents and a reference list, on a serif page sheet. The LaTeX shows wherever the
// cursor is. The options next to the switch choose which parts are drawn. Page breaks show in both views:
// exact after a compile (from SyncTeX), estimated before one.

const MATH_ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math';
const STAR_FOR = { equation: 'equation*', displaymath: '', math: '', align: 'align*', gather: 'gather*', multline: 'multline*', eqnarray: 'eqnarray*', flalign: 'flalign*', alignat: 'alignat*' };
const ROWS_ENVS = /^(align|gather|eqnarray|flalign|alignat)$/;
const HEADINGS = { part: -1, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 };
const FORMATS = { textbf: 'vz-b', textit: 'vz-i', emph: 'vz-i', textsl: 'vz-i', underline: 'vz-u', texttt: 'vz-tt', textsc: 'vz-sc', textrm: '', textsf: 'vz-sf', mbox: '', textup: '', textnormal: '' };
const CITE = /^(cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|parencite|textcite|autocite|footcite|Cite|Citet|Citep)$/;
const REF = /^(ref|eqref|cref|Cref|autoref|pageref|nameref|vref)$/;
const HIDE = { noindent: 0, centering: 0, raggedright: 0, raggedleft: 0, medskip: 0, smallskip: 0, bigskip: 0, vspace: 1, hspace: 1, vfill: 0, hfill: 0, FloatBarrier: 0, par: 0, newline: 0, linebreak: 0, protect: 0, phantomsection: 0, addcontentsline: 3, singlespacing: 0, onehalfspacing: 0, doublespacing: 0, setlength: 2, small: 0, footnotesize: 0, scriptsize: 0, normalsize: 0, large: 0, Large: 0, LARGE: 0, selectfont: 0, nocite: 1, bibliographystyle: 1, newpage: 0, clearpage: 0, pagebreak: 0, cleardoublepage: 0, thispagestyle: 1, pagestyle: 1, label: 1, allowbreak: 0, sloppy: 0, normalfont: 0, bfseries: 0, itshape: 0 };
const SYMS = { ldots: '…', dots: '…', textellipsis: '…', LaTeX: 'LaTeX', TeX: 'TeX', S: '§', P: '¶', textendash: '–', textemdash: '—', textquoteright: '’', textquoteleft: '‘', copyright: '©', pounds: '£', euro: '€', textbackslash: '\\', textasciitilde: '~', textdegree: '°', ss: 'ß', ae: 'æ', oe: 'œ', o: 'ø', aa: 'å', l: 'ł', i: 'ı', AE: 'Æ', OE: 'Œ', O: 'Ø', AA: 'Å', L: 'Ł', textbullet: '•', textregistered: '®', texttrademark: '™', dag: '†', ddag: '‡' };
const ACCENT = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', c: '̧', v: '̌', u: '̆', H: '̋', k: '̨', r: '̊' };
const LIST_ENVS = /^(itemize|enumerate|description)$/;
const FLOATS = /^(figure|table|figure\*|table\*|sidewaystable|sidewaysfigure|wrapfigure)$/;
const TABULAR = /^(tabular|tabular\*|tabularx|longtable|tabulary)$/;
const THM_DEFAULT = { theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition', assumption: 'Assumption', remark: 'Remark', example: 'Example', conjecture: 'Conjecture', claim: 'Claim', hypothesis: 'Hypothesis', thm: 'Theorem', lem: 'Lemma', prop: 'Proposition', cor: 'Corollary', defn: 'Definition', assu: 'Assumption' };

// ---------------------------------------------------------------- MathLive (for editing equations in place)
let ml = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL(src, document.baseURI).href; s.onload = res; s.onerror = () => rej(new Error(src + ' could not be loaded')); document.head.append(s); }); }
function loadMathLive() {
  if (ml) return ml;
  ml = (async () => {
    if (!window.StochaBrackets) await loadScript('./equation/brackets.js');
    if (!window.customElements.get('math-field')) await loadScript('./equation/mathlive.min.js');
    const MF = window.MathfieldElement || window.customElements.get('math-field');
    if (MF) { MF.fontsDirectory = new URL('./equation/fonts/', document.baseURI).href; MF.soundsDirectory = null; }
    return MF;
  })();
  ml.catch(() => { ml = null; });
  return ml;
}
// macros for MathLive from the \newcommand lines macroDefs() collects
function mlMacros(defs) {
  const out = {};
  for (const m of defs.matchAll(/\\newcommand\{\\([A-Za-z]+)\}(?:\[(\d)\])?\{/g)) {
    const open = m.index + m[0].length - 1, close = closeBrace(defs, open);
    if (close > 0) out[m[1]] = { args: m[2] ? +m[2] : 0, def: defs.slice(open + 1, close), captureSelection: true };
  }
  return out;
}
const EXTRA = /\\label\s*\{[^}]*\}|\\(?:nonumber|notag)(?![A-Za-z])|\\tag\*?\s*\{[^}]*\}/g;
const MULTI_ROWS = /^(align|gather|multline|flalign)$/;
// what the in-place editor shows for an equation, and how to put an edit back. null: not editable in place
export function editModel(it) {
  if (it.kind === 'imath') return { field: it.tex.trim(), body: it.tex, toBody: (v) => v };
  if (/^(alignat|eqnarray)$/.test(it.env)) return null;
  const body = it.body, lead = body.match(/^\s*/)[0], trail = body.match(/\s*$/)[0];
  const indent = (lead.match(/\n([ \t]*)$/) || [, ''])[1];
  if (MULTI_ROWS.test(it.env)) {
    const rows = splitRows(body.trim());
    const extras = rows.map(r => (r.match(EXTRA) || []).join(' '));
    const clean = rows.map(r => r.replace(EXTRA, '').trim());
    const box = /^(align|flalign)$/.test(it.env) ? 'aligned' : 'gathered';
    const field = clean.length > 1 || box === 'aligned' ? `\\begin{${box}}${clean.join('\\\\')}\\end{${box}}` : clean[0];
    return {
      field, body, rows: clean.length,
      toBody(v) {
        const m = v.match(/^\s*\\begin\{(?:aligned|gathered|split)\}([\s\S]*)\\end\{(?:aligned|gathered|split)\}\s*$/);
        const nr = splitRows((m ? m[1] : v).trim()).map(r => r.trim());
        // labels and \nonumber stay with their row (by position); extra ones go on the last row
        const out = nr.map((r, i) => r + (extras[i] ? ' ' + extras[i] : ''));
        if (extras.length > nr.length) out[out.length - 1] += ' ' + extras.slice(nr.length).filter(Boolean).join(' ');
        return lead + out.join(' \\\\\n' + (indent || '  ')) + trail;
      },
    };
  }
  // \label, \nonumber, \tag at the start or end keep their place and spacing; any in the middle move to the end
  const X = EXTRA.source, head = body.match(new RegExp(`^\\s*(?:(?:${X})\\s*)*`))[0], tail = body.slice(head.length).match(new RegExp(`(?:\\s*(?:${X}))*\\s*$`))[0];
  const mid = body.slice(head.length, body.length - tail.length), midEx = mid.match(EXTRA) || [];
  const field = mid.replace(EXTRA, '').trim();
  return { field, body, toBody: (v) => head + v + (midEx.length ? ' ' + midEx.join(' ') : '') + tail };
}
// MathLive writes x_{t}=y; put it back the way people type it: x_t = y
export function tidyTeX(v) {
  return v.replace(/([_^])\{([A-Za-z0-9])\}(?=(.?))/g, (m, op, c, nx) => op + c + (/[A-Za-z0-9]/.test(nx) ? ' ' : ''))
    .replace(/\s*(&?)\s*=\s*/g, (m, amp) => (amp ? ' &= ' : ' = ')).replace(/^ +| +$/g, '').replace(/\\\\ +/g, '\\\\ ');
}

import { loadMathJax } from './lib/mathjax.js';
import { modelState } from './lib/model-state.js';
import { MODEL_COMMENT } from './lib/latex-math.js';
const svgCache = new Map();
function renderMath(tex, display, macros, width = 0) {
  const key = (display ? 'D' + width : 'I') + macros + '\u0000' + tex;
  if (svgCache.has(key)) return svgCache.get(key);
  let out;
  try {
    const node = window.MathJax.tex2svg(macros + tex, display ? { display, containerWidth: width || 600, em: 16, ex: 8 } : { display });
    node.querySelectorAll('mjx-assistive-mml').forEach(n => n.remove());
    const err = node.querySelector('[data-mjx-error]');
    node.setAttribute('aria-label', tex.trim()); node.setAttribute('role', 'img');
    out = { html: node.outerHTML, error: err ? err.getAttribute('data-mjx-error') : null };
  } catch (e) { out = { html: null, error: e.message }; }
  if (svgCache.size > 3000) svgCache.clear();
  svgCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- reading the source
function blankComments(s) { return s.replace(/(^|[^\\])(%.*)$/gm, (m, a, c) => a + ' '.repeat(c.length)); }
function closeBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return i;
  }
  return -1;
}
// optional arguments after position i: returns { to, opts: [text...] }
function optionals(s, i) {
  const opts = [];
  for (;;) {
    let j = i; while (s[j] === ' ' || s[j] === '*') j++;
    if (s[j] !== '[') return { to: i, opts };
    let d = 0, k = j;
    for (; k < s.length; k++) { if (s[k] === '[') d++; else if (s[k] === ']' && --d === 0) break; else if (s[k] === '\n' && s[k + 1] === '\n') return { to: i, opts }; }
    if (k >= s.length) return { to: i, opts };
    opts.push(s.slice(j + 1, k)); i = k + 1;
  }
}
const skipOptional = (s, i) => { const o = optionals(s, i); let j = o.to; while (s[j] === ' ' || s[j] === '*') j++; return j; };
function macroDefs(src) {
  const pre = src.split('\\begin{document}')[0], out = [];
  for (const m of pre.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?\s*(\[\d\])?\s*(?:\[[^\]]*\])?\s*\{/g)) {
    const open = m.index + m[0].length - 1, close = closeBrace(pre, open);
    if (close > 0) out.push(`\\newcommand{\\${m[1]}}${m[2] || ''}{${pre.slice(open + 1, close)}}`);
  }
  for (const m of pre.matchAll(/\\DeclareMathOperator(\*?)\s*\{\\([A-Za-z]+)\}\s*\{([^{}]*)\}/g)) out.push(`\\newcommand{\\${m[2]}}{\\operatorname${m[1]}{${m[3]}}}`);
  return out.join('');
}
// the arguments of \title, \author and \date: { title: { from, to, text } | null, ... } (from/to are inside the braces)
export function titleArgs(doc) {
  const end = doc.indexOf('\\begin{document}'), pre = blankComments(end < 0 ? doc : doc.slice(0, end)), out = {};
  for (const cmd of ['title', 'author', 'date']) {
    const m = new RegExp(`\\\\${cmd}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(pre);
    if (!m) { out[cmd] = null; continue; }
    const open = m.index + m[0].length - 1, close = closeBrace(pre, open);
    out[cmd] = close > 0 ? { from: open + 1, to: close, text: doc.slice(open + 1, close), at: m.index } : null;
  }
  return out;
}
// LaTeX text -> plain text (accents, symbols, simple commands)
export function deTeX(t, keepSpace = false) {
  const out = (t || '')
    .replace(/\\([cvuHkr])\s*\{\s*(\\?[A-Za-z])\s*\}/g, (m, a, c) => (c.replace('\\', '') + ACCENT[a]).normalize('NFC'))
    .replace(/\\(['`^"~=.])\s*\{?\s*(\\?[A-Za-z])\}?/g, (m, a, c) => ((c === '\\i' ? 'i' : c.replace('\\', '')) + ACCENT[a]).normalize('NFC'))
    .replace(/\\(ss|ae|oe|aa|AE|OE|AA|o|O|l|L|i)\b\s?/g, (m, c) => SYMS[c])
    .replace(/\\thanks\s*\{[^}]*\}/g, '').replace(/\\today\b/g, today())
    .replace(/\\\\(\[[^\]]*\])?/g, ', ').replace(/\s*\\and\b\s*/g, ', ')
    .replace(/\\([&%$#_{}])/g, '$1').replace(/---/g, '—').replace(/--/g, '–').replace(/``|''/g, '"').replace(/~/g, ' ')
    .replace(/\\([A-Za-z]+)\*?\s*/g, (m, c) => SYMS[c] ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ');
  return keepSpace ? out : out.trim();
}
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- bibliography (.bib files in the project)
export function parseBib(text) {
  const out = new Map(); let i = 0;
  while ((i = text.indexOf('@', i)) >= 0) {
    const m = /^@(\w+)\s*[{(]\s*([^,\s]+)\s*,/.exec(text.slice(i, i + 300));
    if (!m) { i++; continue; }
    const type = m[1].toLowerCase(); let j = i + m[0].length; const fields = {};
    if (/^(comment|string|preamble)$/.test(type)) { i = j; continue; }
    for (;;) {
      const f = /^\s*([A-Za-z-]+)\s*=\s*/.exec(text.slice(j, j + 80));
      if (!f) break;
      j += f[0].length; let v = '';
      if (text[j] === '{') { const c = closeBrace(text, j); if (c < 0) break; v = text.slice(j + 1, c); j = c + 1; }
      else if (text[j] === '"') { const c = text.indexOf('"', j + 1); if (c < 0) break; v = text.slice(j + 1, c); j = c + 1; }
      else { const c = /^[^,}\s]*/.exec(text.slice(j))[0]; v = c; j += c.length; }
      fields[f[1].toLowerCase()] = v.replace(/\s+/g, ' ').trim();
      const sep = /^\s*,?/.exec(text.slice(j))[0]; j += sep.length;
      if (!sep.includes(',')) break;
    }
    const names = (fields.author || fields.editor || '').split(/\s+and\s+/i).filter(Boolean).map(a => { a = deTeX(a); return a.includes(',') ? a.split(',')[0].trim() : a.split(' ').pop(); });
    out.set(m[2], { type, names, full: deTeX(fields.author || fields.editor || ''), year: (fields.year || fields.date || '').slice(0, 4), title: deTeX(fields.title || ''), where: deTeX(fields.journal || fields.booktitle || fields.publisher || fields.institution || fields.school || '') });
    i = j;
  }
  return out;
}
const authorsShort = (e) => !e ? '' : e.names.length > 2 ? e.names[0] + ' et al.' : e.names.join(' and ');

// ---------------------------------------------------------------- one pass over the document
// Returns { items, info }: items are {from, to, kind, ...} sorted by position; info has numbering and context.
export function parse(doc) {
  const s = blankComments(doc), items = [], taken = [];
  const inTaken = (i) => taken.some(r => i >= r.from && i < r.to);
  const lineStart = (i) => doc.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (i) => { const e = doc.indexOf('\n', i); return e < 0 ? doc.length : e; };
  const wholeLines = (from, to) => doc.slice(lineStart(from), from).trim() === '' && doc.slice(to, lineEnd(to)).trim() === '';
  const bd = /\\begin\{document\}/.exec(s), bodyStart = bd ? bd.index : 0;
  const pre = doc.slice(0, bodyStart);
  if (bd && bd.index > 0) { const end = Math.max(0, lineStart(bd.index) - 1); if (end > 0) items.push({ kind: 'preamble', from: 0, to: end, lines: doc.slice(0, end).split('\n').length }); }
  // comments in the body (hidden on the page sheet)
  for (const m of doc.slice(bodyStart).matchAll(/(^|[^\\])(%.*)$/gm)) { const from = bodyStart + m.index + m[1].length; items.push({ kind: 'comment', from, to: from + m[2].length }); }
  // display maths
  const disp = new RegExp(`\\\\begin\\{(${MATH_ENVS})(\\*?)\\}([\\s\\S]*?)\\\\end\\{\\1\\2\\}|\\\\\\[([\\s\\S]*?)\\\\\\]|\\$\\$([\\s\\S]*?)\\$\\$`, 'g');
  for (const m of s.matchAll(disp)) {
    if (m.index < bodyStart) continue;
    const from = m.index, to = from + m[0].length, env = m[1];
    let body = doc.slice(from, to);
    body = env ? body.slice(body.indexOf('}') + 1, body.lastIndexOf('\\end{')) : doc.slice(from + 2, to - 2);
    const numbered = env ? !m[2] && env !== 'displaymath' && env !== 'math' : false;
    const inner = env ? from + doc.slice(from, to).indexOf('}') + 1 : from + 2;
    items.push({ kind: 'dmath', from, to, inner, env: env || '', body, numbered, block: wholeLines(from, to) });
    taken.push({ from, to });
  }
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
  // typography in running text
  for (const m of s.matchAll(/---|--|~|``|''|\\([&%$#_{}])|\\([cvuHkr])\s*\{\s*(\\?[A-Za-z])\s*\}|\\(['`^"~=.])\s*(\{\s*(\\?[A-Za-z])\s*\}|[A-Za-z])/g)) {
    const i = m.index; if (i < bodyStart || inTaken(i)) continue;
    let text;
    if (m[1]) text = m[1];
    else if (m[2]) text = (m[3].replace('\\', '') + ACCENT[m[2]]).normalize('NFC');
    else if (m[4]) { const ch = (m[6] || m[5]).replace('\\', ''); text = ch + ACCENT[m[4]]; text = text.normalize('NFC'); }
    else { if (s[i - 1] === '\\' || s[i - 1] === '-' || s[i + m[0].length] === '-') continue; text = { '---': '—', '--': '–', '~': ' ', '``': '“', "''": '”' }[m[0]]; }
    items.push({ kind: 'char', from: i, to: i + m[0].length, text });
  }
  // line breaks \\ in running text
  for (const m of s.matchAll(/\\\\(\*?)(\[[^\]\n]*\])?/g)) if (m.index >= bodyStart && !inTaken(m.index)) items.push({ kind: 'hide', from: m.index, to: m.index + m[0].length });
  // commands
  const listStack = [];
  for (const m of s.matchAll(/\\([A-Za-z]+)(\*?)/g)) {
    const i = m.index, name = m[1], star = !!m[2];
    if (i < bodyStart || inTaken(i) || (i > 0 && s[i - 1] === '\\' && s[i - 2] !== '\\')) continue;
    const after = i + m[0].length;
    if (name === 'begin' || name === 'end') {
      const e = /^\s*\{([^}]*)\}/.exec(s.slice(after)); if (!e) continue;
      const env = e[1]; let to = after + e[0].length, opts = [];
      if (name === 'begin') { const o = optionals(s, to); to = o.to; opts = o.opts; }
      if (LIST_ENVS.test(env)) { if (name === 'begin') listStack.push({ env, n: 0 }); else listStack.pop(); }
      items.push({ kind: env === 'document' ? 'hide' : 'env', from: i, to, env, end: name === 'end', opt: opts[0] });
      continue;
    }
    if (name === 'item') {
      const top = listStack[listStack.length - 1];
      const o = optionals(s, after); let to = o.to;
      let mark = top && top.env === 'enumerate' ? `${++top.n}.` : '•';
      if (o.opts.length) mark = o.opts[0];
      if (s[to] === ' ') to++;
      items.push({ kind: 'bullet', from: i, to, mark, depth: Math.max(0, listStack.length - 1), desc: top && top.env === 'description' });
      continue;
    }
    if (name === 'maketitle') { items.push({ kind: 'title', from: i, to: after }); continue; }
    if (name === 'tableofcontents') { items.push({ kind: 'toc', from: i, to: after }); continue; }
    if (name === 'appendix') { items.push({ kind: 'appendix', from: i, to: after }); continue; }
    if (name === 'bibliography' || name === 'printbibliography') {
      let to = after; if (name === 'bibliography') { const j = skipOptional(s, after); if (s[j] === '{') { const c = closeBrace(s, j); if (c > 0) to = c + 1; } } else to = optionals(s, after).to;
      items.push({ kind: 'bib', from: i, to }); continue;
    }
    if (name === 'includegraphics') {
      const j = skipOptional(s, after); if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      items.push({ kind: 'image', from: i, to: close + 1, file: doc.slice(j + 1, close).trim() });
      continue;
    }
    if (name === 'caption' || name in HEADINGS || name in FORMATS || name === 'footnote' || name === 'href' || name === 'url') {
      const j = skipOptional(s, after); if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      if (name === 'footnote') { items.push({ kind: 'footnote', from: i, to: close + 1, text: doc.slice(j + 1, close) }); continue; }
      if (name === 'url') { items.push({ kind: 'link', from: i, to: close + 1, text: doc.slice(j + 1, close), url: doc.slice(j + 1, close) }); continue; }
      if (name === 'href') { const k = s[close + 1] === '{' ? closeBrace(s, close + 1) : -1; if (k < 0) continue; items.push({ kind: 'format', from: i, to: k + 1, open: close + 1, close: k, cls: 'vz-link', cmd: name, url: doc.slice(j + 1, close) }); continue; }
      items.push({ kind: name === 'caption' ? 'caption' : name in HEADINGS ? 'heading' : 'format', from: i, to: close + 1, open: j, close, level: HEADINGS[name], cls: FORMATS[name], cmd: name, star });
      continue;
    }
    if (CITE.test(name) || REF.test(name)) {
      const o = optionals(s, after); let j = o.to; while (s[j] === ' ') j++;
      if (s[j] !== '{') continue;
      const close = closeBrace(s, j); if (close < 0) continue;
      items.push({ kind: CITE.test(name) ? 'cite' : 'ref', from: i, to: close + 1, cmd: name, arg: doc.slice(j + 1, close).trim(), opts: o.opts, star });
      continue;
    }
    if (name in SYMS) { items.push({ kind: 'char', from: i, to: after + (s[after] === '{' && s[after + 1] === '}' ? 2 : 0), text: SYMS[name] }); continue; }
    if (name === 'today') { items.push({ kind: 'char', from: i, to: after, text: today() }); continue; }
    if (name in HIDE) {
      let to = optionals(s, after).to;
      for (let n = HIDE[name]; n > 0; n--) { let j = to; while (s[j] === ' ') j++; if (s[j] !== '{') break; const c = closeBrace(s, j); if (c < 0) break; to = c + 1; }
      if (name === 'label') { items.push({ kind: 'label', from: i, to, arg: doc.slice(after, to).replace(/^\s*\{|\}$/g, '').trim() }); continue; }
      items.push({ kind: /^(newpage|clearpage|pagebreak|cleardoublepage)$/.test(name) ? 'newpage' : 'hide', from: i, to });
      continue;
    }
  }
  items.sort((a, b) => a.from - b.from || b.to - a.to);

  // ---- environments: pair \begin and \end
  const blocks = [], stack = [];
  for (const it of items) {
    if (it.kind !== 'env') continue;
    if (!it.end) stack.push(it);
    else { for (let k = stack.length - 1; k >= 0; k--) if (stack[k].env === it.env) { const b = stack[k]; stack.length = k; blocks.push({ env: it.env, from: b.from, to: it.to, begin: b, endItem: it, depth: stack.filter(x => LIST_ENVS.test(x.env)).length }); break; } }
  }
  // tables drawn as tables
  for (const b of blocks) if (TABULAR.test(b.env)) {
    let j = b.begin.to; while (/\s/.test(s[j])) j++;
    if (b.env === 'tabularx' || b.env === 'tabular*') { if (s[j] === '{') { j = closeBrace(s, j) + 1; while (/\s/.test(s[j])) j++; } }
    if (s[j] !== '{') continue;
    const c = closeBrace(s, j); if (c < 0) continue;
    items.push({ kind: 'table', from: b.from, to: b.to, spec: doc.slice(j + 1, c), body: doc.slice(c + 1, b.endItem.from), block: wholeLines(b.from, b.to) });
  }
  items.sort((a, b) => a.from - b.from || b.to - a.to);

  // ---- numbering, the way LaTeX would count
  const thm = { ...THM_DEFAULT }, thmShared = {}, thmStar = new Set();
  for (const m of blankComments(pre).matchAll(/\\(?:newtheorem|declaretheorem)(\*?)\s*\{([^}]*)\}\s*(?:\[([^\]]*)\])?\s*(?:\{([^}]*)\})?/g)) {
    const name = m[2].trim(); thm[name] = m[4] ? deTeX(m[4]) : name[0].toUpperCase() + name.slice(1); if (m[1]) thmStar.add(name); if (m[3]) thmShared[name] = m[3].trim();
  }
  const cls = (/\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/.exec(pre) || [])[1] || 'article';
  const hasChapters = /book|report|thesis|memoir/.test(cls);
  const eqWithin = (/\\numberwithin\s*\{equation\}\s*\{(\w+)\}/.exec(pre) || [])[1];
  const counters = [0, 0, 0, 0, 0, 0], cnt = { equation: 0, figure: 0, table: 0, footnote: 0 }, thmCnt = {};
  let appendix = false, anchor = null, floatEnv = null;
  const labels = new Map(), headings = [], cites = [];
  const secNum = (level) => {
    const top = hasChapters ? 0 : 1, parts = [];
    for (let l = top; l <= level; l++) parts.push(l === top && appendix ? String.fromCharCode(64 + counters[l]) : counters[l]);
    return parts.join('.');
  };
  const prefix = () => { if (!eqWithin) return ''; const l = HEADINGS[eqWithin]; return (l === (hasChapters ? 0 : 1) && appendix ? String.fromCharCode(64 + counters[l]) : counters[l]) + '.'; };
  const blockAt = new Map(blocks.map(b => [b.begin, b]));
  for (const it of items) {
    if (it.kind === 'appendix') { appendix = true; counters[hasChapters ? 0 : 1] = 0; continue; }
    if (it.kind === 'heading') {
      const numberedLevel = it.level >= 0 && it.level <= (hasChapters ? 2 : 3);
      if (!it.star && numberedLevel) { counters[it.level]++; for (let l = it.level + 1; l < counters.length; l++) counters[l] = 0; if (eqWithin && HEADINGS[eqWithin] === it.level) cnt.equation = 0; it.num = secNum(it.level); anchor = { type: it.level === 0 ? 'chapter' : it.level === 1 ? 'section' : 'subsection', num: it.num, name: it.level === 0 ? 'Chapter' : appendix && it.level === (hasChapters ? 0 : 1) ? 'Appendix' : 'Section' }; }
      headings.push({ level: it.level, num: it.num, text: deTeX(doc.slice(it.open + 1, it.close)), from: it.from });
      continue;
    }
    if (it.kind === 'dmath') {
      const rows = ROWS_ENVS.test(it.env) ? splitRows(it.body) : [it.body];
      it.rows = rows.map((r) => {
        const lab = [...r.matchAll(/\\label\s*\{([^}]*)\}/g)].map(x => x[1].trim());
        const tagM = /\\tag\*?\s*\{([^}]*)\}/.exec(r);
        let num = null;
        if (tagM) num = tagM[1];
        else if (it.numbered && !/\\(nonumber|notag)\b/.test(r) && (r.trim() || rows.length === 1)) num = prefix() + (++cnt.equation);
        for (const l of lab) labels.set(l, { type: 'equation', num, name: 'Equation' });
        return { tex: r.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '').replace(/\\tag\*?\s*\{[^}]*\}/g, ''), num };
      });
      it.labels = [...it.body.matchAll(/\\label\s*\{([^}]*)\}/g)].map(x => x[1]);
      continue;
    }
    if (it.kind === 'env' && !it.end) {
      if (FLOATS.test(it.env)) floatEnv = it.env.replace(/\*$/, '').replace(/^sideways|^wrap/, '');
      const name = it.env.replace(/\*$/, '');
      if (thm[name] || it.env === 'proof') {
        const b = blockAt.get(it);
        if (it.env !== 'proof' && !thmStar.has(name) && !it.env.endsWith('*')) { const key = thmShared[name] || name; thmCnt[key] = (thmCnt[key] || 0) + 1; it.num = thmCnt[key]; anchor = { type: name, num: it.num, name: thm[name] }; }
        it.thm = it.env === 'proof' ? 'Proof' : thm[name]; if (b) { b.thm = true; b.endItem.thm = it.thm; }
      }
      continue;
    }
    if (it.kind === 'env' && it.end && FLOATS.test(it.env)) { floatEnv = null; continue; }
    if (it.kind === 'caption') { const f = floatEnv || 'figure'; it.float = f; cnt[f] = (cnt[f] || 0) + 1; it.num = cnt[f]; anchor = { type: f, num: it.num, name: f === 'table' ? 'Table' : 'Figure' }; continue; }
    if (it.kind === 'label') { if (anchor) labels.set(it.arg, anchor); continue; }
    if (it.kind === 'footnote') { it.num = ++cnt.footnote; continue; }
    if (it.kind === 'cite') for (const k of it.arg.split(',').map(x => x.trim()).filter(Boolean)) if (!cites.includes(k)) cites.push(k);
  }
  // citation style
  const natbib = /\\usepackage\s*(\[[^\]]*\])?\s*\{[^}]*natbib/.exec(pre), biblatex = /\\usepackage\s*(\[[^\]]*\])?\s*\{biblatex\}/.exec(pre);
  const authorYear = natbib ? !/numbers|super/.test(natbib[1] || '') : biblatex ? /authoryear|apa|chicago|ext-authoryear/.test(biblatex[1] || '') : false;
  return { items, blocks, info: { labels, headings, cites, authorYear, macros: macroDefs(doc), title: titleArgs(doc), bodyStart, cls } };
}
// split the body of align-like maths into rows at top-level \\ (not inside braces or nested environments)
function splitRows(body) {
  const rows = []; let d = 0, env = 0, last = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      if (body.startsWith('\\begin', i)) env++; else if (body.startsWith('\\end', i)) env--;
      else if (body[i + 1] === '\\' && d === 0 && env === 0) {
        rows.push(body.slice(last, i)); let j = i + 2; if (body[j] === '*') j++;
        const o = /^\s*\[[^\]]*\]/.exec(body.slice(j)); if (o) j += o[0].length; last = j; i = j - 1; continue;
      }
      i++; continue;
    }
    if (c === '{') d++; else if (c === '}') d--;
  }
  const tail = body.slice(last); if (tail.trim() || !rows.length) rows.push(tail);
  return rows;
}

// ---------------------------------------------------------------- page breaks
// Estimated from the text when there is no compile yet: lines of text per page and characters per line come
// from the class options, geometry and line spacing; paragraphs, headings, equations and floats take lines.
export function estimateBreaks(doc) {
  const bd = doc.indexOf('\\begin{document}'); if (bd < 0) return [];
  const pre = blankComments(doc.slice(0, bd));
  const opts = (/\\documentclass\s*\[([^\]]*)\]/.exec(pre) || [])[1] || '';
  const fs = +((/(\d+)pt/.exec(opts) || [])[1] || 10);
  const a4 = /a4paper/.test(opts + pre);
  let paperW = a4 ? 595 : 612, paperH = a4 ? 842 : 792;
  let tw = { 10: 345, 11: 360, 12: 390 }[fs] || 345, th = { 10: 528, 11: 527, 12: 529 }[fs] || 528;
  const geo = /\\(?:usepackage\s*\[([^\]]*)\]\s*\{geometry\}|geometry\s*\{([^}]*)\})/.exec(pre);
  if (geo) {
    const g = geo[1] || geo[2] || '', len = (k) => { const m = new RegExp(`(?:^|,)\\s*${k}\\s*=\\s*([\\d.]+)\\s*(in|cm|mm|pt)`).exec(g); return m ? +m[1] * { in: 72, cm: 28.35, mm: 2.835, pt: 1 }[m[2]] : null; };
    const all = len('margin'), h = len('hmargin') ?? all, v = len('vmargin') ?? all;
    const L = len('left') ?? h, R = len('right') ?? h, T = len('top') ?? v, B = len('bottom') ?? v;
    if (L != null || R != null) tw = paperW - (L ?? 72) - (R ?? 72);
    if (T != null || B != null) th = paperH - (T ?? 72) - (B ?? 72) - 30;
    if (len('textwidth')) tw = len('textwidth'); if (len('textheight')) th = len('textheight');
  }
  let spread = 1;
  if (/\\doublespacing/.test(pre)) spread = 1.66; else if (/\\onehalfspacing/.test(pre)) spread = 1.25;
  const ls = /\\linespread\s*\{([\d.]+)\}/.exec(pre); if (ls) spread = +ls[1];
  const P = Math.max(10, Math.floor(th / (fs * 1.2 * spread))), cpl = Math.max(30, tw / (fs * 0.45));
  const lines = doc.slice(bd).split('\n'), first = doc.slice(0, bd).split('\n').length;
  const out = []; let used = 0, page = 1, para = [], inMath = 0, mathRows = 0, inFloat = null, floatLines = 0, listDepth = 0;
  const brk = (ln) => { page++; out.push({ line: ln, page }); };
  const add = (h, ln) => { if (used + h > P && used > 0) { brk(ln); used = Math.min(h, P); } else used += h; };
  const flush = () => {
    if (!para.length) return;
    const total = para.reduce((a, p) => a + p.chars, 0), h = Math.ceil(total / cpl);
    para.length > 0 && used + h > P ? (() => {
      let room = (P - used) * cpl, acc = 0, n = 0;
      for (const p of para) { acc += p.chars; while (acc > room) { brk(p.line); n++; room += P * cpl; } }
      used = Math.max(1, h - (P - used) - (n - 1) * P);
    })() : (used += h);
    para = [];
  };
  const textLen = (t) => t.replace(/(^|[^\\])%.*$/, '$1').replace(/\\(cite[pt]?|citeauthor|parencite|textcite)\*?(\[[^\]]*\])*\{[^}]*\}/g, 'Author (2000)').replace(/\\(eq)?ref\{[^}]*\}/g, '(1)').replace(/\$([^$]*)\$/g, (m, x) => 'x'.repeat(Math.ceil(x.length * 0.45))).replace(/\\[A-Za-z]+\*?/g, '').replace(/[{}]/g, '').trim().length;
  for (let k = 0; k < lines.length; k++) {
    const raw = lines[k], t = raw.replace(/(^|[^\\])%.*$/, '$1').trim(), ln = first + k;
    if (inMath) { if (/\\\\/.test(t)) mathRows++; if (/\\end\{(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath)\*?\}|\\\]|\$\$/.test(t)) { inMath = 0; add(1.4 + 1.3 * Math.max(1, mathRows + (/\S\s*\\\\\s*$/.test(t) ? 0 : 1) - 1) , ln); } continue; }
    if (inFloat) { const r = /\\includegraphics\s*\[([^\]]*)\]/.exec(t); if (r) { const w = /(?:width|height)\s*=\s*([\d.]*)\s*\\(textwidth|linewidth|textheight)/.exec(r[1]); floatLines += w ? Math.max(6, (w[2] === 'textheight' ? P : P * 0.55) * (+w[1] || 1)) : P * 0.4; } else if (/\\includegraphics/.test(t)) floatLines += P * 0.4; if (/\\\\/.test(t) && inFloat === 'table') floatLines += 1.15; if (/\\caption/.test(t)) floatLines += 2; if (new RegExp(`\\\\end\\{${inFloat}\\*?\\}`).test(t)) { add(Math.min(P, floatLines + 1.5), ln); inFloat = null; } continue; }
    if (!t) { flush(); continue; }
    if (/\\(newpage|clearpage|pagebreak|cleardoublepage)\b/.test(t)) { flush(); if (used > 0) { brk(ln + 1); used = 0; } continue; }
    if (/^\\end\{document\}/.test(t)) { flush(); break; }
    const fl = /^\\begin\{(figure|table|sidewaystable|sidewaysfigure)\*?\}/.exec(t); if (fl) { flush(); inFloat = fl[1].replace('sideways', ''); floatLines = 0; continue; }
    if (/^\\begin\{(equation|align|gather|multline|eqnarray|flalign|alignat|displaymath)\*?\}|^\\\[|^\$\$/.test(t)) { flush(); inMath = 1; mathRows = 0; if (/\\end\{|\\\]$|\$\$.*\$\$/.test(t.slice(2))) { inMath = 0; add(2.7, ln); } continue; }
    const hd = /^\\(chapter|section|subsection|subsubsection|paragraph)\*?/.exec(t);
    if (hd) { flush(); const h = { chapter: 8, section: 3.4, subsection: 2.6, subsubsection: 2.1, paragraph: 1 }[hd[1]]; if (used > 0 && (hd[1] === 'chapter' || P - used < h + 2)) { brk(ln); used = h; } else add(h, ln); continue; }
    if (/^\\maketitle/.test(t)) { flush(); add(9, ln); continue; }
    if (/^\\tableofcontents/.test(t)) { flush(); add(5 + (doc.match(/\\(sub)?section\{/g) || []).length * 1.1, ln); continue; }
    if (/^\\(bibliography|printbibliography)\b/.test(t)) { flush(); const n = new Set((doc.match(/\\\w*cite\w*\*?(?:\[[^\]]*\])*\{[^}]*\}/g) || []).flatMap(c => c.replace(/^.*\{|\}$/g, '').split(','))).size; let h = 2.5 + n * 2; while (h > 0) { add(Math.min(h, P), ln); h -= P; } continue; }
    if (/^\\begin\{(itemize|enumerate|description)\}/.test(t)) { flush(); listDepth++; used += 0.5; continue; }
    if (/^\\end\{(itemize|enumerate|description)\}/.test(t)) { flush(); listDepth = Math.max(0, listDepth - 1); used += 0.5; continue; }
    if (/^\\item\b/.test(t)) { flush(); used += 0.25; }
    if (/^\\begin\{abstract\}/.test(t)) { flush(); add(2.5, ln); continue; }
    if (/^\\(begin|end)\{/.test(t) && !textLen(t.replace(/^\\(begin|end)\{[^}]*\}(\[[^\]]*\])?/, ''))) { flush(); continue; }
    const n = textLen(t); if (n) para.push({ line: ln, chars: n * (listDepth ? 1.1 : 1) });
  }
  flush();
  return out;
}


// ---------------------------------------------------------------- fitting long equations (web layout)
// Break a row of maths at top-level operators so each piece fits `avail` px; continuation lines are indented.
const REL = /^(=|<|>|\\(leq|geq|le|ge|neq|ne|approx|equiv|sim|simeq|propto|to|rightarrow|Rightarrow|iff|implies|coloneqq|ll|gg|subset|subseteq|in)(?![A-Za-z]))/;
const BIN = /^([+-]|\\(cdot|times|pm|mp)(?![A-Za-z]))/;
function breakPoints(tex) {
  const pts = []; let d = 0, prev = '';
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i], rest = tex.slice(i);
    if (c === '\\') {
      const w = /^\\([A-Za-z]+|.)/.exec(rest)[0];
      // fixed-size brackets (\Biggl[ … \Biggr]) do not need to close on the same line: break inside them freely
      const sized = /^\\(big|Big|bigg|Bigg)[lrm]?$/.test(w) && /^\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.])/.exec(tex.slice(i + w.length));
      if (sized) { i += w.length + sized[0].length - 1; prev = '('; continue; }
      if (w === '\\left' || w === '\\begin') d++; else if (w === '\\right' || w === '\\end') d--;
      if (d === 0 && (REL.test(rest) || BIN.test(rest)) && prev && !/[=(\[{,&]$|\\(left|right)$/.test(prev)) pts.push({ at: i, rel: REL.test(rest) });
      i += w.length - 1; prev = w; continue;
    }
    if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--;
    else if (d === 0 && (c === '=' || c === '<' || c === '>' || c === '+' || c === '-') && prev && !/[=(\[{,&+\-<>^_]$/.test(prev.trim() ? prev : '=')) pts.push({ at: i, rel: c === '=' || c === '<' || c === '>' });
    if (!/\s/.test(c)) prev = c;
  }
  return pts;
}
// A wide \left[ … \right] (a Lagrangian, say) cannot be broken, so it is turned into fixed-size brackets
// (\Biggl[ … \Biggr], or \Bigl when nothing tall is inside) that may open on one line and close on another.
const TALLISH = /\\(frac|dfrac|cfrac|sum|prod|int|oint|binom|dbinom|begin|over|displaystyle|overbrace|underbrace|overset|underset|lim|max|min|sup|inf)(?![A-Za-z])/;
export function unwrapBig(row, availEx, macros) {
  for (let round = 0; round < 4; round++) {
    const pairs = []; const st = [];
    for (let i = 0, braces = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '{') { braces++; continue; } if (c === '}') { braces--; continue; }
      if (c !== '\\') continue;
      const w = /^\\([A-Za-z]+|.)/.exec(row.slice(i))[0];
      if (w === '\\left' || w === '\\right') {
        const dm = /^\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.])/.exec(row.slice(i + w.length)); if (!dm) { i += w.length - 1; continue; }
        const tok = { at: i, end: i + w.length + dm[0].length, d: dm[1], braces };
        if (w === '\\left') st.push(tok); else { const o = st.pop(); if (o && !st.length && o.braces === 0 && braces === 0) pairs.push([o, tok]); }
        i = tok.end - 1; continue;
      }
      i += w.length - 1;
    }
    // the widest top-level pair, if it is too wide to keep on one line
    let best = null, bw = 0;
    for (const [o, c] of pairs) { const w = widthEx(row.slice(o.end, c.at), macros); if (w > bw) { bw = w; best = [o, c]; } }
    if (!best || bw < availEx * 0.6) return row;
    const [o, c] = best, size = TALLISH.test(row.slice(o.end, c.at)) ? 'Bigg' : 'Big';
    const open = o.d === '.' ? '' : `\\${size}l${o.d} `, close = c.d === '.' ? '' : `\\${size}r${c.d}`;
    row = row.slice(0, o.at) + open + row.slice(o.end, c.at) + close + row.slice(c.end);
  }
  return row;
}
// width in px of a piece of maths (MathJax gives ex; pxPerEx is measured from the full equation)
const widthEx = (tex, macros) => { try { const n = window.MathJax.tex2svg(macros + tex, { display: true }); const w = n.querySelector('svg')?.getAttribute('width') || '0'; return parseFloat(w); } catch { return 0; } };
export function breakRow(row, availEx, macros) {
  const amp = row.indexOf('&') >= 0 && !/\\begin\{/.test(row) ? row.indexOf('&') : -1;
  const all = breakPoints(row), rel = amp >= 0 ? { at: amp } : all.find(p => p.rel);
  // continuation lines line up after the relation, unless the left side is wide: then they start near the margin
  const lhsEx = rel ? widthEx(row.slice(0, rel.at).replace(/&/g, ''), macros) : 0;
  const underRel = rel && lhsEx < availEx * 0.4, offset = underRel ? lhsEx + 3 : 4;
  const pts = all.filter(p => p.at > (rel ? rel.at + 1 : 0));
  if (!pts.length) return null;
  const lines = []; let start = 0, last = null;
  for (let k = 0; k <= pts.length; k++) {
    const end = k < pts.length ? pts[k].at : row.length;
    const room = lines.length ? availEx - offset : availEx;
    if (widthEx(row.slice(start, end).replace(/&/g, ''), macros) > room && last != null && last > start) { lines.push(row.slice(start, last)); start = last; k--; last = null; continue; }
    last = end;
  }
  lines.push(row.slice(start));
  if (lines.length < 2) return null;
  let first = lines[0].replace(/&/g, '');
  if (underRel) { const at = amp >= 0 ? amp : rel.at; first = lines[0].slice(0, at).replace(/&/g, '') + '&' + lines[0].slice(at).replace(/&/g, ''); return [first, ...lines.slice(1).map(l => '&\\quad ' + l.replace(/^\s+/, ''))]; }
  return ['&' + first, ...lines.slice(1).map(l => '&\\qquad ' + l.replace(/^\s+/, ''))];
}

// ---------------------------------------------------------------- the module
export default {
  id: 'visual-mode',
  name: 'Visual view',
  description: 'A Visual switch above the editor draws the document the way it will print: numbered sections and equations, citations, tables, captions and theorems on a page sheet. Click anything to edit its LaTeX; click the title block to edit the title, authors and date. Also marks where pages end, in both views.',
  category: 'Writing',
  activate(ctx) {
    const { StateField, StateEffect, EditorView, Decoration, WidgetType, Compartment } = ctx.cm;
    const h = ctx.h;
    const LAYERS = [
      ['math', 'Equations', 'Draw equations, numbered as in the PDF'],
      ['format', 'Headings, lists and tables', 'Numbered sections, emphasis, lists, tables, captions, theorems and the title block'],
      ['tags', 'Citations and references', 'Author–year or numbered citations, and \\ref as the number it will print'],
      ['preamble', 'Fold the preamble', 'Collapse everything before \\begin{document} into one line'],
      ['page', 'Layout', ''],
    ];
    const ALL = () => Object.fromEntries(LAYERS.map(([k]) => [k, true]));
    // settings: on/off, which layers, page breaks (older versions stored only the layers)
    let layers = ctx.settings.get('layers2', null), on = ctx.settings.get('on', null), breaksOn = ctx.settings.get('breaks', true), layout = ctx.settings.get('layout', 'page');
    if (!layers) { const old = ctx.settings.get('layers', {}); const any = Object.values(old).some(Boolean); layers = any ? old : ALL(); if (on == null) on = any; }
    if (!Object.values(layers).some(Boolean)) layers = ALL();
    on = !!on;
    let ready = !!(window.MathJax && window.MathJax.tex2svg);
    const refresh = StateEffect.define();

    // ---- bibliography from the project's .bib files
    let bibCache = null;
    const bib = () => {
      if (bibCache) return bibCache;
      const m = new Map();
      for (const p of ctx.project.files()) if (/\.bib$/i.test(p)) { const t = ctx.project.read(p); if (typeof t === 'string') for (const [k, v] of parseBib(t)) m.set(k, v); }
      return (bibCache = m);
    };
    ctx.on('change', (p) => { if (/\.bib$/i.test(p || '')) { bibCache = null; poke(); } });
    ctx.on('files', () => { bibCache = null; poke(); });

    // ---- widgets
    const reveal = (view, pos) => (e) => { if (e.button !== 0) return; e.preventDefault(); view.dispatch({ selection: { anchor: pos }, scrollIntoView: false }); view.focus(); };
    const contentWidth = (view) => { const c = view.contentDOM, cs = getComputedStyle(c); return Math.round((c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 20) * 20; };
    class MathWidget extends WidgetType {
      constructor(it, macros, ready, fit, mc) { super(); this.it = it; this.macros = macros; this.ready = ready; this.fit = fit; this.tex = mathTex(it); this.mc = mc || null; this.mcKey = mc ? mc.status + (mc.override || '') : ''; }
      eq(o) { return o.tex === this.tex && o.macros === this.macros && o.ready === this.ready && o.fit === this.fit && o.it.from === this.it.from && o.mcKey === this.mcKey; }
      toDOM(view) {
        const display = this.it.kind === 'dmath';
        const el = h(display ? 'div' : 'span', { class: display ? 'vz-dmath' : 'vz-imath', title: 'Click to edit the LaTeX · Ctrl+E opens the equation editor' });
        if (this.ready) {
          const r = renderMath(this.tex, display, this.macros, display ? contentWidth(view) : 0);
          if (r.html) el.innerHTML = r.html; else el.textContent = this.tex;
          if (r.error) { el.classList.add('vz-err'); el.title = 'This equation has a problem: ' + r.error; }
        } else { el.textContent = (this.it.tex || this.it.body || '').trim(); el.classList.add('vz-wait'); }
        el.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (!e.altKey && clickEdits() && editModel(this.it)) { e.preventDefault(); startEdit(view, this.it); return; }
          reveal(view, display ? this.it.inner : this.it.from + 1)(e);
        });
        if (this.ready && editModel(this.it)) el.title = clickEdits() ? 'Click to edit in place · Alt+click shows the LaTeX' : 'Click to edit the LaTeX · Ctrl+E opens the equation editor';
        if (display && this.fit && this.ready) watchFit(el, () => fitMath(el, this, view));
        if (display && this.mc) el.append(mcChip(view, this.it, this.mc));
        return el;
      }
      destroy(el) { el._ro?.disconnect(); }
      ignoreEvent() { return true; }
      get estimatedHeight() { return this.it.kind === 'dmath' ? 48 : -1; }
    }
    // ---- editing an equation in place (MathLive), instead of jumping to its LaTeX
    const setEdit = StateEffect.define();
    const editField = StateField.define({
      create: () => null,
      update(v, tr) {
        for (const e of tr.effects) if (e.is(setEdit)) return e.value;
        if (v && tr.docChanged) return { ...v, from: tr.changes.mapPos(v.from, -1), bodyFrom: tr.changes.mapPos(v.bodyFrom, -1), bodyTo: tr.changes.mapPos(v.bodyTo, 1) };
        return v;
      },
    });
    const clickEdits = () => { const m = ctx.settings.get('clickEdit', 'auto'); return m === 'auto' ? !!layers.page : m === 'visual'; };
    let session = null;
    class EditWidget extends WidgetType {
      constructor(sess) { super(); this.s = sess; }
      eq(o) { return o.s === this.s; }
      toDOM() { return this.s.el; }
      destroy() {}
      ignoreEvent() { return true; }
      get estimatedHeight() { return this.s.el.offsetHeight || 56; }
    }
    const autoSizeOn = () => { try { return JSON.parse(localStorage.getItem('olve-autosize') || 'false') === true; } catch { return false; } };
    async function startEdit(view, it) {
      let MF;
      try { MF = await loadMathLive(); } catch (e) { ctx.ui.toast('The equation editor could not be loaded: ' + e.message, 'err'); return; }
      if (!MF) return;
      if (session) finishEdit(false);
      const model = editModel(it); if (!model) return;
      const doc = view.state.doc;
      const bodyFrom = it.kind === 'imath' ? it.from + (doc.sliceString(it.from, it.from + 1) === '$' ? 1 : 2) : it.inner;
      const bodyTo = it.kind === 'imath' ? it.to - (doc.sliceString(it.to - 1, it.to) === '$' ? 1 : 2) : it.inner + it.body.length;
      const display = it.kind === 'dmath';
      const mf = document.createElement('math-field');
      mf.smartFence = false; mf.smartSuperscript = false; mf.mathVirtualKeyboardPolicy = 'manual';
      const macros = (() => { try { return mlMacros(parse(doc.toString()).info.macros); } catch { return {}; } })();
      mf.value = model.field;
      const nums = (it.rows || []).map(r => r.num).filter(Boolean);
      const tag = nums.length ? h('span', { class: 'vz-edit-num' }, nums.length > 1 ? `(${nums[0]})–(${nums[nums.length - 1]})` : `(${nums[0]})`) : null;
      const bar = h('span', { class: 'vz-edit-bar' },
        h('button', { title: 'Show the LaTeX of this equation (Alt+click does the same)', onMousedown: (e) => { e.preventDefault(); const pos = view.state.field(editField)?.bodyFrom; finishEdit(true, pos); } }, 'LaTeX'),
        h('button', { class: 'primary', title: 'Done (Esc)', onMousedown: (e) => { e.preventDefault(); finishEdit(true); } }, 'Done'));
      const el = h(display ? 'div' : 'span', { class: display ? 'vz-edit' : 'vz-edit vz-edit-i' }, mf, tag, bar);
      const sess = session = { el, mf, model, view, base: null, orig: model.body };
      sess.widget = new EditWidget(sess);
      mf.addEventListener('input', () => {
        if (session !== sess) return;
        let v = tidyTeX(mf.getValue('latex'));
        if (autoSizeOn() && window.StochaBrackets) v = window.StochaBrackets.autoSize(v);
        const body = sess.base != null && v === sess.base ? sess.orig : model.toBody(v);     // unchanged: the original text, spacing and all
        const ed = view.state.field(editField, false); if (!ed) return;
        if (view.state.sliceDoc(ed.bodyFrom, ed.bodyTo) === body) return;
        view.dispatch({ changes: { from: ed.bodyFrom, to: ed.bodyTo, insert: body }, userEvent: 'input.math' });
        view.requestMeasure();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(true); }
        else if (e.altKey && e.code === 'Slash' && window.StochaBrackets) { e.preventDefault(); e.stopPropagation(); window.StochaBrackets.flipInField(mf); }
      }, true);
      el.addEventListener('focusout', () => setTimeout(() => { if (session === sess && !el.contains(document.activeElement) && document.activeElement !== mf) finishEdit(false); }, 0));
      view.dispatch({ effects: setEdit.of({ from: it.from, bodyFrom, bodyTo }) });
      // the paper's own \newcommand macros (MathLive takes them only once the field is on the page)
      requestAnimationFrame(() => { try { if (Object.keys(macros).length) { mf.macros = { ...mf.macros, ...macros }; mf.value = model.field; } sess.base = tidyTeX(mf.getValue('latex')); mf.focus(); mf.position = mf.lastOffset; } catch {} });
    }
    function finishEdit(focus, pos) {
      const sess = session; if (!sess) return;
      session = null;
      const view = sess.view, ed = view.state.field(editField, false);
      try { view.dispatch({ effects: setEdit.of(null), ...(pos != null ? { selection: { anchor: pos } } : {}) }); } catch {}
      if (focus) view.focus();
    }
    // ---- model check: is this equation part of the model? (a chip on each candidate equation; click to change)
    const MC_LABEL = { in: 'in the model', out: 'not in the model', part: 'partly in the model' };
    function mcFor(state, it) {
      const r = modelState.result; if (!r || !r.envs) return null;
      const m = r.envs.get(ctx.editor.path); if (!m) return null;
      const st = m.get(state.doc.lineAt(it.from).number); if (!st) return null;
      const status = st.in === st.rows ? 'in' : st.in === 0 ? 'out' : 'part', auto = st.auto === st.rows ? 'in' : st.auto === 0 ? 'out' : 'part';
      return { status, auto, override: st.override };
    }
    function mcChip(view, it, mc) {
      const b = h('button', { class: 'vz-mc vz-mc-' + mc.status + (mc.override ? ' vz-mc-set' : ''), title: (mc.override ? 'Set by the comment % ' + (mc.override === 'in' ? 'model' : 'not model') + ' on its \\begin line. ' : 'Chosen automatically. ') + 'Click to ' + (mc.status === 'in' ? 'leave it out of' : 'put it in') + ' the model check.' }, MC_LABEL[mc.status]);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const want = mc.status === 'in' ? 'out' : 'in';
        const line = view.state.doc.lineAt(it.from), text = line.text.replace(MODEL_COMMENT, '').replace(/[ \t]+$/, '');
        const next = want === mc.auto ? text : text + (want === 'in' ? ' % model' : ' % not model');
        if (next !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, userEvent: 'input.model' });
      });
      return b;
    }
    // run fn now and whenever the element's width changes
    function watchFit(el, fn) {
      let w = -1;
      const go = () => { if (!el.isConnected) return; const cw = el.clientWidth; if (cw && cw !== w) { w = cw; fn(); } };
      requestAnimationFrame(go);
      el._ro = new ResizeObserver(() => requestAnimationFrame(go)); el._ro.observe(el);
    }
    // web layout: a display equation wider than the column is broken at + − = (as an aligned block); if a piece
    // cannot be broken (a wide matrix, one long fraction), it is scaled down to fit
    function fitMath(el, wd, view) {
      const avail = el.clientWidth - 4; if (avail < 80) return;
      const draw = (tex) => { const r = renderMath(tex, true, wd.macros, Math.round(avail / 20) * 20); if (r.html) el.innerHTML = r.html; return el.querySelector('svg'); };
      let svg = draw(wd.tex); if (!svg) return;
      const W = svg.getBoundingClientRect().width;
      if (W > avail + 1) {
        const ex = parseFloat(svg.getAttribute('width')) || 0, pxPerEx = ex && !/%/.test(svg.getAttribute('width')) ? W / ex : (parseFloat(svg.style.minWidth) ? W / parseFloat(svg.style.minWidth) : 8);
        const it = wd.it, rows = it.rows || [{ tex: it.body, num: null }];
        const tagW = rows.some(r => r.num) ? 4.5 : 0, availEx = avail / pxPerEx - tagW - 1;
        let changed = false;
        const out = rows.map(r => { if (widthEx(r.tex.replace(/&/g, ''), wd.macros) <= availEx) return [{ tex: r.tex, num: r.num }]; const parts = breakRow(unwrapBig(r.tex.trim(), availEx, wd.macros), availEx, wd.macros) || breakRow(r.tex.trim(), availEx, wd.macros); if (!parts) return [{ tex: r.tex, num: r.num }]; changed = true; return parts.map((t, i) => ({ tex: t, num: i === parts.length - 1 ? r.num : null })); }).flat();
        if (changed) {
          const anyAmp = out.some(r => r.tex.includes('&'));
          const body = out.map(r => (anyAmp && !r.tex.includes('&') ? '&' : '') + r.tex + (r.num ? `\\tag{${r.num}}` : '')).join('\\\\');
          svg = draw(`\\begin{align*}${body}\\end{align*}`) || svg;
        }
        const W2 = svg.getBoundingClientRect().width;
        if (W2 > avail + 1) { const z = Math.max(0.75, avail / W2); const c = el.firstElementChild; if (c) c.style.zoom = z; }
        el.classList.toggle('vz-fitted', true);
      }
      view.requestMeasure();
    }
    function mathTex(it) {
      if (it.kind === 'imath') return it.tex;
      const rows = it.rows || [{ tex: it.body, num: null }];
      const tagged = rows.map(r => r.tex + (r.num ? `\\tag{${r.num}}` : '')).join('\\\\');
      if (!it.env) return rows[0].tex;
      const star = STAR_FOR[it.env];
      if (it.env === 'equation' || it.env === 'displaymath' || it.env === 'math') return rows[0].num ? `\\begin{equation*}${rows[0].tex}\\tag{${rows[0].num}}\\end{equation*}` : rows[0].tex;
      return `\\begin{${star}}${tagged}\\end{${star}}`;
    }
    class Tag extends WidgetType {
      constructor(text, cls, pos, title, key) { super(); this.text = text; this.cls = cls; this.pos = pos; this.title = title || ''; this.key = key || ''; }
      eq(o) { return o.text === this.text && o.cls === this.cls && o.pos === this.pos && o.title === this.title; }
      toDOM(view) { const el = h('span', { class: this.cls, title: this.title }, this.text); if (this.pos != null) el.addEventListener('mousedown', reveal(view, this.pos)); return el; }
      ignoreEvent() { return true; }
    }
    class Html extends WidgetType {
      constructor(key, build, pos, click) { super(); this.key = key; this.build = build; this.pos = pos; this.click = click; }
      eq(o) { return o.key === this.key && o.pos === this.pos; }
      toDOM(view) { const el = this.build(view); el.addEventListener('mousedown', this.click ? (e) => { if (e.button === 0) { e.preventDefault(); this.click(view, el, e); } } : reveal(view, this.pos)); return el; }
      ignoreEvent() { return true; }
    }
    class Empty extends WidgetType { eq() { return true; } toDOM() { return h('div', { class: 'vz-gone' }); } ignoreEvent() { return true; } }
    const empty = new Empty();
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
    // inline LaTeX (table cells, captions in lists) -> HTML with drawn maths
    const inlineHtml = (t, macros) => {
      const parts = []; let last = 0;
      for (const m of t.matchAll(/\$([^$]+)\$|\\\((.+?)\\\)/g)) { parts.push(esc(deTeXKeep(t.slice(last, m.index)))); const r = ready ? renderMath(m[1] || m[2], false, macros) : null; parts.push(r && r.html ? r.html : esc(m[0])); last = m.index + m[0].length; }
      parts.push(esc(deTeXKeep(t.slice(last))));
      return parts.join('').replace(/\u0001b\u0002([\s\S]*?)\u0003/g, '<b>$1</b>').replace(/\u0001i\u0002([\s\S]*?)\u0003/g, '<i>$1</i>');
    };
    const deTeXKeep = (t) => deTeX(true && t.replace(/\\(textbf|mathbf|bfseries)\s*\{([^{}]*)\}/g, '\u0001b\u0002$2\u0003').replace(/\\(textit|emph)\s*\{([^{}]*)\}/g, '\u0001i\u0002$2\u0003').replace(/\\(multirow)\s*\{[^}]*\}\s*\{[^}]*\}\s*\{([^{}]*)\}/g, '$2').replace(/\\(cmidrule|cline)\s*(\([^)]*\))?\s*\{[^}]*\}/g, ''), true);
    function tableEl(it, macros) {
      const aligns = []; const spec = it.spec.replace(/@\{[^}]*\}|!\{[^}]*\}|>\{[^}]*\}|<\{[^}]*\}|\|/g, '').replace(/\*\{(\d+)\}\{([^}]*)\}/g, (m, n, x) => x.repeat(+n));
      for (const m of spec.matchAll(/([lcrXSD])|[pmb]\{[^}]*\}|d\{[^}]*\}/g)) aligns.push(m[1] === 'r' || m[1] === 'S' || m[1] === 'D' || m[0][0] === 'd' ? 'right' : m[1] === 'c' ? 'center' : 'left');
      const table = h('table', { class: 'vz-table' });
      let pending = '';
      for (let raw of splitRows(it.body)) {
        let rules = '';
        raw = raw.replace(/\\(toprule|midrule|bottomrule|hline|cmidrule\s*(\([^)]*\))?\s*\{[^}]*\}|cline\s*\{[^}]*\}|addlinespace(\[[^\]]*\])?)/g, (m, r) => { rules += ' ' + (r.startsWith('cmidrule') || r.startsWith('cline') ? 'cmid' : r.startsWith('addlinespace') ? 'space' : r); return ''; });
        if (!raw.trim()) { pending += rules; continue; }
        const tr = h('tr', { class: (pending + rules).trim().split(/\s+/).filter(Boolean).map(r => 'r-' + r).join(' ') }); pending = '';
        let col = 0;
        for (const cell of splitCells(raw)) {
          const mc = /^\s*\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/.exec(cell);
          const td = h('td'); td.innerHTML = inlineHtml(mc ? mc[3] : cell.trim(), macros);
          if (mc) { td.colSpan = +mc[1]; td.style.textAlign = /r/.test(mc[2]) ? 'right' : /c/.test(mc[2]) ? 'center' : 'left'; col += +mc[1]; }
          else { td.style.textAlign = aligns[col] || 'left'; col++; }
          tr.append(td);
        }
        table.append(tr);
      }
      if (pending.trim() && table.lastChild) table.lastChild.classList.add(...pending.trim().split(/\s+/).map(r => 'after-' + r));
      const wrapEl = h('div', { class: 'vz-tablewrap', title: 'Click to edit the table' }, table);
      if (layers.page && layout === 'web') watchFit(wrapEl, () => { table.style.zoom = ''; const a = wrapEl.clientWidth - 4, w = table.getBoundingClientRect().width; if (w > a) table.style.zoom = Math.max(0.5, a / w); });
      return wrapEl;
    }
    function splitCells(row) {
      const out = []; let d = 0, last = 0;
      for (let i = 0; i < row.length; i++) { const c = row[i]; if (c === '\\') { i++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (c === '&' && d === 0) { out.push(row.slice(last, i)); last = i + 1; } }
      out.push(row.slice(last)); return out;
    }
    const citeText = (it, info) => {
      const keys = it.arg.split(',').map(x => x.trim()).filter(Boolean), B = bib();
      const [pre, post] = it.opts.length === 2 ? it.opts : ['', it.opts[0] || ''];
      const missing = keys.filter(k => !B.has(k));
      const one = (k, mode) => { const e = B.get(k); if (!e) return k + '?'; const a = authorsShort(e) || k, y = e.year || 'n.d.'; return mode === 'auth' ? a : mode === 'year' ? y : mode === 'text' ? `${a} (${y})` : `${a}, ${y}`; };
      const c = it.cmd.toLowerCase();
      let text;
      if (!info.authorYear && !/author|year/.test(c)) text = `[${keys.map(k => B.has(k) ? info.cites.indexOf(k) + 1 : k + '?').join(', ')}${post ? ', ' + deTeX(post) : ''}]`;
      else if (/citeauthor/.test(c)) text = keys.map(k => one(k, 'auth')).join('; ');
      else if (/citeyearpar/.test(c)) text = '(' + keys.map(k => one(k, 'year')).join('; ') + ')';
      else if (/citeyear/.test(c)) text = keys.map(k => one(k, 'year')).join('; ');
      else if (/^(citet|textcite|cite|citealt)$/.test(c) && !(c === 'cite' && !info.authorYear)) text = keys.map(k => one(k, 'text')).join('; ') + (post ? ` [${deTeX(post)}]` : '');
      else { const inner = (pre ? deTeX(pre) + ' ' : '') + keys.map(k => one(k, 'par')).join('; ') + (post ? ', ' + deTeX(post) : ''); text = /alp/.test(c) ? inner : '(' + inner + ')'; }
      return { text, missing };
    };
    const refText = (it, info) => {
      const keys = it.arg.split(',').map(x => x.trim());
      const parts = keys.map(k => { const l = info.labels.get(k); return l ? l : null; });
      const num = (l) => l ? (l.num ?? '??') : '??';
      const c = it.cmd;
      if (c === 'eqref') return { text: parts.map(l => '(' + num(l) + ')').join(', '), ok: parts.every(Boolean) };
      if (c === 'pageref') return { text: 'p. ?', ok: true };
      if (c === 'nameref') return { text: parts.map(l => l ? l.name + ' ' + num(l) : '??').join(', '), ok: parts.every(Boolean) };
      if (/^(cref|Cref|autoref|vref)$/.test(c)) return { text: parts.map(l => { if (!l) return '??'; const n = l.type === 'equation' ? (c === 'autoref' ? 'Equation ' + num(l) : (c === 'Cref' ? 'Equation (' : 'eq. (') + num(l) + ')') : (c === 'cref' ? l.name.toLowerCase() : l.name) + ' ' + num(l); return n; }).join(', '), ok: parts.every(Boolean) };
      return { text: parts.map(num).join(', '), ok: parts.every(Boolean) };
    };

    // ---- title block: click to edit title, authors and date in place
    let pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', popOff, true); document.removeEventListener('keydown', popKey, true); } }
    const popOff = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
    const popKey = (e) => { if (e.key === 'Escape' && pop) { e.stopPropagation(); closePop(); ctx.editor.focus(); } };
    function editTitle(view, anchor) {
      closePop();
      const args = titleArgs(view.state.doc.toString());
      const field = (key, label, multi) => {
        const val = args[key] ? args[key].text.trim() : (key === 'date' ? '' : '');
        const input = h(multi ? 'textarea' : 'input', { class: 'grow', rows: multi ? 2 : null, spellcheck: true });
        input.value = val;
        input.addEventListener('input', () => {
          const a = titleArgs(view.state.doc.toString())[key];
          if (a) view.dispatch({ changes: { from: a.from, to: a.to, insert: input.value }, userEvent: 'input.title' });
          else { const doc = view.state.doc.toString(), at = Math.max(0, doc.indexOf('\\begin{document}')); const t = titleArgs(doc); const after = (t.date || t.author || t.title); const pos = after ? doc.indexOf('\n', after.to) + 1 || after.to + 1 : at; view.dispatch({ changes: { from: pos, insert: `\\${key}{${input.value}}\n` } }); }
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multi) { e.preventDefault(); closePop(); view.focus(); } });
        return h('label', { class: 'vz-field' }, h('span', {}, label), input);
      };
      const goSrc = () => { const a = titleArgs(view.state.doc.toString()); const t = a.title || a.author; closePop(); if (t) { view.dispatch({ selection: { anchor: t.from }, effects: EditorView.scrollIntoView(t.from, { y: 'center' }) }); view.focus(); } };
      pop = h('div', { class: 'vz-pop', role: 'dialog', 'aria-label': 'Title, authors and date' },
        h('div', { class: 'vz-pop-head' }, 'Title block'),
        field('title', 'Title', true), field('author', 'Authors (separate with \\and)'), field('date', 'Date (\\today for today, empty for none)'),
        h('div', { class: 'vz-pop-foot' }, h('button', { class: 'ghost', onClick: goSrc }, 'Show the LaTeX'), h('button', { class: 'primary', onClick: () => { closePop(); view.focus(); } }, 'Done')));
      document.body.append(pop);
      const r = anchor.getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pop.offsetWidth / 2, innerWidth - pop.offsetWidth - 8)) + 'px';
      pop.style.top = Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8) + 'px';
      setTimeout(() => { document.addEventListener('mousedown', popOff, true); document.addEventListener('keydown', popKey, true); pop?.querySelector('textarea,input')?.focus(); }, 0);
    }

    // ---- decorations
    function build(state, P) {
      const { items, blocks, info } = P;
      const fitOn = layers.page && layout === 'web';
      const ranges = [], sel = state.selection.ranges, L = layers, doc = state.doc, editing = state.field(editField, false);
      const zones = blocks.filter(b => FLOATS.test(b.env) || TABULAR.test(b.env)).map(b => ({ from: b.from, to: b.to }));
      const near = (it) => sel.some(r => r.from <= it.to && r.to >= it.from && !(it.kind === 'preamble' && r.to === 0));
      const inZone = (it) => zones.some(z => it.from >= z.from && it.to <= z.to && sel.some(r => r.from <= z.to && r.to >= z.from));
      const add = (from, to, deco) => { if (to > from || deco.point) ranges.push(deco.range(from, to)); };
      const invisible = [];
      const hideRange = (from, to) => { if (to > from) { add(from, to, Decoration.replace({})); invisible.push([from, to]); } };
      const layerOf = { preamble: 'preamble', dmath: 'math', imath: 'math', cite: 'tags', ref: 'tags', label: 'tags', comment: 'page' };
      const covered = [];
      const inCovered = (it) => covered.some(c => it.from >= c.from && it.to <= c.to && !(it.from === c.from && it.to === c.to));
      for (const it of items) {
        if (!L[layerOf[it.kind] || 'format']) continue;
        if (inCovered(it)) continue;
        if (editing && session && it.from === editing.from && (it.kind === 'dmath' || it.kind === 'imath')) {
          const from = it.kind === 'dmath' && it.block ? doc.lineAt(it.from).from : it.from, to = it.kind === 'dmath' && it.block ? doc.lineAt(it.to).to : it.to;
          ranges.push(Decoration.replace({ block: it.kind === 'dmath' && it.block, widget: session.widget }).range(from, to)); covered.push({ from: it.from, to: it.to }); continue;
        }
        if (near(it) || inZone(it)) { if (it.kind === 'dmath' || it.kind === 'imath') add(it.from, it.to, Decoration.mark({ class: 'vz-src-math' })); continue; }
        switch (it.kind) {
          case 'preamble': ranges.push(Decoration.replace({ block: true, widget: new Html('pre' + it.lines, () => h('div', { class: 'vz-preamble', title: 'Click to show the preamble' }, `Preamble · ${it.lines} lines of packages and settings`), 1) }).range(it.from, it.to)); break;
          case 'comment': hideRange(it.from, it.to); break;
          case 'dmath': {
            const from = it.block ? doc.lineAt(it.from).from : it.from, to = it.block ? doc.lineAt(it.to).to : it.to;
            ranges.push(Decoration.replace({ block: it.block, widget: new MathWidget(it, info.macros, ready, fitOn, mcFor(state, it)) }).range(from, to)); covered.push({ from: it.from, to: it.to }); break;
          }
          case 'imath': ranges.push(Decoration.replace({ widget: new MathWidget(it, info.macros, ready) }).range(it.from, it.to)); break;
          case 'heading': {
            const num = it.num ? it.num + (it.level === 0 ? '' : '') : '';
            add(it.from, it.open + 1, Decoration.replace(num ? { widget: new Tag(it.level === 0 ? 'Chapter ' + num : num, 'vz-secnum', it.from + 1) } : {}));
            add(it.open + 1, it.close, Decoration.mark({ class: 'vz-h vz-h' + Math.max(0, it.level) }));
            hideRange(it.close, it.close + 1); break;
          }
          case 'caption': {
            add(it.from, it.open + 1, Decoration.replace({ widget: new Tag((it.float === 'table' ? 'Table ' : 'Figure ') + it.num + ': ', 'vz-capnum', it.from + 1) }));
            add(it.open + 1, it.close, Decoration.mark({ class: 'vz-cap' })); hideRange(it.close, it.close + 1); break;
          }
          case 'format': hideRange(it.from, it.open + 1); if (it.cls) add(it.open + 1, it.close, Decoration.mark({ class: it.cls, attributes: it.url ? { title: it.url } : undefined })); hideRange(it.close, it.close + 1); break;
          case 'link': ranges.push(Decoration.replace({ widget: new Tag(it.text, 'vz-link', it.from + 1, it.url) }).range(it.from, it.to)); break;
          case 'footnote': ranges.push(Decoration.replace({ widget: new Tag(String(it.num), 'vz-fn', it.from + 1, 'Footnote ' + it.num + ': ' + deTeX(it.text)) }).range(it.from, it.to)); break;
          case 'cite': { const c = citeText(it, info); ranges.push(Decoration.replace({ widget: new Tag(c.text, 'vz-cite' + (c.missing.length ? ' vz-missing' : ''), it.from + 1, c.missing.length ? 'Not found in your .bib files: ' + c.missing.join(', ') : '\\' + it.cmd + '{' + it.arg + '}') }).range(it.from, it.to)); break; }
          case 'ref': { const r = refText(it, info); ranges.push(Decoration.replace({ widget: new Tag(r.text, 'vz-ref' + (r.ok ? '' : ' vz-missing'), it.from + 1, r.ok ? '\\' + it.cmd + '{' + it.arg + '}' : 'No \\label{' + it.arg + '} in this file') }).range(it.from, it.to)); break; }
          case 'label': if (L.page) hideRange(it.from, it.to); else ranges.push(Decoration.replace({ widget: new Tag(it.arg, 'vz-label', it.from + 1, '\\label{' + it.arg + '}') }).range(it.from, it.to)); break;
          case 'bullet': ranges.push(Decoration.replace({ widget: new Tag(it.mark, it.desc ? 'vz-desc' : 'vz-bullet', it.from + 1) }).range(it.from, it.to)); break;
          case 'env': {
            const name = it.env.replace(/\*$/, '');
            if (it.thm) {
              if (!it.end) ranges.push(Decoration.replace({ widget: new Tag(it.thm + (it.num ? ' ' + it.num : '') + (it.opt ? ' (' + deTeX(it.opt) + ')' : '') + '.', it.thm === 'Proof' ? 'vz-proofhead' : 'vz-thmhead', it.from + 1) }).range(it.from, it.to));
              else if (it.env === 'proof') ranges.push(Decoration.replace({ widget: new Tag('∎', 'vz-qed', it.from + 1) }).range(it.from, it.to));
              else hideRange(it.from, it.to);
            } else if (name === 'abstract' && !it.end) ranges.push(Decoration.replace({ widget: new Tag('Abstract', 'vz-abs', it.from + 1) }).range(it.from, it.to));
            else if (L.page || it.end || /^(itemize|enumerate|description|center|flushleft|flushright|minipage|subfigure|quote|quotation|abstract|figure|table|threeparttable|tablenotes|landscape|singlespace|spacing)$/.test(name)) hideRange(it.from, it.to);
            else ranges.push(Decoration.replace({ widget: new Tag(name, 'vz-envtag', it.from + 1, '\\begin{' + it.env + '}') }).range(it.from, it.to));
            break;
          }
          case 'hide': case 'newpage': hideRange(it.from, it.to); break;
          case 'char': ranges.push(Decoration.replace({ widget: new Tag(it.text, 'vz-char', it.from) }).range(it.from, it.to)); break;
          case 'appendix': ranges.push(Decoration.replace({ widget: new Tag('Appendix', 'vz-appendix', it.from + 1) }).range(it.from, it.to)); break;
          case 'title': {
            const t = info.title, val = (k) => t[k] ? deTeX(t[k].text) : '', key = JSON.stringify([val('title'), val('author'), t.date ? val('date') : null]);
            ranges.push(Decoration.replace({ widget: new Html(key, () => h('span', { class: 'vz-title', title: 'Click to edit the title, authors and date' },
              h('span', { class: 'vz-title-t' }, val('title') || 'Untitled'), t.author ? h('span', { class: 'vz-title-a' }, ...t.author.text.split(/\\and\b/).map(a => h('span', {}, deTeX(a)))) : null,
              t.date && !t.date.text.trim() ? null : h('span', { class: 'vz-title-d' }, t.date ? val('date') : today())), it.from + 1, (view, el) => editTitle(view, el)) }).range(it.from, it.to)); break;
          }
          case 'toc': {
            const key = JSON.stringify(info.headings);
            ranges.push(Decoration.replace({ widget: new Html(key, () => h('span', { class: 'vz-toc' }, h('span', { class: 'vz-toc-h' }, 'Contents'), ...info.headings.filter(x => x.level >= 0 && x.level <= 2).map(x => h('span', { class: 'vz-toc-l l' + x.level }, h('span', {}, x.num ? x.num + '  ' : ''), x.text))), it.from + 1) }).range(it.from, it.to)); break;
          }
          case 'bib': {
            const B = bib(), keys = info.authorYear ? [...info.cites].sort((a, b) => (B.get(a)?.names[0] || a).localeCompare(B.get(b)?.names[0] || b)) : info.cites;
            const key = 'bib' + keys.join() + B.size + info.authorYear;
            ranges.push(Decoration.replace({ widget: new Html(key, () => h('span', { class: 'vz-bib' }, h('span', { class: 'vz-bib-h' }, 'References'),
              ...(keys.length ? keys.map((k, i) => { const e = B.get(k); return h('span', { class: 'vz-bib-e' + (e ? '' : ' vz-missing') }, info.authorYear ? '' : `[${i + 1}] `, e ? `${e.full || k} (${e.year || 'n.d.'}). ${e.title}${e.where ? '. ' + e.where : ''}.` : k + ' — not found in your .bib files'); }) : [h('span', { class: 'vz-bib-e muted' }, 'Nothing cited yet.')])), it.from + 1) }).range(it.from, it.to)); break;
          }
          case 'image': {
            const url = imageUrl(it.file);
            ranges.push(Decoration.replace({ widget: new Html('img' + it.file + url, () => url ? h('span', { class: 'vz-img' }, h('img', { src: url, alt: it.file })) : h('span', { class: 'vz-imgph', title: 'PDF and EPS images are shown in the PDF only' }, it.file), it.from + 1) }).range(it.from, it.to)); break;
          }
          case 'table': {
            const from = it.block ? doc.lineAt(it.from).from : it.from, to = it.block ? doc.lineAt(it.to).to : it.to;
            ranges.push(Decoration.replace({ block: it.block, widget: new Html('tab' + it.spec + it.body + ready + fitOn, () => tableEl(it, info.macros), it.from + 1) }).range(from, to)); covered.push({ from: it.from, to: it.to }); break;
          }
        }
      }
      // line styles for environments
      if (L.format) for (const b of blocks) {
        const name = b.env.replace(/\*$/, '');
        const cls = LIST_ENVS.test(name) ? 'vz-li vz-li' + Math.min(3, b.depth + 1) : name === 'abstract' ? 'vz-absline' : /^(quote|quotation)$/.test(name) ? 'vz-quote' : /^(center)$/.test(name) || FLOATS.test(b.env) ? 'vz-center' : b.thm ? (name === 'proof' ? 'vz-proof' : 'vz-thm') : null;
        if (!cls) continue;
        const a = doc.lineAt(b.from).number, z = doc.lineAt(b.to).number;
        for (let n = a; n <= z; n++) ranges.push(Decoration.line({ class: cls }).range(doc.line(n).from));
      }
      // on the page sheet, lines of one paragraph flow together as they will in the PDF (not where the cursor is)
      if (L.page && L.format) {
        const BLOCK = /^\s*(%|\\(begin|end|section|subsection|subsubsection|paragraph|chapter|part|caption|maketitle|tableofcontents|bibliography|printbibliography|bibliographystyle|includegraphics|centering|noindent|newpage|clearpage|appendix|vspace|bigskip|medskip|smallskip|item|label|title|author|date|hline|toprule|midrule|bottomrule|\[|\]|par\b)|\$\$)/;
        const THM_LINE = new RegExp('^\\s*\\\\begin\\{(proof|' + Object.keys(THM_DEFAULT).join('|') + ')\\*?\\}(\\[[^\\]]*\\])?(\\s*\\\\label\\{[^}]*\\})?\\s*$');
        const blocked = (pos) => covered.some(c => pos >= c.from && pos <= c.to);
        const first = doc.lineAt(Math.min(doc.length, info.bodyStart)).number + 1;
        for (let n = first; n < doc.lines; n++) {
          const a = doc.line(n), b = doc.line(n + 1);
          const thmA = THM_LINE.test(a.text), qedB = /^\s*\\end\{proof\}\s*$/.test(b.text);
          if (!a.text.trim() || !b.text.trim() || (BLOCK.test(b.text) && !qedB) || /(\\\\|%)\s*$/.test(a.text) || (BLOCK.test(a.text) && !/^\s*\\item\b/.test(a.text) && !thmA)) continue;
          if (blocked(a.to) || sel.some(r => r.from <= b.to && r.to >= a.from)) continue;
          ranges.push(Decoration.replace({ widget: new Tag(' ', 'vz-char', null) }).range(a.to, b.from + (b.text.length - b.text.trimStart().length)));
        }
      }
      // on the page sheet, lines that hold nothing visible (only labels, layout commands, comments) take no room
      if (L.page && invisible.length) {
        invisible.sort((x, y) => x[0] - y[0]);
        const seen = new Set();
        for (const [f] of invisible) {
          const line = doc.lineAt(f); if (seen.has(line.number)) continue; seen.add(line.number);
          if (sel.some(r => r.from <= line.to && r.to >= line.from)) continue;
          let pos = line.from, ok = true;
          for (const [a, b] of invisible) { if (b <= line.from || a >= line.to) continue; if (doc.sliceString(pos, Math.max(pos, a)).trim()) { ok = false; break; } pos = Math.max(pos, b); }
          if (ok && doc.sliceString(pos, line.to).trim()) ok = false;
          if (!ok) continue;
          for (let k = ranges.length - 1; k >= 0; k--) { const r = ranges[k]; if (r.from >= line.from && r.to <= line.to && !(r.value.spec && r.value.spec.class && r.from === r.to)) ranges.splice(k, 1); }
          ranges.push(Decoration.replace({ block: true, widget: empty }).range(line.from, line.to));
        }
      }
      try { return Decoration.set(ranges, true); }
      catch (e) { console.warn('visual view', e); return Decoration.none; }
    }
    const read = (state) => parse(state.doc.toString());
    const field = StateField.define({
      create(state) { const p = read(state); return { p, deco: build(state, p) }; },
      update(v, tr) {
        const again = tr.effects.some(e => e.is(refresh) || e.is(setEdit));
        if (!tr.docChanged && !tr.selection && !again) return v;
        const p = tr.docChanged ? read(tr.state) : v.p;
        return { p, deco: build(tr.state, p) };
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });

    // ---- page breaks (both views)
    const setBreaks = StateEffect.define();
    class Break extends WidgetType {
      constructor(page, measured) { super(); this.page = page; this.measured = measured; }
      eq(o) { return o.page === this.page && o.measured === this.measured; }
      toDOM() { return h('div', { class: 'tb-pb' + (this.measured ? '' : ' est'), title: this.measured ? `Page ${this.page} starts here (from the last compile)` : `Page ${this.page} starts about here (an estimate until the document compiles)`, 'aria-label': 'Page ' + this.page }, h('span', {}, (this.measured ? '' : '≈ ') + 'Page ' + this.page)); }
      ignoreEvent() { return true; }
      get estimatedHeight() { return 22; }
    }
    const breakDeco = (state, list) => { const r = []; for (const b of list) if (b.pos <= state.doc.length) r.push(Decoration.widget({ block: true, side: -1, widget: new Break(b.page, b.measured) }).range(state.doc.lineAt(b.pos).from)); try { return Decoration.set(r, true); } catch { return Decoration.none; } };
    const fromLines = (state, list, measured) => list.filter(b => b.line >= 1 && b.line <= state.doc.lines).map(b => ({ pos: state.doc.line(b.line).from, page: b.page, measured }));
    const isMain = () => ctx.editor.path && ctx.editor.path === ctx.project.mainFile;
    const estimate = (state) => isMain() ? fromLines(state, estimateBreaks(state.doc.toString()), false) : [];
    const breaksField = StateField.define({
      create(state) { const list = estimate(state); return { list, measured: false, deco: breakDeco(state, list) }; },
      update(v, tr) {
        for (const e of tr.effects) if (e.is(setBreaks)) { const list = e.value.measured ? fromLines(tr.state, e.value.lines, true) : estimate(tr.state); return { list, measured: e.value.measured, deco: breakDeco(tr.state, list) }; }
        if (!tr.docChanged) return v;
        // small edits keep the measured breaks (moved with the text) until the next compile; a wholesale replacement estimates again
        let changed = 0; tr.changes.iterChangedRanges((a, b) => { changed += b - a; });
        if (v.measured && changed < tr.startState.doc.length / 2) { const list = v.list.map(b => ({ ...b, pos: tr.changes.mapPos(b.pos, 1) })); return { ...v, list, deco: v.deco.map(tr.changes) }; }
        const list = estimate(tr.state); return { list, measured: false, deco: breakDeco(tr.state, list) };
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });
    const measure = () => {
      const path = ctx.editor.path; if (!path || !breaksOn) return;
      const r = ctx.compile.pageStarts(path), len = view().state.doc.length;
      const fresh = r && r.size != null && Math.abs(r.size - len) <= Math.max(200, len * 0.03);     // compiled from (nearly) this text
      try { view().dispatch({ effects: setBreaks.of(fresh ? { measured: true, lines: r.lines } : { measured: false }) }); } catch {}
    };

    // ---- switching
    // the extensions are registered with the editor itself, so they survive a file being reopened or replaced
    let offExt = null, extKey = '';
    const view = () => ctx.editor.view;
    let sw, panel = null;
    const apply = () => {
      const active = on && Object.values(layers).some(Boolean);
      const key = (active ? 'v' + layout + JSON.stringify(layers) : '') + (breaksOn ? 'b' : '');
      if (key !== extKey) {
        extKey = key; offExt && offExt();
        offExt = ctx.editor.addExtension([active ? [editField, field, EditorView.editorAttributes.of({ class: 'cm-typeset' + (layers.page ? ' cm-page' + (layout === 'web' ? ' cm-web' : '') : '') })] : [], breaksOn ? breaksField : []]);
      } else poke();
      if (breaksOn) measure();
      sw.setAttribute('aria-checked', String(on)); sw.classList.toggle('on', on);
      if (panel) renderPanel();
      if (active && layers.math && !ready) loadMathJax().then(() => { ready = true; poke(); }).catch((e) => ctx.ui.toast('Equations cannot be drawn: ' + e.message, 'err'));
    };
    const poke = () => { try { view().dispatch({ effects: refresh.of(null) }); } catch {} };
    const save = () => { ctx.settings.set('layout', layout); ctx.settings.set('on', on); ctx.settings.set('layers2', layers); ctx.settings.set('breaks', breaksOn); };
    const setOn = (v) => { on = v; if (on && !Object.values(layers).some(Boolean)) layers = ALL(); save(); apply(); };
    const setLayout = (k) => { if (k === 'inline') layers = { ...layers, page: false }; else { layers = { ...layers, page: true }; layout = k; } on = true; save(); apply(); };
    const setLayer = (k, v) => { layers = { ...layers, [k]: v }; if (v) on = true; if (!Object.values(layers).some(Boolean)) on = false; save(); apply(); };
    const swEl = (checked, label, hint, onChange) => {
      const b = h('button', { class: 'vz-row', role: 'switch', 'aria-checked': String(checked), title: hint || '', onClick: () => onChange(!checked) }, h('span', { class: 'vz-row-l' }, h('span', {}, label), hint ? h('small', {}, hint) : null), h('span', { class: 'vz-track' }, h('span', { class: 'vz-knob' })));
      return b;
    };
    function renderPanel() {
      panel.replaceChildren(
        swEl(on, 'Visual view', 'Draw the document the way it will print', setOn),
        h('div', { class: 'vz-sep' }, 'Layout'),
        h('div', { class: 'vz-seg', role: 'radiogroup', 'aria-label': 'Layout' }, ...[['page', 'Page', 'As printed, page by page'], ['web', 'Web', 'Fits the window, no pages; long equations wrap'], ['inline', 'In the code', 'Drawn inside the source, with line numbers']].map(([k, label, hint]) => {
          const cur = !layers.page ? 'inline' : layout;
          return h('button', { role: 'radio', 'aria-checked': String(cur === k), class: cur === k ? 'on' : '', title: hint, onClick: () => setLayout(k) }, h('span', {}, label), h('small', {}, hint));
        })),
        h('div', { class: 'vz-sep' }, 'What is drawn'),
        ...LAYERS.filter(([k]) => k !== 'page').map(([k, label, hint]) => swEl(!!layers[k], label, hint, (v) => setLayer(k, v))),
        swEl(clickEdits(), 'Edit equations in place', 'Click an equation to edit it as drawn; Alt+click shows its LaTeX. Off: clicking shows the LaTeX', (v) => { ctx.settings.set('clickEdit', v ? 'visual' : 'latex'); svgCache.clear(); renderPanel(); poke(); }),
        h('div', { class: 'vz-sep' }, 'In both views'),
        swEl(breaksOn, 'Page breaks', 'Mark where each page starts; exact after a compile, estimated before', (v) => { breaksOn = v; save(); apply(); }),
      );
    }
    const panelOff = (e) => { if (panel && !panel.contains(e.target) && !wrap.contains(e.target)) closePanel(); };
    const panelKey = (e) => { if (e.key === 'Escape' && panel) { e.stopPropagation(); closePanel(); } };
    function closePanel() { panel?.remove(); panel = null; more.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', panelOff, true); document.removeEventListener('keydown', panelKey, true); }
    function openPanel() {
      if (panel) return closePanel();
      panel = h('div', { class: 'vz-panel', role: 'group', 'aria-label': 'Visual view options' }); renderPanel(); document.body.append(panel);
      const r = wrap.getBoundingClientRect(); panel.style.left = Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8)) + 'px'; panel.style.top = r.bottom + 4 + 'px';
      more.setAttribute('aria-expanded', 'true');
      setTimeout(() => { document.addEventListener('mousedown', panelOff, true); document.addEventListener('keydown', panelKey, true); }, 0);
    }
    sw = h('button', { class: 'vz-switch', role: 'switch', 'aria-checked': 'false', title: 'Visual view on or off (Ctrl+Shift+V)', onClick: () => setOn(!on) }, h('span', { class: 'vz-track' }, h('span', { class: 'vz-knob' })), h('span', { class: 'lbl' }, 'Visual'));
    const more = h('button', { class: 'ghost vz-more', title: 'Choose what the visual view draws', 'aria-haspopup': 'true', 'aria-expanded': 'false', onClick: openPanel }, ctx.ui.icon('chevron', 14));
    const wrap = h('span', { class: 'vz-wrap' }, sw, more);
    ctx.ui.addEditorButton(wrap);
    ctx.ui.addCommand({ id: 'visual.toggle', name: 'Visual view: on or off', key: 'Mod+Shift+V', run: () => setOn(!on) });
    ctx.ui.addCommand({ id: 'visual.page', name: 'Visual view: page layout', run: () => setLayout('page') });
    ctx.ui.addCommand({ id: 'visual.web', name: 'Visual view: web layout (long equations wrap)', run: () => setLayout('web') });
    ctx.ui.addCommand({ id: 'visual.breaks', name: 'Page breaks: show or hide', run: () => { breaksOn = !breaksOn; save(); apply(); } });
    ctx.editor.addKeymap([{ key: 'Mod-Shift-v', run: () => (setOn(!on), true) }]);
    ctx.on('open', () => setTimeout(measure, 0));
    ctx.on('compile', () => setTimeout(measure, 0));
    apply();
    const offMc = modelState.on(() => poke());
    ctx.onDispose(() => { offMc(); finishEdit(false); closePanel(); closePop();  urls.forEach(u => URL.revokeObjectURL(u)); });

    const css = h('style', {}, `
.vz-wrap { display: inline-flex; align-items: center; gap: 0; margin-left: 4px; }
.vz-switch { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--paper); border-radius: 999px 0 0 999px; padding: 3px 10px 3px 6px; font: 500 13px var(--ui); color: var(--muted); height: 28px; }
.vz-switch:hover { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.vz-switch.on { color: var(--accent); background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.vz-more { border: 1px solid var(--line) !important; border-left: 0 !important; border-radius: 0 999px 999px 0 !important; height: 28px; padding: 0 8px !important; }
.vz-switch.on + .vz-more { border-color: color-mix(in srgb, var(--accent) 45%, transparent) !important; background: var(--accent-soft); color: var(--accent); }
.vz-track { position: relative; width: 26px; height: 15px; border-radius: 999px; background: color-mix(in srgb, var(--muted) 35%, transparent); flex: none; transition: background .15s; }
.vz-knob { position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
[aria-checked="true"] > .vz-track, .vz-switch.on .vz-track { background: var(--accent); }
[aria-checked="true"] > .vz-track .vz-knob, .vz-switch.on .vz-knob { transform: translateX(11px); }
@media (prefers-reduced-motion: reduce) { .vz-track, .vz-knob { transition: none; } }
.vz-panel { position: fixed; z-index: 60; width: 340px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 36px rgba(15,23,32,.18); padding: 6px; }
.vz-row { white-space: normal; display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 7px; color: var(--ink); }
.vz-row:hover { background: var(--panel-2); } .vz-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.vz-row-l { display: flex; flex-direction: column; gap: 1px; font: 500 13px var(--ui); min-width: 0; flex: 1; } .vz-row-l small { font: 12px var(--ui); color: var(--muted); }
.vz-panel > .vz-row:first-child { padding: 10px; } .vz-panel > .vz-row:first-child .vz-row-l > span { font-weight: 600; }
.vz-sep { font: 600 11.5px var(--ui); color: var(--faint); padding: 10px 10px 4px; border-top: 1px solid var(--line); margin-top: 4px; }
.vz-pop { position: fixed; z-index: 70; width: min(440px, calc(100vw - 16px)); background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 36px rgba(15,23,32,.2); padding: 12px 14px; display: grid; gap: 10px; }
.vz-pop-head { font: 600 13px var(--ui); }
.vz-field { display: grid; gap: 4px; font: 12px var(--ui); color: var(--muted); } .vz-field input, .vz-field textarea { font: 14px var(--mono); color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; resize: vertical; }
.vz-field input:focus, .vz-field textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); border-color: var(--accent); }
.vz-pop-foot { display: flex; justify-content: space-between; }

/* page breaks */
.tb-pb { position: relative; height: 22px; display: flex; align-items: center; justify-content: flex-end; pointer-events: none; }
.tb-pb::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed color-mix(in srgb, var(--accent) 55%, transparent); }
.tb-pb.est::before { border-top-color: color-mix(in srgb, var(--muted) 45%, transparent); }
.tb-pb span { position: relative; background: var(--paper); color: var(--accent); font: 500 11px var(--ui); padding: 1px 8px; margin-right: 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.tb-pb.est span { color: var(--muted); border-color: var(--line); }
.cm-page .tb-pb { height: 40px; margin: 34px -64px 52px; background: var(--bg); box-shadow: inset 0 9px 9px -9px rgba(23,32,43,.16), inset 0 -9px 9px -9px rgba(23,32,43,.16); }
.cm-page .tb-pb::before { display: none; }
.cm-page .tb-pb span { background: transparent; border: 0; margin: 0 auto; color: var(--faint); }

/* the page sheet */
.cm-page .cm-scroller { background: var(--bg); }
.cm-page .cm-gutters { display: none; }
.cm-page .cm-content { font-family: var(--serif); font-size: 1.14em; line-height: 1.62; max-width: 46rem; margin: 22px auto 60px; padding: 56px 64px 76px; background: var(--paper); box-shadow: 0 1px 2px rgba(23,32,43,.10), 0 10px 30px rgba(23,32,43,.08); border-radius: 2px; min-height: calc(100% - 82px); hyphens: auto; }
.cm-page .cm-line { padding: 0; }
.cm-page .cm-activeLine { background: transparent; }
.cm-page .vz-src-math, .cm-page .vz-envtag { font-family: var(--mono); }
.vz-gone { height: 0; }
/* web layout: no pages; the text fits the editor, at a readable width */
.cm-page.cm-web .cm-scroller { background: var(--paper); }
.cm-page.cm-web .cm-content { min-width: 0 !important; width: 100%; box-sizing: border-box; max-width: 54rem; margin: 0 auto; padding: 30px clamp(18px, 5%, 56px) 90px; background: transparent; box-shadow: none; min-height: 0; }
.cm-page.cm-web .tb-pb { display: none; }
.cm-page.cm-web .vz-preamble { margin: 0 0 20px; box-sizing: border-box; }
.cm-page.cm-web .vz-dmath { overflow-x: auto; overflow-y: hidden; justify-content: safe center; padding: 8px 0; min-width: 0; }
.cm-page.cm-web .vz-dmath > mjx-container { min-width: 0 !important; }
.cm-page.cm-web .vz-tablewrap { overflow: hidden; min-width: 0; }
.vz-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 2px 6px 6px; }
.vz-seg button { min-width: 0; white-space: normal; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 7px 8px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); color: var(--ink); font: 500 13px var(--ui); }
.vz-seg button small { font: 11px/1.3 var(--ui); color: var(--muted); }
.vz-seg button:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.vz-seg button.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
@container (max-width: 640px) { .cm-page .cm-content { padding: 28px 26px 48px; margin: 10px 8px 40px; } .cm-page .tb-pb { margin: 20px -26px 30px; } }

.vz-h { font-weight: 700; color: var(--ink); }
.vz-h0 { font-size: 1.7em; } .vz-h1 { font-size: 1.38em; } .vz-h2 { font-size: 1.17em; } .vz-h3 { font-size: 1.04em; } .vz-h4, .vz-h5 { font-size: 1em; }
.vz-secnum { font-weight: 700; color: var(--ink); margin-right: .75em; font-size: 1.38em; white-space: pre; }
.cm-line:has(.vz-h2) .vz-secnum { font-size: 1.17em; } .cm-line:has(.vz-h3) .vz-secnum { font-size: 1.04em; } .cm-line:has(.vz-h0) .vz-secnum { font-size: 1.1em; display: block; }
.cm-page .cm-line:has(.vz-h1), .cm-page .cm-line:has(.vz-h0) { padding-top: .5em; } .cm-page .cm-line:has(.vz-h2) { padding-top: .3em; }
.vz-b { font-weight: 700; } .vz-i { font-style: italic; } .vz-u { text-decoration: underline; } .vz-tt { font-family: var(--mono); font-size: .92em; } .vz-sc { font-variant: small-caps; } .vz-sf { font-family: var(--ui); }
.vz-mc { position: absolute; left: 0; top: 2px; font: 500 10.5px var(--ui); padding: 0 6px; height: 17px; line-height: 15px; border-radius: 9px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); opacity: 0; transition: opacity .12s; cursor: pointer; z-index: 1; }
.vz-dmath:hover .vz-mc, .vz-mc.vz-mc-set, .vz-mc:focus-visible { opacity: 1; }
.vz-mc-in { color: var(--ok, #177245); border-color: color-mix(in srgb, var(--ok, #177245) 40%, var(--line)); }
.vz-mc-out { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent); }
.vz-mc-set { border-style: dashed; }
.vz-edit { position: relative; display: flex; align-items: center; gap: 10px; padding: 6px 0 6px; }
.vz-edit math-field { flex: 1; min-width: 0; font-size: 1.15em; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 8px; padding: 6px 10px; background: var(--paper); color: var(--ink); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); --caret-color: var(--accent); --selection-background-color: var(--sel, #c3d9f5); }
.vz-edit math-field::part(menu-toggle), .vz-edit math-field::part(virtual-keyboard-toggle) { display: none; }
.vz-edit-i { display: inline-flex; padding: 0; vertical-align: middle; } .vz-edit-i math-field { font-size: 1em; padding: 1px 6px; min-width: 3em; }
.vz-edit-num { font-family: var(--serif, serif); color: var(--ink); white-space: nowrap; }
.vz-edit-bar { position: absolute; right: 0; top: -14px; display: inline-flex; gap: 4px; z-index: 2; }
.vz-edit-i .vz-edit-bar { top: -24px; }
.vz-edit-bar button { font: 500 11px var(--ui); padding: 1px 7px; height: 20px; border-radius: 5px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); }
.vz-edit-bar button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.vz-dmath { display: flex; justify-content: center; align-items: center; position: relative; padding: 6px 0; min-height: 2.2em; cursor: text; overflow-x: auto; }
.vz-dmath mjx-container { margin: 0 !important; } .vz-dmath mjx-container[width="full"] { width: 100%; }
.vz-dmath:hover, .vz-imath:hover, .vz-tablewrap:hover, .vz-title:hover { background: color-mix(in srgb, var(--accent-soft) 70%, transparent); border-radius: 4px; }
.vz-imath { cursor: text; padding: 0 1px; }
.vz-wait { font-family: var(--mono); color: var(--muted); font-size: .9em; }
.vz-err { outline: 1px dashed var(--err); outline-offset: 2px; border-radius: 3px; }
.vz-src-math { background: color-mix(in srgb, var(--accent-soft) 60%, transparent); font-family: var(--mono); font-size: .92em; }
.vz-cite, .vz-ref, .vz-label, .vz-link, .vz-fn, .vz-envtag { cursor: text; }
.vz-cite { color: var(--ok); } .vz-ref { color: var(--accent); }
.cm-typeset:not(.cm-page) .vz-cite, .cm-typeset:not(.cm-page) .vz-ref { background: color-mix(in srgb, currentColor 9%, transparent); border-radius: 4px; padding: 0 3px; }
.vz-missing { color: var(--err) !important; text-decoration: underline wavy color-mix(in srgb, var(--err) 60%, transparent); text-underline-offset: 3px; }
.vz-label { display: inline-block; font: 11px/1.5 var(--ui); padding: 0 6px; border-radius: 9px; background: var(--panel-2); color: var(--muted); vertical-align: 1px; }
.vz-link { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); }
.vz-fn { font-size: .72em; vertical-align: .5em; color: var(--accent); padding: 0 1px; }
.vz-bullet { color: var(--ink); padding: 0 .55em 0 0; display: inline-block; min-width: 1.1em; text-align: right; margin-left: -1.65em; }
.vz-desc { font-weight: 700; padding-right: .5em; }
.vz-li1 { padding-left: 1.7em !important; } .vz-li2 { padding-left: 3.4em !important; } .vz-li3 { padding-left: 5.1em !important; }
.vz-envtag { color: var(--faint); font: 11px var(--mono); }
.vz-abs { display: block; text-align: center; font-weight: 700; font-size: .92em; padding-top: .6em; }
.vz-absline { font-size: .93em; padding-left: 2.5em !important; padding-right: 2.5em !important; }
.vz-quote { padding-left: 2.5em !important; padding-right: 2.5em !important; }
.vz-center { text-align: center; }
.vz-thm { font-style: italic; } .vz-thmhead { font-weight: 700; font-style: normal; margin-right: .4em; } .vz-proofhead { font-style: italic; margin-right: .4em; }
.vz-qed { float: right; }
.vz-capnum { font-weight: 700; } .vz-cap { font-size: .94em; }
.vz-appendix { display: block; font-weight: 700; font-size: 1.2em; padding-top: .4em; }
.vz-char { font: inherit; }
.vz-preamble { margin: 6px 8px; padding: 6px 10px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); font: 12px var(--ui); cursor: pointer; }
.cm-page .vz-preamble { margin: -36px -44px 18px; text-align: center; border-style: solid; border-color: transparent; background: var(--panel-2); }
.vz-preamble:hover { border-color: var(--accent); color: var(--accent); }
.vz-title { display: inline-flex; flex-direction: column; align-items: center; gap: .35em; width: 100%; padding: 14px 0 18px; cursor: pointer; text-align: center; }
.vz-title-t { font-size: 1.62em; font-weight: 400; line-height: 1.25; } .vz-title-a { font-size: 1.08em; display: flex; flex-wrap: wrap; justify-content: center; column-gap: 2.5em; } .vz-title-d { color: var(--muted); }
.vz-img { display: inline-block; max-width: 100%; padding: 4px 0; cursor: text; } .vz-img img { max-width: min(100%, 520px); max-height: 340px; background: #fff; }
.vz-imgph { display: inline-flex; align-items: center; justify-content: center; width: min(100%, 420px); height: 120px; border: 1px dashed var(--line); border-radius: 4px; color: var(--muted); font: 12px var(--ui); }
.vz-tablewrap { display: flex; justify-content: center; padding: 6px 0; cursor: text; overflow-x: auto; }
.vz-table { border-collapse: collapse; font-size: .95em; line-height: 1.35; }
.vz-table td { padding: 3px 12px; white-space: nowrap; }
.vz-table tr.r-toprule td, .vz-table tr.r-hline td { border-top: 1.5px solid var(--ink); }
.vz-table tr.r-midrule td, .vz-table tr.r-cmid td { border-top: 1px solid var(--ink); }
.vz-table tr.after-bottomrule td, .vz-table tr.after-hline td { border-bottom: 1.5px solid var(--ink); }
.vz-table tr.r-space td { padding-top: 9px; }
.vz-toc, .vz-bib { display: flex; flex-direction: column; gap: .15em; padding: 6px 0 10px; cursor: text; }
.vz-toc-h, .vz-bib-h { font-weight: 700; font-size: 1.38em; margin-bottom: .3em; }
.vz-toc-l.l1 { padding-left: 1.5em; } .vz-toc-l.l2 { padding-left: 3em; } .vz-toc-l.l0 { font-weight: 700; }
.vz-bib-e { padding-left: 1.6em; text-indent: -1.6em; font-size: .95em; }
`);
    document.head.append(css);
    ctx.onDispose(() => css.remove());
  },
};
