import * as TE from './lib/table-edit.js';
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
    if (!window.StochaBrackets) await loadScript('./equation/brackets.js' + (document.querySelector('meta[name="stx-version"]') ? '?v=' + document.querySelector('meta[name="stx-version"]').content : ''));
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
  v = globalThis.StochaBrackets?.unstackAccents ? globalThis.StochaBrackets.unstackAccents(v) : v;     // stacked accents back to \hat{\tilde{p}}
  return v.replace(/([_^])\{([A-Za-z0-9])\}(?=(.?))/g, (m, op, c, nx) => op + c + (/[A-Za-z0-9]/.test(nx) ? ' ' : ''))
.replace(/\\bm\{/g, '\\boldsymbol{')
    .replace(/\s*(&?)\s*=\s*/g, (m, amp) => (amp ? ' &= ' : ' = ')).replace(/^ +| +$/g, '').replace(/\\\\ +/g, '\\\\ ');
}

import { loadMathJax } from './lib/mathjax.js';
import * as VP from './lib/viewplace.js';
import { modelState } from './lib/model-state.js';
import { MODEL_COMMENT, steadyState } from './lib/latex-math.js';
const LONE_LINE = /^\s*(?:\\(textbf|textit|emph|underline|textsc)\s*\{.*\}|(\$)[^$]+\$|(\\\()[\s\S]*?\\\))\s*[.:,;]?\s*$/;
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
  let s = blankComments(doc); const items = [], taken = [];
  const inTaken = (i) => taken.some(r => i >= r.from && i < r.to);
  const lineStart = (i) => doc.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (i) => { const e = doc.indexOf('\n', i); return e < 0 ? doc.length : e; };
  const wholeLines = (from, to) => doc.slice(lineStart(from), from).trim() === '' && doc.slice(to, lineEnd(to)).trim() === '';
  const bd = /\\begin\{document\}/.exec(s), bodyStart = bd ? bd.index : 0;
  const pre = doc.slice(0, bodyStart);
  if (bd && bd.index > 0) { const end = Math.max(0, lineStart(bd.index) - 1); if (end > 0) items.push({ kind: 'preamble', from: 0, to: end, lines: doc.slice(0, end).split('\n').length }); }
  // commented-out blocks: \begin{comment} … \end{comment} (comment package, and environments named in
  // \excludecomment), and \iffalse … \fi. The PDF leaves them out, so the visual view folds them into one grey bar.
  {
    const blank = (a, b) => { s = s.slice(0, a) + s.slice(a, b).replace(/[^\n]/g, ' ') + s.slice(b); };
    const fold = (a, b, label) => { const from = lineStart(a), to = lineEnd(b); items.push({ kind: 'cblock', from, to, lines: doc.slice(from, to).split('\n').length, label }); taken.push({ from, to }); blank(from, to); };
    const names = new Set(['comment']);
    for (const m of s.matchAll(/\\excludecomment\s*\{([^}]*)\}/g)) m[1].split(',').forEach(n => n.trim() && names.add(n.trim()));
    for (const m of s.matchAll(/\\includecomment\s*\{([^}]*)\}/g)) m[1].split(',').forEach(n => names.delete(n.trim()));
    if (names.size) {
      const re = new RegExp(`\\\\begin\\{(${[...names].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\}`, 'g');
      for (let m; (m = re.exec(s)); ) {
        if (m.index < bodyStart) continue;
        const e = s.indexOf(`\\end{${m[1]}}`, m.index + m[0].length); const end = e < 0 ? s.length : e + `\\end{${m[1]}}`.length;
        fold(m.index, end, m[1] === 'comment' ? 'Commented out' : `Left out (${m[1]})`); re.lastIndex = end;
      }
    }
    const cond = /\\(iffalse|if[a-zA-Z@]*|fi|else|or)(?![a-zA-Z@])/g;
    for (let m; (m = /\\iffalse(?![a-zA-Z@])/g.exec(s.slice(bodyStart))); ) {
      const a = bodyStart + m.index; let depth = 0, end = -1, elseAt = -1; cond.lastIndex = a;
      for (let k; (k = cond.exec(s)); ) {
        const w = k[1];
        if (w === 'fi') { if (--depth === 0) { end = k.index + 3; break; } }
        else if (w === 'else' || w === 'or') { if (depth === 1 && elseAt < 0) elseAt = k.index; }
        else if (!/^if(thenelse|boolexpr|toggle|bool|strequal|strempty|blank|defstring|csdef|csundef|def|undef|num|dimcomp)$/.test(w)) depth++;
      }
      if (end < 0) end = s.length;
      // \iffalse … \else … \fi: only the part before \else is left out
      fold(a, elseAt > 0 ? elseAt + 5 : end, '\\iffalse … ' + (elseAt > 0 ? '\\else' : '\\fi'));
      if (elseAt > 0) { const f = s.lastIndexOf('\\fi', end); if (f > elseAt) { blank(f, f + 3); items.push({ kind: 'comment', from: f, to: f + 3 }); } }
    }
  }
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
    // small line icons for the in-place editor bar
    const ICO = { copy: 'M9 9h10v10H9z M5 15V5h10', chev: 'M6 9l6 6 6-6', code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M13.500 5l-3 14', hash: 'M5 9h14 M5 15h14 M10 4L8 20 M16 4l-2 16',
      tag: 'M3 11.500V4h7.500L21 14.500 13.500 22z M7.500 7.500h.010', expand: 'M14 4h6v6 M20 4l-7 7 M10 20H4v-6 M4 20l7-7', trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
      more: 'M5 12h.010 M12 12h.010 M19 12h.010', check: 'M5 12.500l4.500 4.500L19 7',
      ubrace: 'M3 7c0 3 2 4.500 4.500 4.500h2.500c1.300 0 2 1 2 3 0-2 .700-3 2-3h2.500C19 11.500 21 10 21 7', obrace: 'M3 17c0-3 2-4.500 4.500-4.500h2.500c1.300 0 2-1 2-3 0 2 .700 3 2 3h2.500c2.500 0 4.500 1.500 4.500 4.500',
      frac: 'M9 3h6v5H9z M5 12h14 M9 16h6v5H9z', sqrt: 'M3 13h3l3 7 4-16h8', box: 'M4 6h16v12H4z', slot: 'M7 6h10v12H7z',
      rowAbove: 'M4 13h16v7H4z M12 3v7 M9 6l3-3 3 3', rowBelow: 'M4 4h16v7H4z M12 21v-7 M9 18l3 3 3-3', colLeft: 'M13 4h7v16h-7z M3 12h7 M6 9l-3 3 3 3', colRight: 'M4 4h7v16H4z M21 12h-7 M18 9l3 3-3 3',
      delRow: 'M4 9h16v6H4z M9 4l6 0 M8 19l8 0', delCol: 'M9 4h6v16H9z M4 9v6 M20 9v6',
      alL: 'M4 6h16 M4 10h10 M4 14h16 M4 18h10', alC: 'M4 6h16 M7 10h10 M4 14h16 M7 18h10', alR: 'M4 6h16 M10 10h10 M4 14h16 M10 18h10',
      merge: 'M3 6h18v12H3z M8 12h8 M10 10l-2 2 2 2 M14 10l2 2-2 2', copyTable: 'M8 8h13v13H8z M8 12.5h13 M8 17h13 M12.5 8v13 M4 16V4h12', split: 'M3 6h18v12H3z M12 6v12', table: 'M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14 M15 5v14' };
    const ico = (n, size = 14) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', n === 'more' ? '3' : '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICO[n]); svg.append(p); return svg; };
    // the symbol picker: [LaTeX, what it looks like, words to find it by]
    const SYM_GROUPS = [
      ['Greek', 'alpha α|beta β|gamma γ|delta δ|epsilon ϵ|varepsilon ε|zeta ζ|eta η|theta θ|vartheta ϑ|iota ι|kappa κ|lambda λ|mu μ|nu ν|xi ξ|pi π|rho ρ|sigma σ|tau τ|upsilon υ|phi ϕ|varphi φ|chi χ|psi ψ|omega ω'],
      ['Capital Greek', 'Gamma Γ|Delta Δ|Theta Θ|Lambda Λ|Xi Ξ|Pi Π|Sigma Σ|Upsilon Υ|Phi Φ|Psi Ψ|Omega Ω'],
      ['Operators', 'sum ∑|prod ∏|int ∫|partial ∂|nabla ∇|pm ±|mp ∓|times ×|div ÷|cdot ·|circ ∘|otimes ⊗|oplus ⊕|cup ∪|cap ∩|infty ∞|lim lim|max max|min min|ln ln|log log|exp exp'],
      ['Relations', 'leq ≤|geq ≥|neq ≠|approx ≈|equiv ≡|sim ∼|simeq ≃|propto ∝|ll ≪|gg ≫|in ∈|notin ∉|subset ⊂|subseteq ⊆|supset ⊃|perp ⊥|mid ∣|coloneqq ≔'],
      ['Arrows', 'to →|leftarrow ←|leftrightarrow ↔|Rightarrow ⇒|Leftarrow ⇐|Leftrightarrow ⇔|mapsto ↦|uparrow ↑|downarrow ↓|nearrow ↗|searrow ↘|longrightarrow ⟶'],
      ['Other', 'forall ∀|exists ∃|neg ¬|land ∧|lor ∨|emptyset ∅|ell ℓ|hbar ℏ|prime ′|ldots …|cdots ⋯|vdots ⋮|ddots ⋱|mathbb{R} ℝ|mathbb{N} ℕ|mathbb{Z} ℤ|mathbb{E} 𝔼|mathbb{P} ℙ|degree °|star ⋆|dagger †|top ⊤'],
    ].map(([name, list]) => [name, list.split('|').map(e => { const [cmd, glyph] = e.split(' '); return { tex: cmd === 'degree' ? '^{\\circ}' : '\\' + cmd, glyph, find: cmd.replace(/mathbb\{(\w)\}/, 'mathbb $1 blackboard') }; })]);
    // the steady state of one display equation, inserted below it as an unnumbered copy (labels and model marks left out)
    function steadyBelow(v, from, mark) {
      const items = (v.state.field(field, false)?.p || parse(v.state.doc.toString())).items;       // also with Visual off
      const it = items.find(y => y.kind === 'dmath' && y.from === from); if (!it) return;
      const doc = v.state.doc, src = doc.sliceString(it.from, it.to);
      let text = src.replace(/\\label\s*\{[^}]*\}\s*/g, '').replace(/[ \t]*%[ \t]*(not[ \t-]*)?model\b[^\n]*/gi, '');
      const m = /^\\begin\{([^}]*)\}/.exec(text);
      if (m && STAR_FOR[m[1]] !== undefined && STAR_FOR[m[1]]) text = text.replace(m[0], `\\begin{${STAR_FOR[m[1]]}}`).replace(new RegExp(`\\\\end\\{${m[1].replace('*', '\\*')}\\}\\s*$`), `\\end{${STAR_FOR[m[1]]}}`);
      const body = /^(\\begin\{[^}]*\}(?:\{[^}]*\})?|\\\[|\$\$)([\s\S]*?)(\\end\{[^}]*\}|\\\]|\$\$)$/.exec(text);
      const ss = body ? body[1] + steadyState(body[2], { mark, shocks: 'zero' }) + body[3] : steadyState(text, { mark, shocks: 'zero' });
      if (ss === text) return ctx.ui.toast('Nothing to change: this equation has no dated variables (x_t).');
      const end = doc.lineAt(it.to).to;
      v.dispatch({ changes: { from: end, insert: '\n' + ss }, userEvent: 'input' });
      ctx.ui.toast('Steady state written below the equation (unnumbered). Ctrl+Z removes it.', '', 5000);
    }
    let symPopEl = null;
    const closeSym = () => { if (symPopEl) { symPopEl.remove(); symPopEl = null; } };
    // the floating format bar (in-place equations and maths in table cells): style what you type or what is selected;
    // with a selection, also accents, braces and wraps
    function buildFmtBar(mf, btn) {
      const wrap = (tpl, wide) => () => {
        const r = mf.selection?.ranges?.[0] || [mf.position, mf.position], sel = r[0] !== r[1];
        let t = tpl;
        if (wide && sel) { const s = mf.getValue(Math.min(...r), Math.max(...r), 'latex').replace(/[{}\s]/g, ''); if (s.length > 1 && !/^\\[A-Za-z]+$/.test(s)) t = wide; }
        mf.focus();
        mf.insert(sel ? t.replace('#0', '#@') : t, { format: 'latex', selectionMode: 'placeholder' });
      };
      const fb = (label, title, fn, cls = '') => btn(h('span', { class: 'vz-fb ' + cls }, label), title, fn);
      const sep = () => h('span', { class: 'vz-bsep' });
      const fmtBar = h('span', { class: 'vz-fmt-bar', role: 'toolbar', 'aria-label': 'Format the equation' },
        fb('B', 'Bold (Ctrl+B): \\boldsymbol', wrap('\\boldsymbol{#0}'), 'b'),
        fb('I', 'Italic (Ctrl+I): \\mathit', wrap('\\mathit{#0}'), 'i'),
        fb('R', 'Upright, for names like “max” or “d” (\\mathrm)', wrap('\\mathrm{#0}'), 'r'),
        fb('U', 'Underline (Ctrl+U)', wrap('\\underline{#0}'), 'u'),
        fb('ℝ', 'Blackboard bold (\\mathbb), for ℝ, ℕ, 𝔼', wrap('\\mathbb{#0}')),
        fb('𝒜', 'Calligraphic (\\mathcal)', wrap('\\mathcal{#0}')),
        fb('Tt', 'Words inside the equation (\\text)', wrap('\\text{#0}'), 'tt'),
        sep(),
        h('span', { class: 'vz-only-sel' },
          fb(h('span', { class: 'vz-acc', 'data-acc': '¯' }, 'x'), 'Bar over the selection (\\bar, or \\overline for more than one letter)', wrap('\\bar{#0}', '\\overline{#0}')),
          fb(h('span', { class: 'vz-acc', 'data-acc': 'ˆ' }, 'x'), 'Hat (\\hat, or \\widehat)', wrap('\\hat{#0}', '\\widehat{#0}')),
          fb(h('span', { class: 'vz-acc', 'data-acc': '˜' }, 'x'), 'Tilde (\\tilde, or \\widetilde)', wrap('\\tilde{#0}', '\\widetilde{#0}')),
          fb(h('span', { class: 'vz-acc', 'data-acc': '˙' }, 'x'), 'Dot: time derivative (\\dot)', wrap('\\dot{#0}')),
          fb(h('span', { class: 'vz-vec' }, 'x'), 'Vector arrow (\\vec, or \\overrightarrow)', wrap('\\vec{#0}', '\\overrightarrow{#0}')),
          fb(h('span', { class: 'vz-acc' }, 'x', h('sup', {}, '*')), 'Star: steady state or optimum (^*)', wrap('{#0}^{*}')),
          sep(),
          fb('(x)', 'Round brackets around the selection (they grow with it)', wrap('\\left(#0\\right)')),
          fb('[x]', 'Square brackets', wrap('\\left[#0\\right]')),
          fb('{x}', 'Curly braces', wrap('\\left\\{#0\\right\\}')),
          fb('|x|', 'Absolute value', wrap('\\left|#0\\right|')),
          fb(ico('ubrace', 16), 'Underbrace with a note under it', wrap('\\underbrace{#0}_{#?}')),
          fb(ico('obrace', 16), 'Overbrace with a note over it', wrap('\\overbrace{#0}^{#?}')),
          fb(ico('box'), 'Box the selection (\\boxed)', wrap('\\boxed{#0}')),
          sep(),
          fb(ico('frac'), 'Make the selection the top of a fraction', wrap('\\frac{#0}{#?}')),
          fb(ico('sqrt'), 'Square root of the selection', wrap('\\sqrt{#0}')),
          fb(ico('slot'), 'Replace the selection with an empty box to fill in', () => { mf.focus(); mf.insert('#?', { format: 'latex', selectionMode: 'placeholder' }); })),
        h('span', { class: 'vz-only-nosel' },
          fb(ico('frac'), 'Fraction', wrap('\\frac{#0}{#?}')),
          fb(ico('sqrt'), 'Square root', wrap('\\sqrt{#0}')),
          fb('xⁿ', 'Superscript (^)', () => { mf.focus(); mf.executeCommand('moveToSuperscript'); }),
          fb('xₙ', 'Subscript (_)', () => { mf.focus(); mf.executeCommand('moveToSubscript'); }),
          fb('Σ', 'Sum with limits', wrap('\\sum_{#?}^{#?}#0')),
          fb('E', 'Expectation: \\mathbb{E}_t[ … ]', wrap('\\mathbb{E}_{t}\\left[#0\\right]')),
          fb('( )', 'Brackets that grow with what is inside', wrap('\\left(#0\\right)')),
          fb(ico('slot'), 'An empty box to fill in', () => { mf.focus(); mf.insert('#?', { format: 'latex', selectionMode: 'placeholder' }); }),
          h('span', { class: 'vz-hint' }, 'Select part of it for accents and braces')));
      const syncSel = () => { const r = mf.selection?.ranges?.[0] || [0, 0]; fmtBar.classList.toggle('has-sel', r[0] !== r[1]); };
      mf.addEventListener('selection-change', syncSel);
      return fmtBar;
    }
    function symbolPop(anchor, mfArg) {
      const mf = mfArg || session?.mf; if (!mf) return;
      if (symPopEl) return closeSym();
      let recent = []; try { recent = JSON.parse(localStorage.getItem('stx-sym-recent') || '[]'); } catch {}
      const put = (sym) => {
        mf.focus(); mf.insert(sym.tex + (/^\\[A-Za-z]+$/.test(sym.tex) ? ' ' : ''), { format: 'latex' });
        recent = [sym.tex, ...recent.filter(t => t !== sym.tex)].slice(0, 12); try { localStorage.setItem('stx-sym-recent', JSON.stringify(recent)); } catch {}
      };
      const all = SYM_GROUPS.flatMap(g => g[1]);
      const cell = (sym) => h('button', { class: 'vz-sym-c' + (sym.glyph.length > 1 && /[a-z]/.test(sym.glyph) ? ' w' : ''), title: sym.tex, onMousedown: (e) => { e.preventDefault(); put(sym); if (!e.shiftKey) closeSym(); } }, sym.glyph);
      const body = h('div', { class: 'vz-sym-body' });
      const draw = (q) => {
        body.textContent = '';
        q = q.trim().toLowerCase().replace(/^\\/, '');
        if (q) { const hits = all.filter(x => x.find.toLowerCase().includes(q) || x.glyph === q); body.append(hits.length ? h('div', { class: 'vz-sym-g' }, ...hits.map(cell)) : h('p', { class: 'muted' }, 'No symbol by that name. You can also type \\' + q + ' in the equation.')); return; }
        const rec = recent.map(t => all.find(x => x.tex === t)).filter(Boolean);
        if (rec.length) body.append(h('div', { class: 'vz-sym-h' }, 'Recent'), h('div', { class: 'vz-sym-g' }, ...rec.map(cell)));
        for (const [name, list] of SYM_GROUPS) body.append(h('div', { class: 'vz-sym-h' }, name), h('div', { class: 'vz-sym-g' }, ...list.map(cell)));
      };
      const search = h('input', { type: 'search', class: 'vz-sym-q', placeholder: 'Find a symbol: alpha, leq, arrow…', onInput: (e) => draw(e.target.value),
        onKeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSym(); mf.focus(); } else if (e.key === 'Enter') { e.preventDefault(); const b = body.querySelector('.vz-sym-c'); if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } } });
      symPopEl = h('div', { class: 'vz-sym', role: 'dialog', 'aria-label': 'Insert a symbol' }, search, body, h('div', { class: 'vz-sym-foot muted' }, 'Click to insert · Shift+click to insert several · or type \\name in the equation'));
      draw('');
      document.body.append(symPopEl);
      const r = anchor.getBoundingClientRect(), w = 320;
      symPopEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
      const below = r.bottom + 6, hgt = Math.min(360, innerHeight - 16);
      symPopEl.style.top = (below + hgt < innerHeight - 8 ? below : Math.max(8, r.top - hgt - 6)) + 'px';
      symPopEl.style.maxHeight = hgt + 'px';
      const off = (e) => { if (!symPopEl) return document.removeEventListener('mousedown', off, true); if (symPopEl.contains(e.target) || anchor.contains(e.target)) return; closeSym(); document.removeEventListener('mousedown', off, true); };
      document.addEventListener('mousedown', off, true);
      setTimeout(() => search.focus(), 0);
    }
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
      const stack = (x) => (window.StochaBrackets?.stackAccents ? window.StochaBrackets.stackAccents(x) : x);
      mf.value = stack(model.field);
      const nums = (it.rows || []).map(r => r.num).filter(Boolean);
      const tag = nums.length ? h('span', { class: 'vz-edit-num' }, nums.length > 1 ? `(${nums[0]})–(${nums[nums.length - 1]})` : `(${nums[0]})`) : null;
      const btn = (label, title, fn, cls = '') => h('button', { class: cls, title, 'aria-label': title.split(/[(:]/)[0].trim(), onMousedown: (e) => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget, e); } }, label);
      const numbered0 = () => { const x = itemNow(); if (!x || x.kind !== 'dmath') return null; const starred = /\*$/.test(view.state.sliceDoc(x.from, x.from + 40).match(/^\\begin\{([^}]*)\}/)?.[1] || ''); return { x, starred, has: !!x.env && !starred && x.env !== 'displaymath' && x.env !== 'math' }; };
      const bar = h('span', { class: 'vz-edit-bar' },
        btn(h('span', { class: 'vz-ib' }, ico('copy'), ico('chev', 10)), 'Copy this equation: as LaTeX, for Word, as an image, or a reference to it', (b) => copyMenu(b)),
        btn(h('span', { class: 'vz-ib vz-om' }, 'Ω'), 'Insert a symbol: Greek letters, operators, relations, arrows (Ctrl+Shift+S)', (b) => symbolPop(b)),
        btn(ico('code'), 'Show the LaTeX of this equation (Alt+click does the same; Esc there, or “Visual”, comes back)', () => { const pos = view.state.field(editField)?.bodyFrom; finishEdit(true, pos); }),
        ...(display ? [
          btn(ico('hash'), 'Number: give it an equation number, or remove it', () => { const n = numbered0(); if (n) toggleNumber(n.x, !n.has); }),
          btn(ico('tag'), 'Label: add a \\label so you can refer to it with \\eqref (or rename it)', () => { const x = itemNow(); if (x) editLabel(x, ((x.body || '').match(/\\label\{([^}]*)\}/) || [])[1]); }),
        ] : []),
        btn(ico('expand'), 'Open in the full equation editor, beside the paper', () => { const pos = view.state.field(editField)?.bodyFrom; finishEdit(true, pos); ctx.ui.runCommand('equation.side'); }),
        btn(ico('trash'), 'Delete this equation (Ctrl+Z brings it back)', () => { const x = itemNow(); if (x) deleteEq(x); }, 'vz-danger'),
        btn(ico('more'), 'More: duplicate, cut, make it fit the page, box, flip a fraction, auto-size brackets, model check', (b) => moreMenu(b)),
        btn(ico('check'), 'Done (Esc)', () => finishEdit(true), 'primary'));
      const fmtBar = buildFmtBar(mf, btn);
      const el = h(display ? 'div' : 'span', { class: display ? 'vz-edit' : 'vz-edit vz-edit-i' }, mf, tag, ...(display ? [h('div', { class: 'vz-edit-head' }, bar), fmtBar] : [fmtBar, bar]));
      const sess = session = { el, mf, model, view, base: null, orig: model.body };
      // a long equation shrinks a little to fit the field (MathLive cannot wrap a line); the caret stays in view
      const fitField = () => { try { mf.style.fontSize = ''; const box = mf.getBoundingClientRect().width - 24, cont = mf.shadowRoot?.querySelector('.ML__content, .ML__latex'); const w = cont ? cont.scrollWidth : 0; if (w > box && box > 0) mf.style.fontSize = Math.max(0.7, box / w) * (display ? 1.15 : 1) + 'em'; } catch {} };
      mf.addEventListener('input', () => requestAnimationFrame(fitField)); setTimeout(fitField, 120);
      sess.widget = new EditWidget(sess);
      mf.addEventListener('input', () => {
        if (session !== sess) return;
        let v = tidyTeX(mf.getValue('latex')).replace(/\\placeholder(?:\[[^\]]*\])?\{\}/g, '{}');
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
      // finish on a real click outside; MathLive's own pop-ups (command suggestions, menus) and our menus do not count
      const away = (e) => { if (session !== sess) return document.removeEventListener('mousedown', away, true); const t = e.target; if (el.contains(t) || (t.closest && t.closest('.ML__popover, #mathlive-suggestion-popover, .ML__keyboard, .ui-menu-container, .menu, .modal, .toasts, .vz-sym'))) return; finishEdit(false); };
      document.addEventListener('mousedown', away, true); sess.away = away;
      // copying inside the field gives plain LaTeX (MathLive would wrap it in $$ … $$)
      el.addEventListener('copy', (e) => {
        if (!mf.contains(e.target) && e.target !== mf && !e.composedPath().includes(mf)) return;
        const r = mf.selection?.ranges?.[0] || [0, 0];
        const t = r[0] === r[1] ? tidyTeX(mf.getValue('latex')) : tidyTeX(mf.getValue(Math.min(...r), Math.max(...r), 'latex'));
        e.clipboardData.setData('text/plain', t); e.preventDefault(); e.stopPropagation();
      }, true);
      el.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); e.stopPropagation(); const x = itemNow(); if (x) duplicate(x, false); }
        else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); symbolPop(bar.children[1]); }
      }, true);
      // cutting everything cuts the whole equation (environment and label too)
      el.addEventListener('cut', (e) => {
        const r = mf.selection?.ranges?.[0] || [0, 0];
        if (Math.min(...r) > 0 || Math.max(...r) < mf.lastOffset) return;
        const x = itemNow(); if (!x) return;
        e.preventDefault(); e.stopPropagation();
        e.clipboardData.setData('text/plain', view.state.sliceDoc(x.from, x.to));
        setTimeout(() => cutEquation(x));
      }, true);
      // pasting a whole equation (with \begin … \end, \[ \] or $ $) into a field takes only the maths
      el.addEventListener('paste', (e) => {
        const t = e.clipboardData?.getData('text/plain') || '';
        const m = /^\s*(?:\\begin\{(?:equation|align|gather|multline|displaymath)\*?\}([\s\S]*)\\end\{(?:equation|align|gather|multline|displaymath)\*?\}|\\\[([\s\S]*)\\\]|\$\$([\s\S]*)\$\$|\$([^$]*)\$)\s*$/.exec(t);
        if (!m) return;
        e.preventDefault(); e.stopPropagation();
        mf.insert((m[1] ?? m[2] ?? m[3] ?? m[4]).replace(EXTRA, '').trim(), { format: 'latex' });
      }, true);
      // Ctrl+B / Ctrl+I / Ctrl+U inside the equation: bold, italic, underlined maths
      el.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        const cmd = { b: 'boldsymbol', i: 'mathit', u: 'underline' }[e.key.toLowerCase()]; if (!cmd) return;
        e.preventDefault(); e.stopPropagation();
        const r = mf.selection?.ranges?.[0] || [mf.position, mf.position];
        mf.insert(r[0] === r[1] ? `\\${cmd}{#0}` : `\\${cmd}{#@}`, { format: 'latex', selectionMode: 'placeholder' });
      }, true);
      const itemNow = () => { const ed = view.state.field(editField, false); return ed && view.state.field(field, false)?.p.items.find(x => x.from === ed.from && (x.kind === 'dmath' || x.kind === 'imath')); };
      const copyText = async (text, what) => { try { await navigator.clipboard.writeText(text); ctx.ui.toast('Copied ' + what + '.'); } catch { ctx.ui.toast('The browser did not allow copying.', 'warn'); } };
      function copyMenu(anchor) {
        const x = itemNow(); if (!x) return;
        const label = ((x.body || '').match(/\\label\{([^}]*)\}/) || [])[1];
        ctx.ui.menu(anchor, [
          { label: 'LaTeX, as in the paper', hint: x.kind === 'dmath' ? (!x.env ? '\\[ … \\]' : '\\begin{' + x.env + '}') : '$ … $', onClick: () => copyText(view.state.sliceDoc(x.from, x.to), 'the LaTeX') },
          { label: 'Just the equation', hint: 'no \\begin, labels or $', onClick: () => copyText(tidyTeX(mf.getValue('latex')), 'the equation') },
          { label: 'For Word (MathML)', title: 'Pastes into Word as an editable equation', onClick: () => { const m = mf.getValue('math-ml'); copyText(/^<math/.test(m) ? m : `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${m}</math>`, 'the equation for Word'); } },
          { label: 'As an image (PNG)', onClick: () => copyImage(x) },
          ...(label ? ['-', { label: `A reference: \\eqref{${label}}`, onClick: () => copyText(`\\eqref{${label}}`, 'the reference') }] : []),
        ]);
      }
      async function copyImage(x) {
        const r = renderMath(mathTex(x), x.kind === 'dmath', parse(view.state.doc.toString()).info.macros, 0);
        const svgEl = h('div'); svgEl.innerHTML = r.html || ''; const svg = svgEl.querySelector('svg'); if (!svg) return ctx.ui.toast('Could not draw this equation.', 'warn');
        const ex = 8 * 2, w = parseFloat(svg.getAttribute('width')) * ex, hh = parseFloat(svg.getAttribute('height')) * ex;
        svg.setAttribute('width', w); svg.setAttribute('height', hh); svg.setAttribute('color', '#000');
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
        try {
          const img = new Image(); await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
          const c = h('canvas'); c.width = Math.ceil(w) + 16; c.height = Math.ceil(hh) + 16; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 8, 8, w, hh);
          const blob = await new Promise(res => c.toBlob(res, 'image/png'));
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); ctx.ui.toast('Copied the equation as an image.');
        } catch (e) { ctx.ui.toast('The browser did not allow copying the image.', 'warn'); } finally { URL.revokeObjectURL(url); }
      }
      // the whole equation in the source: from its \begin line to its \end line (and one blank line after it)
      const wholeRange = (x) => { const d = view.state.doc; if (x.kind !== 'dmath' || !x.block) return { from: x.from, to: x.to }; const a = d.lineAt(x.from).from; let b2 = d.lineAt(x.to).to; if (b2 < d.length) b2++; return { from: a, to: b2 }; };
      const usedLabels = () => { const all = [view.state.doc.toString(), ...ctx.project.files().filter(f => /\.tex$/i.test(f) && f !== ctx.editor.path).map(f => ctx.project.read(f) || '')].join('\n'); return new Set([...all.matchAll(/\\label\{([^}]*)\}/g)].map(m => m[1])); };
      const nextLabel = (l, used) => { const base = l.replace(/-\d+$/, ''); let k = 2; while (used.has(`${base}-${k}`)) k++; return `${base}-${k}`; };
      function duplicate(x, rowOnly) {
        const st = view.state, used = usedLabels(), mode = ctx.settings.get('dupLabel', 'suffix');
        const fixLabels = (t) => t.replace(/\\label\{([^}]*)\}/g, (m, l) => { if (mode === 'none') return ''; const n = nextLabel(l, used); used.add(n); return `\\label{${n}}`; });
        if (rowOnly) {
          const rows = splitRows(x.body); const r = currentRow(x); const ri = Math.max(0, Math.min(rows.length - 1, r));
          let at = x.inner, k = 0; for (; k < ri; k++) at += rows[k].length + 2;
          const row = rows[ri], end = at + row.trimEnd().length, copy = fixLabels(row).trim();
          const indent = (/\n([ \t]*)\S/.exec(row) || [, '  '])[1];
          finishEdit(false);
          view.dispatch({ changes: { from: end, insert: ' \\\\\n' + indent + copy }, userEvent: 'input' });
          return;
        }
        const w = wholeRange(x), src = st.sliceDoc(x.from, x.to), copy = fixLabels(src);
        finishEdit(false);
        const at = x.kind === 'dmath' && x.block ? w.to : x.to;
        const ins = x.kind === 'dmath' && x.block ? (st.sliceDoc(w.to - 1, w.to) === '\n' ? '' : '\n') + copy + '\n' : ' ' + copy;
        view.dispatch({ changes: { from: at, insert: ins }, userEvent: 'input' });
        // open the copy for editing
        setTimeout(() => { const p = view.state.field(field, false)?.p; const it2 = p && p.items.find(y => (y.kind === 'dmath' || y.kind === 'imath') && y.from >= at && y.from <= at + 2); if (it2 && editModel(it2)) startEdit(view, it2); }, 30);
        ctx.ui.toast('Duplicated' + (/\\label/.test(src) ? (mode === 'none' ? ' (the copy has no label)' : ' (the copy’s label got a number)') : '') + '. Ctrl+Z removes it.');
      }
      // which row of an aligned field the caret is in (counted with a hidden field)
      function currentRow(x) {
        const rows = (sess.model.rows || 1); if (rows <= 1) return 0;
        const pos = mf.position, clean = splitRows(x.body).map(r => r.replace(EXTRA, '').trim());
        try {
          const probe = document.createElement('math-field'); probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(probe);
          let row = 0;
          for (let r = 0; r < clean.length - 1; r++) { probe.value = `\\begin{aligned}${clean.slice(0, r + 1).join('\\\\')}\\end{aligned}`; if (pos >= probe.lastOffset - 1) row = r + 1; }
          probe.remove(); return row;
        } catch { return 0; }
      }
      function cutEquation(x) {
        const w = wholeRange(x), src = view.state.sliceDoc(x.from, x.to);
        finishEdit(false);
        try { navigator.clipboard.writeText(src); } catch {}
        view.dispatch({ changes: { from: w.from, to: w.to, insert: x.kind === 'imath' ? '' : '' }, userEvent: 'delete.cut' });
        ctx.ui.toast('Cut the equation (with its environment). Paste it anywhere in the text; Ctrl+Z puts it back.');
      }
      // rewrite an equation so it fits the printed page: equation + split, broken at + − =
      function fitPage(x) {
        const rows = splitRows(x.body.trim()); if (rows.length !== 1 || x.kind !== 'dmath') return ctx.ui.toast('Only single-line equations can be rewritten this way.', 'warn');
        const ex = (rows[0].match(EXTRA) || []).join(' '), body = rows[0].replace(EXTRA, '').trim();
        const macros = view.state.field(field).p.info.macros;
        const avail = 62; // about the text width of a 12pt article, in ex
        let parts = breakRow(unwrapBig(body, avail, macros), avail, macros) || breakRow(body, avail, macros);
        if (!parts || parts.length < 2) return ctx.ui.toast('This equation has no good place to break (or it already fits).', 'warn');
        const numbered = !x.env || !/\*$/.test(view.state.sliceDoc(x.from, x.from + 40).match(/^\\begin\{([^}]*)\}/)?.[1] || '') ? (x.env ? true : false) : false;
        const env = x.env ? (numbered ? 'equation' : 'equation*') : 'equation*';
        const next = `\\begin{${env}}${ex ? ex : ''}\n  \\begin{split}\n    ${parts.join(' \\\\\n    ')}\n  \\end{split}\n\\end{${env}}`;
        const html = renderMath(`\\begin{split}${parts.join('\\\\')}\\end{split}`, true, macros, 0).html || '';
        const pv = h('div', { class: 'vz-fitpv' }); pv.innerHTML = html;
        ctx.ui.modal({ title: 'Make it fit the page', body: h('div', {}, h('p', { class: 'muted' }, 'The equation is broken over several lines in the source, so it also fits in the PDF:'), pv, h('pre', { class: 'vz-fitsrc' }, next)),
          buttons: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: (m) => { m.close(); finishEdit(false); const it2 = view.state.field(field).p.items.find(y => y.from === x.from); if (it2) view.dispatch({ changes: { from: it2.from, to: it2.to, insert: next }, userEvent: 'input' }); } }] });
      }
      function moreMenu(anchor) {
        const x = itemNow(); if (!x) return;
        const numbered = x.kind === 'dmath' && STAR_FOR[x.env] !== undefined && x.env !== 'displaymath' && x.env !== 'math';
        const starred = /\*$/.test(view.state.sliceDoc(x.from, x.from + 40).match(/^\\begin\{([^}]*)\}/)?.[1] || '');
        const label = ((x.body || '').match(/\\label\{([^}]*)\}/) || [])[1];
        const mc = x.kind === 'dmath' ? mcFor(view.state, x) : null;
        const auto = autoSizeOn();
        ctx.ui.menu(anchor, [
          { label: 'Duplicate this equation', hint: 'Ctrl+Shift+D', onClick: () => duplicate(x, false) },
          ...(x.kind === 'dmath' ? [{ label: 'Write its steady state below (\\bar{x})', title: 'A copy below with the time subscripts dropped and a bar on each variable; E_t goes, shocks are 0', onClick: () => { finishEdit(true); steadyBelow(view, x.from, 'bar'); } },
            { label: 'Steady state below, with another mark…', onClick: (ev) => { finishEdit(true); ctx.ui.menu(ev?.currentTarget || document.querySelector('.vz-edit-bar') || document.body, [['hat', 'Hat   \\hat{x}'], ['tilde', 'Tilde   \\tilde{x}'], ['star', 'Star   x^{*}'], ['overline', 'Overline   \\overline{x}'], ['ss', 'Subscript   x_{ss}'], ['none', 'Only drop the t']].map(([m, l]) => ({ label: l, onClick: () => steadyBelow(view, x.from, m) }))); } }] : []),
          ...(sess.model.rows > 1 ? [{ label: 'Duplicate this row', onClick: () => duplicate(x, true) }] : []),
          { label: 'Cut the equation', hint: 'with its \\begin … \\end', onClick: () => cutEquation(x) },
          ...(x.kind === 'dmath' && !(sess.model.rows > 1) ? [{ label: 'Make it fit the page (PDF)…', title: 'Break it over lines in the source, so it fits the printed page too', onClick: () => fitPage(x) }] : []),
          '-',
          { label: 'Box it', hint: 'selection or all', onClick: () => box(x) },
          ...(window.StochaBrackets?.structureAt(mf) ? [
            { label: 'Remove the brace/box, keep what is under it', onClick: () => window.StochaBrackets.removeStructure(mf, true) },
            { label: 'Delete the brace/box with everything under it', onClick: () => window.StochaBrackets.removeStructure(mf, false) }] : []),
          { label: 'Flip the fraction at the cursor', hint: 'Alt+/', onClick: () => { mf.focus(); window.StochaBrackets?.flipInField(mf); } },
          { label: (auto ? '✓ ' : '') + 'Auto-size brackets', title: '( ) [ ] { } grow with tall content (\\left … \\right) as you edit', onClick: () => { try { localStorage.setItem('olve-autosize', JSON.stringify(!auto)); } catch {} ctx.ui.toast(auto ? 'Auto-size off.' : 'Brackets you edit now grow with tall content.'); } },
          ...(mc ? ['-', { label: mc.status === 'in' ? 'Leave it out of the model check' : 'Put it in the model check', onClick: () => { finishEdit(false); setModel(view, x, mc); } }] : []),
        ]);
      }
      function toggleNumber(x, starred) {
        const src = view.state.sliceDoc(x.from, x.to);
        let next;
        if (!x.env) next = '\\begin{equation}' + src.slice(2, -2) + '\\end{equation}';
        else { const env = x.env.replace(/\*$/, ''); next = starred ? src.replace(`\\begin{${env}*}`, `\\begin{${env}}`).replace(new RegExp(`\\\\end\\{${env}\\*\\}$`), `\\end{${env}}`) : src.replace(`\\begin{${env}}`, `\\begin{${env}*}`).replace(new RegExp(`\\\\end\\{${env}\\}$`), `\\end{${env}*}`); }
        finishEdit(false);
        if (next !== src) view.dispatch({ changes: { from: x.from, to: x.to, insert: next }, userEvent: 'input' });
      }
      function deleteEq(x) {
        finishEdit(false);
        const it2 = view.state.field(field).p.items.find(y => y.from === x.from); if (!it2) return;
        const a = it2.kind === 'dmath' && it2.block ? view.state.doc.lineAt(it2.from).from : it2.from;
        let b2 = it2.kind === 'dmath' && it2.block ? view.state.doc.lineAt(it2.to).to : it2.to; if (b2 < view.state.doc.length && it2.block) b2++;
        view.dispatch({ changes: { from: a, to: b2, insert: '' }, userEvent: 'delete' });
        ctx.ui.toast(h('span', {}, 'Equation deleted. ', h('button', { class: 'small', onClick: (ev) => { ev.target.closest('.toast')?.remove(); ctx.cm.undo ? ctx.cm.undo(view) : document.execCommand('undo'); } }, 'Undo')), '', 6000);
      }
      // a label from the left-hand side: \pi_t = … gives eq:pi, Q_t = … gives eq:Q (made unique)
      function suggestLabel(x) {
        const body = splitRows(x.body || '')[0]?.replace(EXTRA, '') || '';
        const lhs = (body.split(/&?=|\\(?:leq|geq|equiv|approx)\b/)[0] || '').replace(/\\(?:left|right|big|Big|bigg|Bigg|mathrm|mathit|mathbf|boldsymbol|text|hat|bar|tilde|widehat|widetilde|overline|dot|ddot|vec|frac|dfrac|tfrac|sqrt|ln|log|exp|mathbb|mathcal|operatorname)\b/g, ' ').replace(/[_^](\{[^}]*\}|\\?[A-Za-z0-9]+)/g, '');
        const words = (lhs.match(/\\?[A-Za-z]+/g) || []).map(w => w.replace(/^\\/, '')).filter(w => w.length && w !== 't');
        let base = 'eq:' + (words.slice(0, 3).join('_').slice(0, 24) || 'eq');
        if (base === 'eq:eq') base = 'eq:';
        const used = usedLabels(); if (base !== 'eq:' && used.has(base)) base = nextLabel(base, used);
        return base;
      }
      async function editLabel(x, old) {
        const name = await ctx.ui.prompt(old ? 'Rename the label' : 'Add a label', old ? `New name for ${old} (its \\ref and \\eqref change too)` : 'Label (refer to it with \\eqref):', old || suggestLabel(x));
        if (!name || name === old || /[\s{}\\]/.test(name)) return;
        finishEdit(false);
        if (!old) setTimeout(() => ctx.ui.toast(h('span', {}, `Labelled ${name}. `, h('button', { class: 'small', onClick: async (ev) => { ev.target.closest('.toast')?.remove(); try { await navigator.clipboard.writeText(`\\eqref{${name}}`); ctx.ui.toast('Copied \\eqref{' + name + '}. Paste it where you mention the equation.'); } catch {} } }, `Copy \\eqref{${name}}`)), '', 8000), 50);
        const st = view.state, src = st.sliceDoc(x.from, x.to);
        if (old) {
          // rename the label and every reference to it, in every file
          const re = new RegExp(`(\\\\(?:label|ref|eqref|cref|Cref|autoref|nameref|pageref|vref)\\*?\\{(?:[^}]*,)?)${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[,}])`, 'g');
          const text = st.doc.toString(), out = text.replace(re, '$1' + name);
          if (out !== text) { let a = 0; while (text[a] === out[a]) a++; let b2 = 0; while (b2 < text.length - a && text[text.length - 1 - b2] === out[out.length - 1 - b2]) b2++; view.dispatch({ changes: { from: a, to: text.length - b2, insert: out.slice(a, out.length - b2) }, userEvent: 'input' }); }
          for (const f of ctx.project.files().filter(f => /\.tex$/i.test(f) && f !== ctx.editor.path)) { const t = ctx.project.read(f); if (t && re.test(t)) { re.lastIndex = 0; ctx.project.write(f, t.replace(re, '$1' + name)); } re.lastIndex = 0; }
          ctx.ui.toast(`Renamed ${old} to ${name}, with its references.`);
        } else {
          const m = src.match(/^\\begin\{[^}]*\}/) || src.match(/^(\\\[|\$\$)/);
          if (!m) return;
          let ins = m[0], at = x.from + m[0].length;
          if (!x.env) { view.dispatch({ changes: { from: x.from, to: x.to, insert: '\\begin{equation}\\label{' + name + '}' + src.slice(2, -2) + '\\end{equation}' }, userEvent: 'input' }); return; }
          view.dispatch({ changes: { from: at, insert: '\\label{' + name + '}' }, userEvent: 'input' });
        }
      }
      function box(x) {
        const value = mf.getValue('latex');
        if (/^\\begin\{aligned\}/.test(value)) {
          // align rows: \Aboxed{lhs &= rhs} (mathtools), done in the source
          finishEdit(false);
          const it2 = view.state.field(field).p.items.find(y => y.from === x.from); if (!it2) return;
          const rows = splitRows(it2.body.trim());
          const already = rows.every(r => /^\s*\\Aboxed\{/.test(r));
          const next = rows.map(r => { const ex = (r.match(EXTRA) || []).join(' '), c = r.replace(EXTRA, '').trim(); if (already) { const m = /^\\Aboxed\{([\s\S]*)\}$/.exec(c); return (m ? m[1] : c) + (ex ? ' ' + ex : ''); } return `\\Aboxed{${c}}` + (ex ? ' ' + ex : ''); });
          const lead = it2.body.match(/^\s*/)[0], trail = it2.body.match(/\s*$/)[0], indent = (lead.match(/\n([ \t]*)$/) || [, '  '])[1];
          const changes = [{ from: it2.inner, to: it2.inner + it2.body.length, insert: lead + next.join(' \\\\\n' + indent) + trail }];
          const text = view.state.doc.toString(), bd = text.indexOf('\\begin{document}');
          if (!already && bd > 0 && !/\\usepackage(\[[^\]]*\])?\{[^}]*\bmathtools\b/.test(text.slice(0, bd))) { const last = [...text.slice(0, bd).matchAll(/^\\usepackage.*$/gm)].pop(); const at = last ? last.index + last[0].length + 1 : bd; changes.push({ from: at, insert: '\\usepackage{mathtools}\n' }); }
          view.dispatch({ changes, userEvent: 'input' });
          return;
        }
        mf.focus();
        const r = mf.selection?.ranges?.[0] || [0, 0];
        if (r[0] !== r[1]) { const sel = mf.getValue(r[0], r[1], 'latex'); const m = /^\\boxed\{([\s\S]*)\}$/.exec(sel.trim()); mf.insert(m ? m[1] : `\\boxed{${sel}}`, { format: 'latex', insertionMode: 'replaceSelection' }); }
        else { const m = /^\\boxed\{([\s\S]*)\}$/.exec(value.trim()); mf.value = m ? m[1] : `\\boxed{${value}}`; mf.dispatchEvent(new Event('input')); }
      }
      view.dispatch({ effects: setEdit.of({ from: it.from, bodyFrom, bodyTo }) });
      // the paper's own \newcommand macros (MathLive takes them only once the field is on the page)
      requestAnimationFrame(() => { try { window.StochaBrackets?.setupField(mf, { note: (m) => ctx.ui.toast(m) }); } catch {} try { if (Object.keys(macros).length) { mf.macros = { ...mf.macros, ...macros }; mf.value = stack(model.field); } sess.base = tidyTeX(mf.getValue('latex')); mf.focus(); mf.position = mf.lastOffset; } catch {} });
    }
    function finishEdit(focus, pos) {
      const sess = session; if (!sess) return;
      session = null;
      closeSym();
      if (sess.away) document.removeEventListener('mousedown', sess.away, true);
      const view = sess.view, ed = view.state.field(editField, false);
      let empty = false; try { empty = !sess.mf.getValue('latex').trim(); } catch {}
      try { view.dispatch({ effects: setEdit.of(null), ...(pos != null ? { selection: { anchor: pos } } : {}) }); } catch {}
      // an equation left empty goes away (with Undo)
      if (empty && ed) {
        const it = view.state.field(field, false)?.p.items.find(y => y.from === ed.from && (y.kind === 'dmath' || y.kind === 'imath'));
        if (it && !(it.body ?? it.tex ?? '').replace(EXTRA, '').trim()) {
          const d = view.state.doc, a = it.kind === 'dmath' && it.block ? d.lineAt(it.from).from : it.from; let b2 = it.kind === 'dmath' && it.block ? d.lineAt(it.to).to : it.to; if (it.block && b2 < d.length) b2++;
          view.dispatch({ changes: { from: a, to: b2 }, userEvent: 'delete' });
          ctx.ui.toast(h('span', {}, 'Empty equation removed. ', h('button', { class: 'small', onClick: (ev) => { ev.target.closest('.toast')?.remove(); ctx.cm.undo ? ctx.cm.undo(view) : document.execCommand('undo'); } }, 'Undo')), '', 6000);
        }
      }
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
      const b = h('button', { class: 'vz-mc vz-mc-' + mc.status + (mc.override ? ' vz-mc-set' : ''), title: (mc.override ? 'Set by the comment % ' + (mc.override === 'in' ? 'model' : 'not model') + ' on its \\begin line. ' : 'Chosen automatically. ') + (mc.status === 'in' ? 'Untick to leave it out of' : 'Tick to put it in') + ' the model.', role: 'checkbox', 'aria-checked': mc.status === 'in' ? 'true' : mc.status === 'part' ? 'mixed' : 'false' }, h('span', { class: 'vz-mcbox', 'aria-hidden': 'true' }), mc.status === 'part' ? 'partly in the model' : 'in the model');
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); setModel(view, it, mc); });
      return b;
    }
    function setModel(view, it, mc) {
      const want = mc.status === 'in' ? 'out' : 'in';
      const line = view.state.doc.lineAt(it.from), text = line.text.replace(MODEL_COMMENT, '').replace(/[ \t]+$/, '');
      const next = want === mc.auto ? text : text + (want === 'in' ? ' % model' : ' % not model');
      if (next !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, userEvent: 'input.model' });
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
      const draw = (tex) => { const r = renderMath(tex, true, wd.macros, Math.round(avail / 20) * 20); if (r.html) { const chip = el.querySelector(':scope > .vz-mc'); el.innerHTML = r.html; if (chip) el.append(chip); } return el.querySelector('svg'); };
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
    // a drawn \ref / \eqref / \cite: a click goes to what it points at (Alt+click shows its LaTeX); hovering shows a card
    class RefTag extends Tag {
      constructor(text, cls, pos, title, kind, keys) { super(text, cls, pos, title); this.kind = kind; this.keys = keys; }
      eq(o) { return super.eq(o) && o.kind === this.kind && o.keys === this.keys; }
      toDOM(view) {
        const el = h('span', { class: this.cls + ' vz-jump', title: '' }, this.text);
        el.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          if (e.altKey || !clickEdits()) return reveal(view, this.pos)(e);
          e.preventDefault(); hideCard(); jumpTo(view, this.kind, this.keys.split(',')[0].trim());
        });
        el.addEventListener('mouseenter', () => showCard(view, el, this.kind, this.keys.split(',')[0].trim(), this.title));
        el.addEventListener('mouseleave', () => hideCard(250));
        return el;
      }
    }
    // where a label or a citation is: this file first, then the other .tex files (and .bib files for citations)
    const lineOfIdx = (t, i) => t.slice(0, i).split('\n').length;
    function findLabel(view, key) {
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('\\\\label\\s*\\{' + esc + '\\}');
      const here = view.state.doc.toString(), m = re.exec(here);
      if (m) return { file: ctx.editor.path, pos: m.index, line: lineOfIdx(here, m.index), text: here };
      for (const f of ctx.project.files().filter(f => /\.tex$/i.test(f) && f !== ctx.editor.path)) { const t = ctx.project.read(f) || ''; const mm = re.exec(t); if (mm) return { file: f, pos: mm.index, line: lineOfIdx(t, mm.index), text: t }; }
      return null;
    }
    function findCite(view, key) {
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const here = view.state.doc.toString();
      const item = new RegExp('\\\\bibitem\\s*(?:\\[[^\\]]*\\])?\\s*\\{' + esc + '\\}').exec(here);
      if (item) return { file: ctx.editor.path, pos: item.index, line: lineOfIdx(here, item.index) };
      const list = /\\(?:bibliography\s*\{|printbibliography)/.exec(here);
      if (list) return { file: ctx.editor.path, pos: list.index, line: lineOfIdx(here, list.index), list: true };
      for (const f of ctx.project.files().filter(f => /\.bib$/i.test(f))) { const t = ctx.project.read(f) || ''; const m = new RegExp('@\\w+\\s*[{(]\\s*' + esc + '\\s*,').exec(t); if (m) return { file: f, pos: m.index, line: lineOfIdx(t, m.index) }; }
      return null;
    }
    function jumpTo(view, kind, key) {
      const at = kind === 'cite' ? findCite(view, key) : findLabel(view, key);
      if (!at) return ctx.ui.toast(kind === 'cite' ? `No entry ${key} in the project’s .bib files.` : `No \\label{${key}} in the project.`, 'warn');
      dispatchEvent(new CustomEvent('stochatex:jump'));
      if (at.file !== ctx.editor.path) return ctx.goto(at.file, at.line);
      // the label sits inside the equation (or heading): land on the start of its line, so the drawn object shows
      const line = view.state.doc.lineAt(at.pos);
      const it = view.state.field(field, false)?.p.items.find(y => (y.kind === 'dmath' || y.kind === 'table' || y.kind === 'image') && at.pos >= y.from && at.pos <= y.to);
      const pos = it ? it.from : line.from;
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
      setTimeout(() => { try { view.dispatch({ effects: flashEff.of(pos) }); setTimeout(() => { try { view.dispatch({ effects: flashEff.of(null) }); } catch {} }, 1300); } catch {} }, 60);
    }
    let card = null, cardT = 0;
    function hideCard(ms) { clearTimeout(cardT); const go = () => { card?.remove(); card = null; }; if (ms) cardT = setTimeout(go, ms); else go(); }
    function showCard(view, anchor, kind, key, title) {
      clearTimeout(cardT); card?.remove();
      const body = h('div', { class: 'vz-card-body' });
      let foot = '';
      if (kind === 'cite') {
        const e = bib().get(key);
        if (e) body.append(h('div', { class: 'vz-card-cite' }, h('strong', {}, deTeX(e.author || '').replace(/\s+and\s+/g, ', ')), ' (' + (e.year || 'n.d.') + '). ', h('em', {}, deTeX(e.title || '')), e.journal ? '. ' + deTeX(e.journal) : ''));
        else body.append(h('div', { class: 'muted' }, title || key));
        foot = 'Click to go to the reference · Alt+click shows the LaTeX';
      } else {
        const at = findLabel(view, key);
        if (!at) body.append(h('div', { class: 'muted' }, `No \\label{${key}} in the project`));
        else {
          const it = at.file === ctx.editor.path ? view.state.field(field, false)?.p.items.find(y => y.kind === 'dmath' && at.pos >= y.from && at.pos <= y.to) : null;
          if (it && ready) { const r = renderMath(mathTex(it), true, view.state.field(field).p.info.macros, 0); const d = h('div', { class: 'vz-card-math' }); d.innerHTML = r.html || ''; body.append(d); }
          else { const ln = at.text.split('\n')[at.line - 1] || ''; body.append(h('div', { class: 'vz-card-line' }, deTeX(ln.replace(/\\label\{[^}]*\}/, '')).trim() || key)); }
          foot = (at.file !== ctx.editor.path ? at.file + ', ' : '') + 'line ' + at.line + ' · click to go there · Alt+click shows the LaTeX';
        }
      }
      card = h('div', { class: 'vz-card', role: 'tooltip' }, body, foot ? h('div', { class: 'vz-card-foot' }, foot) : null);
      card.addEventListener('mouseenter', () => clearTimeout(cardT)); card.addEventListener('mouseleave', () => hideCard(150));
      document.body.append(card);
      const r = anchor.getBoundingClientRect(), w = Math.min(460, card.offsetWidth);
      card.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      const below = r.bottom + 6; card.style.top = (below + card.offsetHeight < innerHeight - 8 ? below : Math.max(8, r.top - card.offsetHeight - 6)) + 'px';
    }
    // ---- tables you fill in like a word processor: click a cell, type, Tab to the next one
    let tableSess = null;
    class TableEditW extends WidgetType {
      constructor(from) { super(); this.from = from; }
      eq(o) { return o.from === this.from; }
      toDOM() { return tableSess?.el || h('div'); }
      ignoreEvent() { return true; }
    }
    // where the parts of the tabular starting at `from` are in the document now
    function locateTable(doc, from) {
      const m = /^\\begin\{(tabular\*?|tabularx|tabulary|longtable|array)\}/.exec(doc.slice(from, from + 40)); if (!m) return null;
      let j = from + m[0].length; while (/\s/.test(doc[j])) j++;
      if (doc[j] === '[') { j = doc.indexOf(']', j) + 1; while (/\s/.test(doc[j])) j++; }
      if (/tabular\*|tabularx|tabulary/.test(m[1]) && doc[j] === '{') { j = closeBrace(doc, j) + 1; while (/\s/.test(doc[j])) j++; }
      if (doc[j] !== '{') return null;
      const sc = closeBrace(doc, j); if (sc < 0) return null;
      const endRe = new RegExp('\\\\end\\{' + m[1].replace('*', '\\*') + '\\}', 'g'); endRe.lastIndex = sc;
      const e = endRe.exec(doc); if (!e) return null;
      return { env: m[1], specFrom: j + 1, specTo: sc, bodyFrom: sc + 1, bodyTo: e.index };
    }
    function startTable(view, it, e, at) {
      if (tableSess) finishTable(true);
      if (session) finishEdit(true);
      const doc = view.state.doc.toString(), loc = locateTable(doc, it.from); if (!loc) return reveal(view, it.from + 1)(e || { button: 0, preventDefault() {} });
      const t = TE.parseTable(doc.slice(loc.specFrom, loc.specTo), doc.slice(loc.bodyFrom, loc.bodyTo));
      if (!t.rows.length) TE.addRow(t, -1);
      // which cell was clicked: the drawn rows are the table's rows, the drawn cells follow colspan
      let r = 0, c = 0;
      const td = e?.target?.closest?.('td');
      if (td) { const tr = td.parentElement; r = [...tr.parentElement.children].indexOf(tr); c = [...tr.children].slice(0, [...tr.children].indexOf(td)).reduce((a, x) => a + (x.colSpan || 1), 0); }
      if (at) ({ r, c } = at);
      r = Math.max(0, Math.min(r, t.rows.length - 1)); c = Math.max(0, Math.min(c, t.cols.length - 1));
      const el = h('div', { class: 'vz-tabedit' });
      tableSess = { view, from: it.from, t, el, r, c, sel: null, timer: 0, macros: view.state.field(field).p.info.macros, dirty: false, latex: !!ctx.settings.get('table-latex', false) };
      loadMathLive().catch(() => {});
      buildTableUI();
      poke();
      setTimeout(() => focusCell(r, c, true), 30);
      document.addEventListener('mousedown', tableAway, true);
    }
    const tableAway = (e) => {
      if (!tableSess) return document.removeEventListener('mousedown', tableAway, true);
      if (tableSess.el.contains(e.target) || e.target.closest?.('.menu, .ui-menu-container, .modal, .toasts, .vz-tabgrid, .ML__popover, #mathlive-suggestion-popover, .ML__keyboard, .vz-sym, .vz-cellbar, .eqside, [data-tb="equation"]')) return;
      finishTable(true);
    };
    // keep the table where it is on screen while it changes (and while what is above it is re-measured):
    // for a moment after each change, any shift of the table is scrolled back; scrolling yourself stops it
    function pinTable(fn) {
      const S = tableSess; if (!S) return fn && fn();
      const sc = S.view.scrollDOM, y0 = S.el.getBoundingClientRect().top;
      const r = fn ? fn() : undefined;
      if (S.pinStop) S.pinStop();
      let stop = false, t0 = performance.now();
      const user = () => { stop = true; };
      sc.addEventListener('wheel', user, { passive: true, once: true }); sc.addEventListener('touchmove', user, { passive: true, once: true });
      // measured inside the editor's own layout pass, after its own scroll corrections, so the two never add up
      const tick = () => {
        if (stop || tableSess !== S || !S.el.isConnected) return done();
        S.view.requestMeasure({ key: 'vz-pin-table', read: () => S.el.isConnected ? S.el.getBoundingClientRect().top : y0, write: (top) => {
          if (stop) return done();
          const dy = top - y0; if (Math.abs(dy) > 0.5) sc.scrollTop += dy;
          if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else done();
        } });
      };
      const done = () => { sc.removeEventListener('wheel', user); sc.removeEventListener('touchmove', user); if (S.pinStop === halt) S.pinStop = null; };
      const halt = () => { stop = true; }; S.pinStop = halt;
      tick();
      return r;
    }
    function writeTable() {
      const S = tableSess; if (!S) return;
      clearTimeout(S.timer); if (!S.dirty) return; S.dirty = false;
      const v = S.view, doc = v.state.doc.toString(), loc = locateTable(doc, S.from); if (!loc) return;
      const { spec, body } = TE.serializeTable(S.t);
      const changes = [];
      if (doc.slice(loc.specFrom, loc.specTo) !== spec) changes.push({ from: loc.specFrom, to: loc.specTo, insert: spec });
      if (doc.slice(loc.bodyFrom, loc.bodyTo) !== body) changes.push({ from: loc.bodyFrom, to: loc.bodyTo, insert: body });
      if (changes.length) pinTable(() => v.dispatch({ changes, userEvent: 'input.table' }));
    }
    const changed = () => { const S = tableSess; if (!S) return; S.dirty = true; clearTimeout(S.timer); S.timer = setTimeout(writeTable, 350); };
    function finishTable(save) {
      const S = tableSess; if (!S) return;
      if (save) { syncCell(); writeTable(); }
      document.removeEventListener('mousedown', tableAway, true);
      if (S.cellMath) { try { S.cellMath.finish('quiet'); } catch {} }
      if (S.fullMath) dispatchEvent(new CustomEvent('stochatex:close-math'));
      tableSess = null; poke();
    }
    const cellTd = (r, c) => tableSess?.el.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
    // a cell typed in visually: its text (bold / italic), maths chips and locked chips back to LaTeX
    function domParts(node, style = {}, out = []) {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { if (n.data) out.push({ t: 'text', s: n.data.replace(/[\u200b]/g, '').replace(/\u00a0/g, ' '), ...(style.b ? { b: true } : {}), ...(style.i ? { i: true } : {}) }); continue; }
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('vz-cm')) { out.push({ t: 'math', tex: n.dataset.tex }); continue; }
        if (n.classList.contains('vz-craw')) { out.push({ t: 'raw', tex: n.dataset.tex }); continue; }
        if (n.tagName === 'MATH-FIELD') { out.push({ t: 'math', tex: tidyTeX(n.getValue('latex')) }); continue; }
        if (n.tagName === 'BR') { out.push({ t: 'text', s: ' ' }); continue; }
        const fw = n.style?.fontWeight, fs = n.style?.fontStyle;
        domParts(n, { b: style.b || /^(B|STRONG)$/.test(n.tagName) || fw === 'bold' || +fw >= 600, i: style.i || /^(I|EM)$/.test(n.tagName) || fs === 'italic' }, out);
      }
      return out;
    }
    const cellText = (td) => td.classList.contains('visual') ? TE.partsTex(domParts(td)).replace(/\s+$/, '') : td.textContent.replace(/\n/g, ' ');
    function syncCell() { const S = tableSess; if (!S) return; const td = S.el.querySelector('td.editing'); if (!td) return; const cell = S.t.rows[+td.dataset.r]?.cells[+td.dataset.i]; const v = cellText(td); if (cell && cell.tex !== v) { cell.tex = v; S.dirty = true; } }
    function drawCell(td, cell) { td.classList.remove('editing', 'visual'); td.contentEditable = 'false'; td.innerHTML = cell.tex.trim() ? inlineHtml(cell.tex, tableSess.macros) : '<span class="vz-empty">&nbsp;</span>'; }
    const mathChip = (tex) => { const sp = h('span', { class: 'vz-cm', contenteditable: 'false', 'data-tex': tex, title: 'Click to edit this maths' }); const r = ready ? renderMath(tex, false, tableSess?.macros) : null; if (r && r.html) sp.innerHTML = r.html; else sp.textContent = tex; return sp; };
    const rawChip = (tex) => h('span', { class: 'vz-craw', contenteditable: 'false', 'data-tex': tex, title: 'LaTeX kept as it is (switch the table to LaTeX to change it)' }, tex);
    function fillVisual(td, tex) {
      td.textContent = '';
      for (const p of TE.cellParts(tex) || []) {
        if (p.t === 'math') td.append(mathChip(p.tex));
        else if (p.t === 'raw') td.append(rawChip(p.tex));
        else { let n = document.createTextNode(p.s); if (p.i) { const x = document.createElement('i'); x.append(n); n = x; } if (p.b) { const x = document.createElement('b'); x.append(n); n = x; } td.append(n); }
      }
    }
    // maths in a cell is edited like an equation: a live field where the chip was
    async function editMath(td, chip) {
      const S = tableSess; if (!S) return;
      let MFc; try { MFc = await loadMathLive(); } catch (e) { return ctx.ui.toast('The equation editor could not be loaded: ' + e.message, 'err'); }
      if (!MFc || !chip.isConnected) return;
      const mf = document.createElement('math-field');
      mf.smartFence = false; mf.smartSuperscript = false; mf.mathVirtualKeyboardPolicy = 'manual';
      const stk = (x) => (window.StochaBrackets?.stackAccents ? window.StochaBrackets.stackAccents(x) : x);
      mf.value = stk(chip.dataset.tex || ''); mf.className = 'vz-cellmath';
      td.contentEditable = 'false';
      chip.replaceWith(mf);
      let done = false;
      // the same floating bar as for equations: format, accents and braces, symbols, and the full editor
      const cbtn = (label, title, fn, cls = '') => h('button', { class: cls, title, 'aria-label': title.split(/[(:]/)[0].trim(), onMousedown: (e) => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget, e); } }, label);
      const cbar = h('div', { class: 'vz-cellbar', role: 'toolbar', 'aria-label': 'Maths in this cell' },
        h('span', { class: 'vz-cellbar-end' },
          cbtn(h('span', { class: 'vz-ib vz-om' }, 'Ω'), 'Insert a symbol: Greek letters, operators, relations, arrows (Ctrl+Shift+S)', (b) => symbolPop(b, mf)),
          cbtn(ico('expand'), 'Open in the full equation editor, beside the paper (Ctrl+E)', () => openCellMathFull(td)),
          cbtn(ico('check'), 'Done (Enter or Esc)', () => finish(), 'primary')),
        buildFmtBar(mf, cbtn));
      document.body.append(cbar);
      const place = () => { if (!cbar.isConnected || !mf.isConnected) return; const r = mf.getBoundingClientRect(); cbar.style.left = Math.max(8, Math.min(innerWidth - cbar.offsetWidth - 8, r.left)) + 'px'; cbar.style.top = (r.bottom + 6 + cbar.offsetHeight < innerHeight ? r.bottom + 6 : Math.max(8, r.top - cbar.offsetHeight - 6)) + 'px'; };
      const ro = new ResizeObserver(place); ro.observe(mf); S.view.scrollDOM.addEventListener('scroll', place, { passive: true });
      S.cellMath = { td, mf, finish: () => finish() };
      const finish = (move) => {
        if (done) return; done = true;
        ro.disconnect(); S.view.scrollDOM.removeEventListener('scroll', place); cbar.remove(); closeSym(); if (S.cellMath?.mf === mf) S.cellMath = null;
        const tex = tidyTeX(mf.getValue('latex')).trim();
        const next = tex ? mathChip(tex) : document.createTextNode('');
        mf.replaceWith(next);
        td.contentEditable = 'true';
        const cell = S.t.rows[+td.dataset.r].cells[+td.dataset.i]; cell.tex = cellText(td); changed();
        if (move === 'tab') { focusCell(...nextCell(+td.dataset.r, +td.dataset.c)); return next; }
        if (move !== 'quiet') { td.focus(); const rg = document.createRange(); rg.setStartAfter(next); rg.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg); }
        return next;
      };
      S.cellMath.finish = (m) => finish(m);
      mf.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && mf.mode === 'latex') return;             // finishing a typed \command: MathLive accepts it
        if (e.key === 'Escape' && mf.mode === 'latex') return;
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopPropagation(); return openCellMathFull(td); }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); return symbolPop(cbar.querySelector('.vz-cellbar-end button'), mf); }
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(); }
        else if (e.key === 'Tab' && !mf.querySelector?.('[part="placeholder"]') && !/\\placeholder/.test(mf.getValue('latex'))) { e.preventDefault(); e.stopPropagation(); finish('tab'); }
        else if (e.key === 'ArrowRight' && mf.position === mf.lastOffset) { e.preventDefault(); finish(); }
      }, true);
      mf.addEventListener('input', () => { const cell = S.t.rows[+td.dataset.r].cells[+td.dataset.i]; cell.tex = TE.partsTex(domParts(td)); changed(); });
      mf.addEventListener('focusout', () => setTimeout(() => { if (!mf.isConnected || document.activeElement === mf || mf.contains(document.activeElement) || document.activeElement?.closest?.('.vz-sym, .vz-cellbar')) return; if (document.querySelector('.ML__popover[style*="visible"]')) return; finish(); }, 120));
      requestAnimationFrame(() => {
        try { window.StochaBrackets?.setupField(mf, { note: (m) => ctx.ui.toast(m) }); } catch {}
        try { const mm = mlMacros(S.macros); if (Object.keys(mm).length) { mf.macros = { ...mf.macros, ...mm }; mf.value = stk(chip.dataset.tex || ''); } } catch {}
        mf.focus(); if (mf.value) mf.executeCommand('moveToMathfieldEnd');
        place();
      });
    }
    // maths in a table cell, in the full equation editor beside the paper: what changes there goes into the cell
    function openCellMathFull(td) {
      const S = tableSess; if (!S || !td?.isConnected) return;
      let chip = null;
      if (S.cellMath?.td === td) chip = S.cellMath.finish('quiet');                           // the field that is open
      if (!chip || chip.nodeType !== 1) { const sl = getSelection(); chip = [...td.querySelectorAll('.vz-cm')].find(c => sl.rangeCount && sl.getRangeAt(0).intersectsNode(c)) || td.querySelector('.vz-cm'); }
      if (!chip) { chip = mathChip(''); const sl = getSelection(); if (sl.rangeCount && td.contains(sl.anchorNode)) { const rg = sl.getRangeAt(0); rg.collapse(false); rg.insertNode(chip); } else td.append(chip); }
      const r = +td.dataset.r, i = +td.dataset.i, k = [...td.querySelectorAll('.vz-cm')].indexOf(chip);
      const cell = () => (tableSess === S ? S.t.rows[r]?.cells[i] : null);
      // write one maths part of the cell (the k-th), keeping the text around it
      const setMath = (tex) => {
        const c = cell(); if (!c) return;
        const parts = TE.cellParts(c.tex) || []; let n = -1, hit = false;
        for (const p of parts) if (p.t === 'math' && ++n === k) { p.tex = tex; hit = true; }
        if (!hit) parts.push({ t: 'math', tex });
        c.tex = TE.partsTex(parts); S.dirty = true; changed();
        const cur = S.el.querySelector(`td[data-r="${r}"][data-i="${i}"]`);
        if (cur) { if (cur.classList.contains('visual')) { const chips = cur.querySelectorAll('.vz-cm'); const old = chips[k]; if (old) old.replaceWith(mathChip(tex)); else fillVisual(cur, c.tex); } else if (!cur.classList.contains('editing')) drawCell(cur, c); }
      };
      S.fullMath = { r, i, k };
      dispatchEvent(new CustomEvent('stochatex:open-math', { detail: {
        latex: chip.dataset.tex || '', where: `maths in the table, row ${r + 1}, column ${+td.dataset.c + 1}`,
        onChange: (tex) => setMath(tex),
        onClose: () => { if (S.fullMath?.r === r && S.fullMath?.i === i) S.fullMath = null; },
      } }));
    }
    // Σ / Ctrl+E while a table cell is being edited: its maths goes to the full editor
    window.__stxMathTarget = () => {
      const S = tableSess; if (!S) return null;
      const td = S.cellMath?.td || S.el.querySelector('td.editing.visual'); if (!td) return null;
      openCellMathFull(td); return 'handled';
    };
    function insertMath(td) {
      const chip = mathChip('');
      const sl = getSelection();
      if (sl.rangeCount && td.contains(sl.anchorNode)) { const rg = sl.getRangeAt(0); rg.deleteContents(); rg.insertNode(chip); } else td.append(chip);
      editMath(td, chip);
    }
    const nextCell = (r, c) => { const t = tableSess.t, row = t.rows[r], span = row.cells[TE.cellAt(row, c)].span; return c + span < t.cols.length ? [r, c + span, true] : r + 1 < t.rows.length ? [r + 1, 0, true] : [r, c, false]; };
    function focusCell(r, c, selectAll) {
      const S = tableSess; if (!S) return;
      r = Math.max(0, Math.min(r, S.t.rows.length - 1)); c = Math.max(0, Math.min(c, S.t.cols.length - 1));
      const i = TE.cellAt(S.t.rows[r], c); c = TE.colOf(S.t.rows[r], i);
      if (S.cellMath) { try { S.cellMath.finish('quiet'); } catch {} }           // maths open in another cell: close it first
      const old = S.el.querySelector('td.editing');
      if (old) { syncCell(); drawCell(old, S.t.rows[+old.dataset.r].cells[+old.dataset.i]); }
      S.r = r; S.c = c;
      const td = cellTd(r, c); if (!td) return;
      const cell = S.t.rows[r].cells[i];
      td.classList.add('editing');
      if (!S.latex && TE.visualOk(cell.tex)) {             // like the equation editor: type into the drawn cell
        td.classList.add('visual'); fillVisual(td, cell.tex); td.contentEditable = 'true';
      } else {
        td.textContent = cell.tex;
        try { td.contentEditable = 'plaintext-only'; } catch { td.contentEditable = 'true'; }
        if (td.contentEditable !== 'plaintext-only') td.contentEditable = 'true';
        if (!S.latex) td.title = 'This cell has LaTeX that cannot be shown as you type, so it shows its code';
      }
      td.focus({ preventScroll: true });
      { const b = td.getBoundingClientRect(), v = S.view.scrollDOM.getBoundingClientRect(); if (b.top < v.top || b.bottom > v.bottom) td.scrollIntoView({ block: 'nearest' }); }
      const rg = document.createRange(); rg.selectNodeContents(td); if (!selectAll) rg.collapse(false);
      const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
      markSel(); syncBar();
    }
    function markSel() {
      const S = tableSess; const q = S.sel;
      S.el.querySelectorAll('td[data-r]').forEach(x => { const r = +x.dataset.r, c = +x.dataset.c, w = x.colSpan || 1; x.classList.toggle('sel', !!q && r >= q.r0 && r <= q.r1 && c <= q.c1 && c + w - 1 >= q.c0); });
      S.el.classList.toggle('has-cells', !!q);
    }
    // a block of cells (rows r0..r1, columns c0..c1), widened to cover merged cells it cuts through
    function rect(a, b) {
      const t = tableSess.t; let q = { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
      for (let again = true; again; ) { again = false; for (let r = q.r0; r <= q.r1; r++) { const row = t.rows[r]; for (const [i, cell] of row.cells.entries()) { const x = TE.colOf(row, i), y = x + cell.span - 1; if (y >= q.c0 && x <= q.c1 && (x < q.c0 || y > q.c1)) { q.c0 = Math.min(q.c0, x); q.c1 = Math.max(q.c1, y); again = true; } } } }
      return q;
    }
    function selectCells(q) {
      const S = tableSess; if (!S) return;
      const td = S.el.querySelector('td.editing'); if (td) { syncCell(); drawCell(td, S.t.rows[+td.dataset.r].cells[+td.dataset.i]); }
      S.sel = q; S.el.tabIndex = -1; S.el.focus({ preventScroll: true }); getSelection().removeAllRanges();
      markSel(); syncBar();
    }
    const selList = () => { const S = tableSess, q = S.sel, out = new Set(); if (!q) return [S.t.rows[S.r].cells[TE.cellAt(S.t.rows[S.r], S.c)]]; for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) out.add(S.t.rows[r].cells[TE.cellAt(S.t.rows[r], c)]); return [...out]; };
    // copy: plain text with tabs (Excel, Word), a small HTML table, and the cells' LaTeX for pasting back here
    function copyCells(cut, whole) {
      const S = tableSess; if (!S) return; syncCell();
      const q = whole || !S.sel ? (whole ? { r0: 0, r1: S.t.rows.length - 1, c0: 0, c1: S.t.cols.length - 1 } : { r0: S.r, r1: S.r, c0: S.c, c1: S.c }) : S.sel;
      const grid = TE.copyGrid(S.t, q);
      const put = (e) => { e.clipboardData.setData('text/plain', TE.gridText(grid)); e.clipboardData.setData('text/html', TE.gridHtml(grid)); try { e.clipboardData.setData('text/x-stochatex-cells', JSON.stringify(grid)); } catch {} e.preventDefault(); };
      document.addEventListener('copy', put, { once: true, capture: true });
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      document.removeEventListener('copy', put, { capture: true });
      if (!ok) { try { navigator.clipboard.writeText(TE.gridText(grid)); ok = true; } catch {} }
      const n = `${q.r1 - q.r0 + 1} × ${q.c1 - q.c0 + 1}`;
      if (cut) clearCells();
      ctx.ui.toast(ok ? `${cut ? 'Cut' : 'Copied'} ${whole ? 'the table' : n + ' cell' + (n === '1 × 1' ? '' : 's')}: paste here, in Excel or in Word.` : 'The browser did not allow copying.');
    }
    // the whole table: a real table for Word and Excel (HTML), its complete LaTeX for any text or LaTeX editor,
    // and its cells for pasting into another StochaTeX table
    function copyTable() {
      const S = tableSess; if (!S) return; syncCell(); writeTable();
      const doc = S.view.state.doc.toString(), loc = locateTable(doc, S.from); if (!loc) return;
      let a = S.from, b = doc.indexOf('}', loc.bodyTo) + 1;
      // inside a table float (or table*, threeparttable …)? take all of it, with the caption and label
      const env = /\\begin\{(table\*?|threeparttable|sidewaystable|longtable)\}/g; let best = null;
      for (let m; (m = env.exec(doc.slice(0, a))); ) { const end = doc.indexOf(`\\end{${m[1]}}`, b); if (end >= 0 && !doc.slice(m.index, a).includes(`\\end{${m[1]}}`)) best = [m.index, end + `\\end{${m[1]}}`.length]; }
      if (best) [a, b] = best;
      const latex = doc.slice(a, b), grid = TE.copyGrid(S.t, { r0: 0, r1: S.t.rows.length - 1, c0: 0, c1: S.t.cols.length - 1 });
      const put = (e) => { e.clipboardData.setData('text/plain', latex); e.clipboardData.setData('text/html', TE.gridHtml(grid)); try { e.clipboardData.setData('text/x-stochatex-cells', JSON.stringify(grid)); } catch {} e.preventDefault(); };
      document.addEventListener('copy', put, { once: true, capture: true });
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      document.removeEventListener('copy', put, { capture: true });
      if (!ok) { try { navigator.clipboard.writeText(latex); ok = true; } catch {} }
      ctx.ui.toast(ok ? `Copied the whole table${best ? ' (with its caption and label)' : ''}: it pastes as a table in Word and Excel, and as LaTeX in any LaTeX editor.` : 'The browser did not allow copying.');
    }
    function clearCells() {
      const S = tableSess, gone = new Set(selList());
      pinTable(() => {
        for (const cell of gone) cell.tex = '';
        S.el.querySelectorAll('td[data-r]').forEach(td => { const cell = S.t.rows[+td.dataset.r]?.cells[+td.dataset.i]; if (gone.has(cell) && !td.classList.contains('editing')) drawCell(td, cell); });
        S.dirty = true; writeTable();
      });
    }
    // keys while a block of cells is selected
    function selKey(e) {
      const S = tableSess; if (!S || !S.sel || e.target !== S.el || document.activeElement !== S.el) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), q = S.sel, t = S.t;
      const anchor = S.anchor || { r: q.r0, c: q.c0 };
      if (mod && k === 'c') { e.preventDefault(); return copyCells(false); }
      if (mod && k === 'x') { e.preventDefault(); return copyCells(true); }
      if (mod && k === 'a') { e.preventDefault(); return selectCells({ r0: 0, r1: t.rows.length - 1, c0: 0, c1: t.cols.length - 1 }); }
      if (mod && (k === 'b' || k === 'i')) { e.preventDefault(); return wrapCell(k === 'b' ? 'bold' : 'italic'); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return clearCells(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); S.sel = null; markSel(); return focusCell(anchor.r, anchor.c, false); }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const far = { r: q.r0 === anchor.r ? q.r1 : q.r0, c: q.c0 === anchor.c ? q.c1 : q.c0 };
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
        const to = { r: Math.max(0, Math.min(t.rows.length - 1, far.r + d[0])), c: Math.max(0, Math.min(t.cols.length - 1, far.c + d[1])) };
        if (e.shiftKey) return selectCells(rect(anchor, to));
        S.sel = null; markSel(); return focusCell(to.r, to.c);
      }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); S.sel = null; markSel(); return focusCell(anchor.r, anchor.c); }
      if (!mod && e.key.length === 1) { e.preventDefault(); S.sel = null; markSel(); focusCell(anchor.r, anchor.c, true); document.execCommand('insertText', false, e.key); }   // typing replaces the first cell, as in Excel
    }
    function renderGrid() {
      const S = tableSess, t = S.t;
      const table = h('table', { class: 'vz-table vz-table-edit' });
      const style = TE.ruleStyle(t);
      t.rows.forEach((row, r) => {
        const cls = (row.pre || '').match(/\\(toprule|midrule|hline|cmidrule|cline|addlinespace)/g)?.map(x => 'r-' + x.slice(1).replace('cline', 'cmid').replace('cmidrule', 'cmid').replace('addlinespace', 'space')).join(' ') || '';
        const tr = h('tr', { class: cls + (r === t.rows.length - 1 && /\\(bottomrule|hline)/.test(t.trail) ? ' after-' + (/bottomrule/.test(t.trail) ? 'bottomrule' : 'hline') : '') });
        row.cells.forEach((cell, i) => {
          const c = TE.colOf(row, i), col = t.cols[c];
          const al = cell.malign ? (/r/.test(cell.malign) ? 'right' : /c/.test(cell.malign) ? 'center' : 'left') : col.align === 'r' ? 'right' : col.align === 'c' ? 'center' : 'left';
          const td = h('td', { 'data-r': r, 'data-c': c, 'data-i': i, style: { textAlign: al }, spellcheck: 'false' });
          if (cell.span > 1) td.colSpan = cell.span;
          if (style === 'grid') td.classList.add('grid');
          drawCell(td, cell);
          td.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.shiftKey) { e.preventDefault(); const a = S.anchor || { r: S.r, c: S.c }; S.anchor = a; return selectCells(rect(a, { r, c: c + cell.span - 1 })); }
            S.drag = { r, c }; S.anchor = { r, c };
            if (td.classList.contains('editing') && !S.sel) return;
            e.preventDefault();
            S.sel = null; markSel(); focusCell(r, c);
          });
          td.addEventListener('mouseover', (e) => {
            if (!S.drag || !(e.buttons & 1) || (S.drag.r === r && S.drag.c === c && !S.sel)) return;
            S.anchor = S.drag; selectCells(rect(S.drag, { r, c: c + cell.span - 1 }));
          });
          td.addEventListener('input', (e) => { if (e.target !== td) return; const cl = S.t.rows[r].cells[i]; cl.tex = cellText(td); changed(); });
          td.addEventListener('click', (e) => { const chip = e.target.closest?.('.vz-cm'); if (chip && td.classList.contains('visual')) { e.preventDefault(); editMath(td, chip); } });
          td.addEventListener('beforeinput', (e) => {
            if (!td.classList.contains('visual') || e.target !== td && e.target.closest?.('math-field')) return;
            if (e.inputType === 'insertText' && e.data === '$') { e.preventDefault(); insertMath(td); }        // $ starts maths, as in LaTeX
            else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
          });
          td.addEventListener('keydown', (e) => tableKey(e, r, c, td));
          td.addEventListener('paste', (e) => pasteCells(e, r, c));
          tr.append(td);
        });
        table.append(tr);
      });
      return table;
    }
    // paste from a spreadsheet or Word: tab-separated rows fill the cells from here, adding rows and columns as needed
    function pasteCells(e, r0, c0) {
      const text = e.clipboardData?.getData('text/plain') || '';
      const ownCells = (e.clipboardData?.types || []).includes('text/x-stochatex-cells');
      if (!ownCells && !/\t|\n./.test(text.trim())) { if (e.target.closest?.('td.visual')) { e.preventDefault(); document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' ')); } return; }
      e.preventDefault(); const S = tableSess, t = S.t;
      let own = null; try { own = JSON.parse(e.clipboardData.getData('text/x-stochatex-cells') || 'null'); } catch {}
      const grid = own || text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
      while (t.rows.length < r0 + grid.length) TE.addRow(t, t.rows.length - 1);
      const w = Math.max(...grid.map(g => g.length)); while (t.cols.length < c0 + w) TE.addCol(t, t.cols.length - 1);
      const escTeX = (x) => x.replace(/([&%#_])/g, '\\$1');
      grid.forEach((g, dr) => g.forEach((v, dc) => { const row = t.rows[r0 + dr]; row.cells[TE.cellAt(row, c0 + dc)].tex = own ? v : escTeX(v.trim()); }));
      S.dirty = true; pinTable(() => { buildTableUI(); writeTable(); focusCell(r0, c0); });
      ctx.ui.toast(`Pasted ${grid.length} × ${w} cells.`);
    }
    function tableKey(e, r, c, td) {
      if (e.target !== td && (e.target.tagName === 'MATH-FIELD' || e.target.closest?.('math-field'))) return;      // keys in a maths field are its own
      const S = tableSess, t = S.t, row = t.rows[r], span = row.cells[TE.cellAt(row, c)].span;
      const atStart = () => { const sl = getSelection(); if (!sl.rangeCount || !sl.isCollapsed) return false; const rg = sl.getRangeAt(0).cloneRange(); rg.selectNodeContents(td); rg.setEnd(sl.anchorNode, sl.anchorOffset); return rg.toString().length === 0; };
      const atEnd = () => { const sl = getSelection(); if (!sl.rangeCount || !sl.isCollapsed) return false; const rg = sl.getRangeAt(0).cloneRange(); rg.selectNodeContents(td); rg.setStart(sl.anchorNode, sl.anchorOffset); return rg.toString().length === 0; };
      const mod = e.ctrlKey || e.metaKey;
      const go = (r2, c2, all = true) => { e.preventDefault(); S.sel = null; focusCell(r2, c2, all); };
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) { if (c > 0) go(r, c - 1); else if (r > 0) go(r - 1, t.cols.length - 1); return; }
        if (c + span < t.cols.length) return go(r, c + span);
        if (r + 1 < t.rows.length) return go(r + 1, 0);
        syncCell(); TE.addRow(t, r); S.dirty = true; buildTableUI(); changed(); return go(r + 1, 0);       // Tab in the last cell adds a row, as in Word
      }
      if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) return go(Math.max(0, r - 1), c); if (r + 1 < t.rows.length) return go(r + 1, c); syncCell(); TE.addRow(t, r); S.dirty = true; buildTableUI(); changed(); return go(r + 1, c); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishTable(true); S.view.focus(); return; }
      if (e.key === 'ArrowUp' && !e.shiftKey && r > 0) return go(r - 1, c, false);
      if (e.key === 'ArrowDown' && !e.shiftKey && r + 1 < t.rows.length) return go(r + 1, c, false);
      if (e.key === 'ArrowLeft' && !e.shiftKey && atStart() && (c > 0 || r > 0)) return c > 0 ? go(r, c - 1, false) : go(r - 1, t.cols.length - 1, false);
      if (e.key === 'ArrowRight' && !e.shiftKey && atEnd() && (c + span < t.cols.length || r + 1 < t.rows.length)) { e.preventDefault(); S.sel = null; focusCell(c + span < t.cols.length ? r : r + 1, c + span < t.cols.length ? c + span : 0, false); const sl = getSelection(); sl.collapse(cellTd(S.r, S.c), 0); return; }
      if (e.shiftKey && !mod && ((e.key === 'ArrowRight' && atEnd() && c + span < t.cols.length) || (e.key === 'ArrowLeft' && atStart() && c > 0) || (e.key === 'ArrowDown' && r + 1 < t.rows.length) || (e.key === 'ArrowUp' && r > 0))) {
        e.preventDefault(); S.anchor = { r, c };
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, span] }[e.key];
        return selectCells(rect({ r, c }, { r: r + d[0], c: c + d[1] }));
      }
      if (mod && e.key.toLowerCase() === 'a') { const sl = getSelection(); if (sl.toString().length >= td.textContent.length) { e.preventDefault(); S.anchor = { r, c }; return selectCells({ r0: 0, r1: t.rows.length - 1, c0: 0, c1: t.cols.length - 1 }); } }
      if (mod && !e.shiftKey && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) { e.preventDefault(); return styleSel(e.key.toLowerCase() === 'b' ? 'bold' : 'italic'); }
      if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); return td.classList.contains('visual') ? insertMath(td) : wrapCell('math'); }
      if (mod && e.key === 'Enter') { e.preventDefault(); return op('rowBelow'); }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'e' && td.classList.contains('visual')) { e.preventDefault(); return openCellMathFull(td); }
    }
    // bold / italic: the selected words when typing visually, else the whole cell
    function styleSel(kind) {
      const S = tableSess, td = S?.el.querySelector('td.editing.visual'), sl = getSelection();
      if (td && sl.rangeCount && !sl.isCollapsed && td.contains(sl.anchorNode)) { document.execCommand('styleWithCSS', false, false); document.execCommand(kind); const cell = S.t.rows[+td.dataset.r].cells[+td.dataset.i]; cell.tex = cellText(td); changed(); return; }
      wrapCell(kind);
    }
    function wrapCell(kind) {
      const S = tableSess; syncCell();
      const cells = selList(), keep = S.sel;
      for (const cell of cells) cell.tex = TE.toggleWrap(cell.tex, kind);
      S.dirty = true; changed(); const { r, c } = S;
      pinTable(() => { buildTableUI(); if (keep) selectCells(keep); else focusCell(r, c, true); });
    }
    function op(name) {
      const S = tableSess; if (!S) return; syncCell();
      const t = S.t; let { r, c } = S;
      switch (name) {
        case 'rowAbove': r = TE.addRow(t, r, false); break;
        case 'rowBelow': r = TE.addRow(t, r, true); break;
        case 'colLeft': c = TE.addCol(t, c, false); break;
        case 'colRight': { const rw = t.rows[r]; c = TE.addCol(t, c + rw.cells[TE.cellAt(rw, c)].span - 1, true); break; }
        case 'delRow': r = TE.deleteRow(t, r); break;
        case 'delCol': c = TE.deleteCol(t, c); break;
        case 'alL': case 'alC': case 'alR': TE.setAlign(t, c, name === 'alL' ? 'l' : name === 'alC' ? 'c' : 'r'); break;
        case 'merge': if (S.sel && S.sel.r0 === S.sel.r1) { TE.merge(t, S.sel.r0, S.sel.c0, S.sel.c1); r = S.sel.r0; c = S.sel.c0; S.sel = null; } break;
        case 'split': TE.split(t, r, c); break;
        case 'book': case 'grid': case 'none': TE.setRules(t, name); break;
      }
      S.dirty = true; pinTable(() => { buildTableUI(); writeTable(); focusCell(r, c); });
    }
    function syncBar() {
      const S = tableSess; if (!S?.bar) return;
      const row = S.t.rows[S.r], cell = row?.cells[TE.cellAt(row, S.c)];
      S.bar.querySelector('[data-op="merge"]').disabled = !(S.sel && S.sel.r0 === S.sel.r1 && S.sel.c1 > S.sel.c0);
      S.bar.querySelector('[data-op="split"]').disabled = !(cell && (cell.span > 1 || cell.malign));
      const al = S.t.cols[S.c]?.align;
      for (const k of ['alL', 'alC', 'alR']) S.bar.querySelector(`[data-op="${k}"]`).classList.toggle('on', al === k.slice(2).toLowerCase());
      const st = TE.ruleStyle(S.t);
      S.bar.querySelectorAll('[data-rules]').forEach(b => b.classList.toggle('on', b.dataset.rules === st));
      S.where.textContent = S.sel ? `${S.sel.r1 - S.sel.r0 + 1} × ${S.sel.c1 - S.sel.c0 + 1} cells selected · Ctrl+C copies` : `Row ${S.r + 1} of ${S.t.rows.length} · column ${S.c + 1} of ${S.t.cols.length}`;
    }
    function buildTableUI() {
      const S = tableSess;
      const b = (k, title, label) => h('button', { 'data-op': k, title, 'aria-label': title.split(/[(:]/)[0].trim(), onMousedown: (e) => { e.preventDefault(); if (!e.currentTarget.disabled) op(k); } }, label || ico(k, 15));
      const sep = () => h('span', { class: 'vz-bsep' });
      const rules = h('span', { class: 'vz-seg' }, ...[['book', 'Book style: lines at the top, under the header and at the bottom (booktabs)', 'Book'], ['grid', 'Grid: a line around every cell', 'Grid'], ['none', 'No lines', 'None']].map(([k, title, l]) => h('button', { 'data-rules': k, title, onMousedown: (e) => { e.preventDefault(); op(k); } }, l)));
      S.where = h('span', { class: 'vz-tabwhere' });
      S.bar = h('div', { class: 'vz-tabbar', role: 'toolbar', 'aria-label': 'Table' },
        b('rowAbove', 'Insert a row above'), b('rowBelow', 'Insert a row below (Ctrl+Enter; Tab in the last cell also adds one)'), b('colLeft', 'Insert a column to the left'), b('colRight', 'Insert a column to the right'),
        b('delRow', 'Delete this row'), b('delCol', 'Delete this column'), sep(),
        b('alL', 'Align the column left'), b('alC', 'Centre the column'), b('alR', 'Align the column right (numbers)'), sep(),
        h('button', { title: 'Bold (Ctrl+B): the selected words, or the whole cell', onMousedown: (e) => { e.preventDefault(); styleSel('bold'); } }, h('b', {}, 'B')),
        h('button', { title: 'Italic (Ctrl+I): the selected words, or the whole cell', onMousedown: (e) => { e.preventDefault(); styleSel('italic'); } }, h('i', { style: { fontFamily: 'var(--serif, serif)' } }, 'I')),
        h('button', { title: 'Insert maths at the cursor, edited like an equation (Ctrl+M, or type $)', onMousedown: (e) => { e.preventDefault(); const td = S.el.querySelector('td.editing'); if (td?.classList.contains('visual')) insertMath(td); else wrapCell('math'); } }, h('span', { class: 'vz-om' }, '∑')), sep(),
        b('merge', 'Merge the selected cells of a row (drag across them, or Shift+click)'), b('split', 'Split a merged cell'), sep(),
        h('button', { title: 'Copy cells: the selected cells, or the cell you are in (Ctrl+C; Ctrl+X cuts). They paste into Excel, Word, or another table here', 'aria-label': 'Copy cells', onMousedown: (e) => { e.preventDefault(); copyCells(false); } }, ico('copy', 15)),
        h('button', { title: 'Copy the whole table: a table in Word and Excel, the complete LaTeX (with caption and label) in any LaTeX editor', 'aria-label': 'Copy the whole table', onMousedown: (e) => { e.preventDefault(); copyTable(); } }, ico('copyTable', 16)), sep(),
        rules, h('span', { class: 'spacer' }),
        h('button', { class: 'vz-latexsw' + (S.latex ? ' on' : ''), title: S.latex ? 'Cells show their LaTeX: click to type in them as drawn' : 'Show the LaTeX of the cells while you edit (click again to go back)', 'aria-pressed': String(S.latex), onMousedown: (e) => { e.preventDefault(); syncCell(); S.latex = !S.latex; ctx.settings.set('table-latex', S.latex); const { r, c } = S; buildTableUI(); focusCell(r, c, false); } }, 'LaTeX'),
        h('button', { title: 'Open the whole table as LaTeX in the source', onMousedown: (e) => { e.preventDefault(); const from = S.from; finishTable(true); S.view.dispatch({ selection: { anchor: from + 1 }, scrollIntoView: false }); S.view.focus(); } }, ico('code', 15)),
        h('button', { class: 'primary', title: 'Done (Esc)', onMousedown: (e) => { e.preventDefault(); finishTable(true); } }, ico('check', 15)));
      if (!S.listening) {
        S.listening = true;
        S.el.addEventListener('keydown', selKey);
        S.el.addEventListener('paste', (e) => { if (S.sel && document.activeElement === S.el) pasteCells(e, S.sel.r0, S.sel.c0); });
        const up = () => { if (tableSess === S) S.drag = null; }; document.addEventListener('mouseup', up, true);
        // dragging from inside a cell's text sends no mouseover to other cells: follow the pointer instead
        const move = (e) => {
          if (tableSess !== S) return document.removeEventListener('mousemove', move, true);
          if (!S.drag || !(e.buttons & 1)) return;
          const td = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('td[data-r]'); if (!td || !S.el.contains(td)) return;
          const r = +td.dataset.r, c = +td.dataset.c + (td.colSpan || 1) - 1;
          if (r === S.drag.r && +td.dataset.c === S.drag.c && !S.sel) return;
          S.anchor = S.drag; const q = rect(S.drag, { r, c });
          if (!S.sel || q.r0 !== S.sel.r0 || q.r1 !== S.sel.r1 || q.c0 !== S.sel.c0 || q.c1 !== S.sel.c1) selectCells(q);
        };
        document.addEventListener('mousemove', move, true);
        // pressing on selected text would start the browser's drag-and-drop of that text: select cells instead
        S.el.addEventListener('dragstart', (e) => { if (e.target.closest?.('math-field')) return; e.preventDefault(); });
      }
      S.el.replaceChildren(S.bar, h('div', { class: 'vz-tabgridwrap' }, renderGrid()), h('div', { class: 'vz-tabfoot' }, S.where), h('div', { class: 'vz-tabhint muted' }, S.latex ? 'Cells show LaTeX · Tab: next cell (adds a row at the end) · Enter: cell below · “LaTeX” goes back to typing as drawn · Esc: done' : 'Type as in Word · $ or Ctrl+M: maths · Tab: next cell (adds a row at the end) · Enter: cell below · drag across cells (or Shift+arrows) to select them: Ctrl+C, Ctrl+X, Delete, Ctrl+V · Esc: done'));
      syncBar();
    }
    // insert a new table: a grid to pick rows × columns, like Word's
    function insertTablePicker(anchor) {
      document.querySelector('.vz-tabgrid')?.remove();
      const N = 8, M = 10, pop = h('div', { class: 'vz-tabgrid', role: 'dialog', 'aria-label': 'Insert a table' }), label = h('div', { class: 'vz-tabgrid-l' }, 'Insert a table');
      const grid = h('div', { class: 'vz-tabgrid-g', style: { gridTemplateColumns: `repeat(${N}, 18px)` } });
      for (let r = 0; r < M; r++) for (let c = 0; c < N; c++) grid.append(h('span', { 'data-r': r, 'data-c': c }));
      const over = (r, c) => { grid.querySelectorAll('span').forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); label.textContent = `${r + 1} × ${c + 1} table (rows × columns)`; };
      grid.addEventListener('mouseover', (e) => { const x = e.target.closest('span'); if (x) over(+x.dataset.r, +x.dataset.c); });
      grid.addEventListener('mousedown', (e) => { const x = e.target.closest('span'); if (!x) return; e.preventDefault(); pop.remove(); insertTable(+x.dataset.r + 1, +x.dataset.c + 1); });
      pop.append(label, grid, h('div', { class: 'muted vz-tabgrid-f' }, 'With a caption and a label; book-style lines'));
      document.body.append(pop);
      const rr = anchor.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - 240, rr.left)) + 'px'; pop.style.top = (rr.bottom + 6) + 'px';
      const off = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
      setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    }
    function insertTable(rows, cols) {
      const v = view(); if (!v) return;
      const t = TE.newTable(rows, cols); t.rows[0].cells.forEach((c, i) => { c.tex = i ? `Column ${i + 1}` : 'Variable'; });
      const { spec, body } = TE.serializeTable(t);
      const sel = v.state.selection.main, line = v.state.doc.lineAt(sel.head), blank = !line.text.trim();
      const head = (blank ? '' : '\n') + '\\begin{table}[htbp]\n  \\centering\n  \\caption{}\n  \\label{tab:}\n  ';
      const text = head + `\\begin{tabular}{${spec}}${body}\\end{tabular}\n\\end{table}\n`;
      const at = blank ? line.from : line.to;
      v.dispatch({ changes: { from: at, to: blank ? line.to : at, insert: text }, userEvent: 'input.table' });
      const tabFrom = at + head.length;
      if (on && layers.format) setTimeout(() => { const it = v.state.field(field, false)?.p.items.find(y => y.kind === 'table' && y.from === tabFrom); if (it) startTable(v, it, null, { r: 1, c: 0 }); }, 120);
      else v.dispatch({ selection: { anchor: tabFrom + `\\begin{tabular}{${spec}}`.length + body.indexOf('\\\\', body.indexOf('\\midrule')) - 0 }, scrollIntoView: true });
      ctx.ui.toast('Table inserted: fill it in, Tab moves to the next cell. Write the caption in \\caption{…}.', '', 5000);
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
      const wrapEl = h('div', { class: 'vz-tablewrap', title: 'Click a cell to fill in the table (Alt+click shows the LaTeX)' }, table);
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
      const fitOn = layers.page && (layout === 'web' || (layout === 'page' && ctx.settings.get('wrapPage', true)));
      const ranges = [], sel = state.selection.ranges, L = layers, doc = state.doc, editing = state.field(editField, false);
      const zones = blocks.filter(b => FLOATS.test(b.env) || TABULAR.test(b.env)).map(b => ({ from: b.from, to: b.to }));
      const hid = state.field(hiddenField, false);
      const near = (it) => !(hid && hid.from === it.from) && sel.some(r => r.from <= it.to && r.to >= it.from && !(it.kind === 'preamble' && r.to === 0));
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
          case 'cblock': ranges.push(Decoration.replace({ block: true, widget: new Html('cb' + it.from + it.lines + it.label, () => h('div', { class: 'vz-cblock-w' }, h('div', { class: 'vz-cblock', title: 'Not in the PDF. Click to show the LaTeX.' }, `${it.label} · ${it.lines} line${it.lines === 1 ? '' : 's'} · not in the PDF`)), it.from + 1) }).range(it.from, it.to)); covered.push({ from: it.from, to: it.to }); break;
          case 'preamble': ranges.push(Decoration.replace({ block: true, widget: new Html('pre' + it.lines, () => h('div', { class: 'vz-preamble-w' }, h('div', { class: 'vz-preamble', title: 'Click to show the preamble' }, `Preamble · ${it.lines} lines of packages and settings`)), 1) }).range(it.from, it.to)); break;
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
          case 'cite': { const c = citeText(it, info); ranges.push(Decoration.replace({ widget: new RefTag(c.text, 'vz-cite' + (c.missing.length ? ' vz-missing' : ''), it.from + 1, c.missing.length ? 'Not found in your .bib files: ' + c.missing.join(', ') : '\\' + it.cmd + '{' + it.arg + '}', 'cite', it.arg) }).range(it.from, it.to)); break; }
          case 'ref': { const r = refText(it, info); ranges.push(Decoration.replace({ widget: new RefTag(r.text, 'vz-ref' + (r.ok ? '' : ' vz-missing'), it.from + 1, r.ok ? '\\' + it.cmd + '{' + it.arg + '}' : 'No \\label{' + it.arg + '} in this file', 'ref', it.arg) }).range(it.from, it.to)); break; }
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
            const w = tableSess && tableSess.from === it.from ? new TableEditW(it.from)
              : new Html('tab' + it.spec + it.body + ready + fitOn, () => tableEl(it, info.macros), it.from + 1, (v, el, e) => { if (e.altKey || !clickEdits()) return reveal(v, it.from + 1)(e); startTable(v, it, e); });
            ranges.push(Decoration.replace({ block: it.block, widget: w }).range(from, to)); covered.push({ from: it.from, to: it.to }); break;
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
          const joinTo = b.from + (b.text.length - b.text.trimStart().length);
          if (blocked(a.to) || sel.some(r => r.from <= joinTo && r.to >= a.to)) continue;
          // a line that is only bold text or only an inline equation runs into the next one: offer a new row
          const lm = LONE_LINE.exec(a.text), lone = lm ? [lm[0], lm[1] || 'math'] : null;
          ranges.push(Decoration.replace({ widget: lone ? new Html('join' + a.to + lone[1], () => h('span', { class: 'vz-joinhint', title: 'This runs into the next line (as in the PDF). Click for a new row, a heading or a display equation.' }, ' '), a.to, (v, el) => joinMenu(v, el, a.number, lone[1])) : new Tag(' ', 'vz-char', null) }).range(a.to, joinTo));
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
    let pointerDown = false, held = false;
    const downOn = (e) => { if (e.button === 0 && !e.target.closest?.('.vz-edit, .vz-mc')) pointerDown = true; };
    const upOn = () => { if (!pointerDown) return; pointerDown = false; if (held) { held = false; setTimeout(() => { try { ctx.editor.view.dispatch({ effects: refresh.of(null) }); } catch {} }, 0); } };
    ctx.editor.view.contentDOM.addEventListener('mousedown', downOn, true); addEventListener('mouseup', upOn, true);
    ctx.onDispose(() => { ctx.editor.view.contentDOM.removeEventListener('mousedown', downOn, true); removeEventListener('mouseup', upOn, true); });
    // Typing ordinary text (no \ $ { } % & …) cannot change the structure: keep the drawing, move it with the text,
    // and re-read the whole document once typing pauses. This keeps keystrokes fast in long papers.
    const PLAIN = /^[^\\$%{}&\[\]~^_\n#]*$/;
    function plainEdit(tr) {
      let ok = true;
      tr.changes.iterChanges((fa, ta, fb, tb, ins) => { if (ok && (ta - fa > 40 || ins.length > 40 || !PLAIN.test(tr.startState.doc.sliceString(fa, ta)) || !PLAIN.test(ins.toString()))) ok = false; });
      return ok;
    }
    const POSKEYS = ['from', 'to', 'inner', 'pos', 'start', 'end', 'at'];
    const mapItems = (p, ch) => ({ ...p, items: p.items.map(it => { const o = { ...it }; for (const k of POSKEYS) if (typeof o[k] === 'number') o[k] = ch.mapPos(o[k], k === 'to' || k === 'end' ? 1 : -1); return o; }) });
    let idleT = 0;
    const settleLater = () => { clearTimeout(idleT); idleT = setTimeout(() => { try { view().dispatch({ effects: refresh.of(null) }); } catch {} }, 350); };
    const field = StateField.define({
      create(state) { const p = read(state); return { p, deco: build(state, p) }; },
      update(v, tr) {
        // a table being edited follows changes above it (a \usepackage added after a compile, typing elsewhere)
        if (tr.docChanged && tableSess) tableSess.from = tr.changes.mapPos(tableSess.from, 1);
        const again = tr.effects.some(e => e.is(refresh) || e.is(setEdit) || e.is(hideEff));
        if (!tr.docChanged && !tr.selection && !again) return v;
        if (!tr.docChanged && !again && pointerDown) { held = true; return v; }
        if (tr.docChanged && !again && plainEdit(tr)) { settleLater(); return { p: mapItems(v.p, tr.changes), deco: v.deco.map(tr.changes), stale: true }; }
        if (!tr.docChanged && !again && v.stale) return { ...v, p: v.p, deco: v.deco };
        const p = tr.docChanged || v.stale ? read(tr.state) : v.p;
        return { p, deco: build(tr.state, p) };
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });

    // ---- a lone bold line or inline equation that runs into the next line: new row / heading / display equation
    function joinMenu(v, el, lineNo, kind) {
      const line = v.state.doc.line(lineNo), t = line.text.trim();
      const items = [{ label: 'Start a new line after it', hint: 'blank line', onClick: () => v.dispatch({ changes: { from: line.to, insert: '\n' }, userEvent: 'input' }) }];
      const b = /^\\textbf\s*\{(.*)\}\s*[.:]?$/.exec(t);
      if (b) {
        items.push({ label: 'Make it a heading', hint: '\\subsection*', onClick: () => v.dispatch({ changes: { from: line.from, to: line.to, insert: line.text.replace(t, `\\subsection*{${b[1]}}`) }, userEvent: 'input' }) });
        items.push({ label: 'Make it a run-in heading', hint: '\\paragraph', onClick: () => v.dispatch({ changes: { from: line.from, to: line.to, insert: line.text.replace(t, `\\paragraph{${b[1]}}`) }, userEvent: 'input' }) });
      }
      const m = /^\$([^$]+)\$\s*([.:,;]?)$/.exec(t) || /^\\\(([\s\S]*)\\\)\s*([.:,;]?)$/.exec(t);
      if (m) items.push({ label: 'Make it a display equation', hint: '\\[ … \\]', onClick: () => v.dispatch({ changes: { from: line.from, to: line.to, insert: line.text.replace(t, `\\[ ${m[1].trim()}${m[2] ? ' ' + m[2] : ''} \\]`) }, userEvent: 'input' }) });
      ctx.ui.menu(el, items);
    }

    // ---- while an equation shows its LaTeX: a floating picture of it, with a way back to the drawn form
    // an equation sent back to its drawn form keeps it while the cursor stays on it
    const hideEff = StateEffect.define();
    const hiddenField = StateField.define({
      create: () => null,
      update(v, tr) {
        for (const e of tr.effects) if (e.is(hideEff)) return e.value;
        if (!v) return v;
        if (tr.docChanged) v = { from: tr.changes.mapPos(v.from, 1), to: tr.changes.mapPos(v.to, -1) };
        const r = tr.state.selection.main;
        return r.from >= v.from && r.to <= v.to && !tr.docChanged ? v : (tr.selection || tr.docChanged ? null : v);
      },
    });
    const mathItemAt = (state, pos) => { const p = state.field(field, false)?.p; return p && p.items.find(x => (x.kind === 'dmath' || x.kind === 'imath') && pos >= x.from && pos <= x.to); };
    function backToVisual(v) {
      const it = mathItemAt(v.state, v.state.selection.main.head); if (!it || (v.state.field(hiddenField, false)?.from === it.from)) return false;
      v.dispatch({ effects: hideEff.of({ from: it.from, to: it.to }), selection: { anchor: it.to }, scrollIntoView: false });
      return true;
    }
    const previewOn = () => ctx.settings.get('preview', true);
    let tipCache = null;
    const previewField = StateField.define({
      create: () => null,
      update(v, tr) {
        if (!previewOn() || !tr.state.field(field, false)) return null;
        const r = tr.state.selection.main; if (!r.empty && tr.state.doc.lineAt(r.from).number !== tr.state.doc.lineAt(r.to).number) return null;
        const ed = tr.state.field(editField, false); if (ed) return null;
        const it = mathItemAt(tr.state, r.head); if (!it || tr.state.field(hiddenField, false)?.from === it.from) return null;
        if (v && v.pos === it.from) return v;
        return { pos: it.from, above: true, arrow: false, create: (vw) => previewView(vw, it.from) };
      },
      provide: f => ctx.cm.showTooltip.from(f),
    });
    function previewView(vw, from) {
      const pic = h('div', { class: 'vz-pv-math' }), err = h('div', { class: 'vz-pv-err' });
      const dom = h('div', { class: 'vz-pv' }, pic, err, h('div', { class: 'vz-pv-bar' },
        h('span', { class: 'vz-pv-hint' }, 'Preview · Esc'),
        h('button', { title: 'Show it drawn again (Esc)', onMousedown: (e) => { e.preventDefault(); backToVisual(vw); vw.focus(); } }, 'Visual'),
        h('button', { title: 'Edit it as drawn, in place', onMousedown: (e) => { e.preventDefault(); const it = mathItemAt(vw.state, from); if (it && editModel(it)) startEdit(vw, it); } }, 'Edit visually')));
      const draw = (state) => {
        const it = state.field(field, false)?.p.items.find(x => x.from === from && (x.kind === 'dmath' || x.kind === 'imath')); if (!it) return;
        const r = window.MathJax?.tex2svg ? renderMath(mathTex(it), it.kind === 'dmath', state.field(field).p.info.macros, 0) : { html: '' };
        if (r.error) { err.textContent = 'Not drawn yet: ' + r.error; err.hidden = false; } else { err.hidden = true; if (r.html) pic.innerHTML = r.html; }
      };
      draw(vw.state);
      return { dom, update(u) { if (u.docChanged) draw(u.state); } };
    }

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
        if (plainEdit(tr)) { settleBreaks(); const list = v.list.map(b => ({ ...b, pos: tr.changes.mapPos(b.pos, 1) })); return { ...v, list, deco: v.deco.map(tr.changes) }; }
        const list = estimate(tr.state); return { list, measured: false, deco: breakDeco(tr.state, list) };
      },
      provide: f => EditorView.decorations.from(f, v => v.deco),
    });
    let breaksT = 0;
    const settleBreaks = () => { clearTimeout(breaksT); breaksT = setTimeout(() => { try { if (!view().state.field(breaksField, false)?.measured) view().dispatch({ effects: setBreaks.of({ measured: false }) }); } catch {} }, 600); };
    const measure = () => {
      const path = ctx.editor.path; if (!path || !breaksEff()) return;
      const r = ctx.compile.pageStarts(path), len = view().state.doc.length;
      const fresh = r && r.size != null && Math.abs(r.size - len) <= Math.max(200, len * 0.03);     // compiled from (nearly) this text
      try { view().dispatch({ effects: setBreaks.of(fresh ? { measured: true, lines: r.lines } : { measured: false }) }); } catch {}
    };

    // ---- switching
    // the extensions are registered with the editor itself, so they survive a file being reopened or replaced
    // a short flash on the caret's line (a decoration, so the editor's own redraws keep it)
    const flashEff = StateEffect.define();
    const flashField = StateField.define({
      create: () => Decoration.none,
      update(v, tr) { for (const e of tr.effects) if (e.is(flashEff)) return e.value == null ? Decoration.none : Decoration.set([Decoration.line({ class: 'vz-flash' }).range(tr.state.doc.lineAt(e.value).from)]); return v.map(tr.changes); },
      provide: (f) => EditorView.decorations.from(f),
    });
    ctx.editor.addExtension(flashField);
    // in the source: Ctrl+click (⌘+click) on \ref{…}, \eqref{…} or \cite{…} goes to the label or the reference; F12 does the same at the cursor
    const refAt = (view, pos) => {
      const line = view.state.doc.lineAt(pos);
      for (const m of line.text.matchAll(/\\(ref|eqref|cref|Cref|autoref|nameref|pageref|vref|[a-zA-Z]*cite[a-zA-Z]*)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}/g)) {
        const a = line.from + m.index, b = a + m[0].length; if (pos < a || pos > b) continue;
        const start = b - 1 - m[2].length; let acc = start, key = m[2].split(',')[0];
        for (const k of m[2].split(',')) { if (pos <= acc + k.length) { key = k; break; } acc += k.length + 1; }
        return { kind: /cite/i.test(m[1]) ? 'cite' : 'ref', key: key.trim() };
      }
      return null;
    };
    ctx.editor.addExtension(EditorView.domEventHandlers({ mousedown(e, view) {
      if (e.button !== 0 || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }); if (pos == null) return false;
      const r = refAt(view, pos); if (!r) return false;
      e.preventDefault(); jumpTo(view, r.kind, r.key); return true;
    } }));
    const goDef = () => { const v = view(); const r = v && refAt(v, v.state.selection.main.head); if (!r) { ctx.ui.toast('Put the cursor on a \\ref, \\eqref or \\cite first.'); return false; } jumpTo(v, r.kind, r.key); return true; };
    ctx.editor.addKeymap([{ key: 'F12', run: () => { const v = view(); if (!v || !refAt(v, v.state.selection.main.head)) return false; return goDef(); } }]);
    ctx.ui.addCommand({ id: 'equation.steady', name: 'Steady state of the equation at the cursor (written below it)', run: () => { const v = view(); const it = v && (v.state.field(field, false)?.p || parse(v.state.doc.toString())).items.find(y => y.kind === 'dmath' && v.state.selection.main.head >= y.from && v.state.selection.main.head <= y.to); if (!it) return ctx.ui.toast('Put the cursor in a display equation first. For the whole model: “Model equations: write the steady state as a section…”.'); steadyBelow(v, it.from, 'bar'); } });
    ctx.ui.addCommand({ id: 'table.insert', name: 'Insert a table…', run: () => insertTablePicker(document.querySelector('[data-tb="table"]') || document.querySelector('.vz-switch') || document.body) });
    { const tb = ctx.ui.addToolbarButton({ label: 'Table', icon: 'insert', title: 'Insert a table: pick rows × columns, then fill it in like Word', onClick: (e) => insertTablePicker(e?.currentTarget || document.querySelector('[data-tb="table"]')) }); tb.el.dataset.tb = 'table'; tb.el.replaceChildren(ico('table', 16), h('span', { class: 'lbl' }, 'Table')); tb.el.setAttribute('aria-label', 'Insert a table'); ctx.onDispose(() => tb()); }
    ctx.ui.addCommand({ id: 'nav.definition', name: 'Go to the label or reference under the cursor', key: 'F12', run: goDef });
    let offExt = null, extKey = '';
    const view = () => ctx.editor.view;
    let sw, panel = null;
    const apply = () => {
      const active = on && Object.values(layers).some(Boolean);
      const brk = breaksEff();
      const key = (active ? 'v' + layout + JSON.stringify(layers) : '') + (brk ? 'b' : '') + (ctx.settings.get('wrapPage', true) ? 'w' : '');
      if (key !== extKey) {
        // keep the same text at the same height when the view changes (heights differ a lot between views)
        let keep = null; try { if (extKey !== null && view().scrollDOM.scrollTop > 0) keep = VP.capture(view()); } catch {}
        extKey = key; offExt && offExt();
        offExt = ctx.editor.addExtension([active ? [editField, hiddenField, field, previewField, ctx.cm.Prec.high(ctx.cm.keymap.of([{ key: 'Escape', run: (v) => !v.state.field(editField, false) && backToVisual(v) }])), EditorView.editorAttributes.of({ class: 'cm-typeset' + (layers.page ? ' cm-page' + (layout === 'web' ? ' cm-web' : '') : '') })] : [], brk ? breaksField : []]);
        if (keep) requestAnimationFrame(() => VP.restore(view(), keep, { cursor: false, scrollIntoView: EditorView.scrollIntoView }));
      } else poke();
      if (brk) measure();
      sw.setAttribute('aria-checked', String(on)); sw.classList.toggle('on', on);
      if (panel) renderPanel();
      if (active && layers.math && !ready) loadMathJax().then(() => { ready = true; poke(); }).catch((e) => ctx.ui.toast('Equations cannot be drawn: ' + e.message, 'err'));
    };
    const poke = () => { try { view().dispatch({ effects: refresh.of(null) }); } catch {} };
    // page breaks make no sense in Web (no pages)
    const breaksEff = () => breaksOn && !(on && Object.values(layers).some(Boolean) && layers.page && layout === 'web');
    const save = () => { ctx.settings.set('layout', layout); ctx.settings.set('on', on); ctx.settings.set('layers2', layers); ctx.settings.set('breaks', breaksOn); };
    // after switching, the caret is shown where it was: the editor takes the focus, the line flashes for a moment,
    // and if the caret was inside an equation that is now drawn, that equation opens for editing
    const showCaret = () => {
      const v = view(); if (!v) return;
      const head = v.state.selection.main.head;
      v.focus();
      v.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'nearest', yMargin: 60 }) });
      setTimeout(() => {
        try {
          if (on && layers.math && clickEdits()) {
            const it = v.state.field(field, false)?.p.items.find(y => (y.kind === 'dmath' || y.kind === 'imath') && head > y.from && head < y.to);
            if (it && editModel(it)) { startEdit(v, it); return; }
          }
          v.dispatch({ effects: flashEff.of(Math.min(head, v.state.doc.length)) });
          setTimeout(() => { try { v.dispatch({ effects: flashEff.of(null) }); } catch {} }, 1300);
        } catch {}
      }, 180);
    };
    const setOn = (v) => { on = v; if (on && !Object.values(layers).some(Boolean)) layers = ALL(); save(); apply(); showCaret(); };
    const setLayout = (k) => { if (k === 'inline') layers = { ...layers, page: false }; else { layers = { ...layers, page: true }; layout = k; } on = true; save(); apply(); };
    const setLayer = (k, v) => { layers = { ...layers, [k]: v }; if (v) on = true; if (!Object.values(layers).some(Boolean)) on = false; save(); apply(); };
    const swEl = (checked, label, hint, onChange) => {
      const b = h('button', { class: 'vz-row', role: 'switch', 'aria-checked': String(checked), title: hint || '', onClick: () => onChange(!checked) }, h('span', { class: 'vz-row-l' }, h('span', {}, label), hint ? h('small', {}, hint) : null), h('span', { class: 'vz-track' }, h('span', { class: 'vz-knob' })));
      return b;
    };
    function renderPanel() {
      const act = on && Object.values(layers).some(Boolean), cur = !act ? 'off' : !layers.page ? 'inline' : layout;
      // a switch that does not apply to this layout is greyed out with the reason
      const sw2 = (checked, label, hint, onChange, off) => { const el = swEl(checked, label, off || hint, onChange); if (off) { el.classList.add('vz-dis'); el.setAttribute('aria-disabled', 'true'); el.onclick = null; } return el; };
      const ceMode = ctx.settings.get('clickEdit', 'auto');
      panel.replaceChildren(
        swEl(on, 'Visual view', 'Draw the document the way it will print', setOn),
        h('div', { class: 'vz-sep' }, 'Layout'),
        h('div', { class: 'vz-seg', role: 'radiogroup', 'aria-label': 'Layout' }, ...[['page', 'Page', 'As printed, page by page'], ['web', 'Web', 'Fits the window, no pages; long equations wrap'], ['inline', 'In the code', 'Drawn inside the source, with line breaks kept']].map(([k, label, hint]) =>
          h('button', { role: 'radio', 'aria-checked': String(cur === k), class: cur === k ? 'on' : '', title: hint, onClick: () => setLayout(k) }, h('span', {}, label), h('small', {}, hint)))),
        h('div', { class: 'vz-sep' }, 'What is drawn'),
        ...LAYERS.filter(([k]) => k !== 'page').map(([k, label, hint]) => sw2(!!layers[k], label, hint, (v) => setLayer(k, v), !on ? 'Turn on the visual view first' : null)),
        h('div', { class: 'vz-sep' }, 'Editing'),
        sw2(clickEdits(), 'Edit equations in place', ceMode === 'auto' ? 'Automatic: on in Page and Web, off In the code. Alt+click shows the LaTeX' : 'Your choice for every layout (Alt+click always shows the LaTeX)', (v) => { ctx.settings.set('clickEdit', v ? 'visual' : 'latex'); svgCache.clear(); renderPanel(); poke(); }, !act || !layers.math ? 'Needs the visual view with equations drawn' : null),
        ceMode !== 'auto' ? h('button', { class: 'vz-link', onClick: () => { ctx.settings.set('clickEdit', 'auto'); renderPanel(); poke(); } }, 'Back to automatic') : null,
        sw2(previewOn(), 'Preview while editing LaTeX', 'A floating picture of an equation while you edit its LaTeX, with “Visual” (or Esc) to go back', (v) => { ctx.settings.set('preview', v); renderPanel(); poke(); }, !act || !layers.math ? 'Needs the visual view with equations drawn' : null),
        h('div', { class: 'vz-sep' }, 'Pages'),
        sw2(breaksOn, 'Page breaks', 'Where each page starts; exact after a compile, estimated (≈) before', (v) => { breaksOn = v; save(); apply(); }, cur === 'web' ? 'Web has no pages' : null),
        sw2(ctx.settings.get('wrapPage', true), 'Wrap long equations', 'Break long equations over lines on the page, as in Web (the PDF itself is unchanged; “Make it fit the page” in an equation’s ⋯ menu changes the PDF too)', (v) => { ctx.settings.set('wrapPage', v); svgCache.clear(); extKey = null; apply(); renderPanel(); }, cur === 'web' ? 'Web always wraps long equations' : cur !== 'page' ? 'Only in the Page layout' : null),
        modelState.result ? h('p', { class: 'vz-note' }, 'Model check chips (“in the model”) show on equations in every layout.') : null,
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
.vz-row.vz-dis { opacity: .5; cursor: default; } .vz-row.vz-dis:hover { background: none; }
.vz-link { border: 0; background: none; color: var(--accent); font: 12px var(--ui); padding: 0 10px 6px; cursor: pointer; text-align: left; }
.vz-note { margin: 4px 10px 6px; font: 12px var(--ui); color: var(--muted); }
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
.cm-page .tb-pb { height: 126px; margin: 0 -64px; }
.cm-page .tb-pb::before { display: block; border: 0; top: 34px; height: 40px; background: var(--bg); box-shadow: inset 0 9px 9px -9px rgba(23,32,43,.16), inset 0 -9px 9px -9px rgba(23,32,43,.16); }
.cm-page .tb-pb span { background: transparent; border: 0; margin: 0 auto; color: var(--faint); top: -9px; }

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
@container (max-width: 640px) { .cm-page .cm-content { padding: 28px 26px 48px; margin: 10px 8px 40px; } .cm-page .tb-pb { height: 90px; margin: 0 -26px; } .cm-page .tb-pb::before { top: 20px; } .cm-page .tb-pb span { top: -5px; } }

.vz-h { font-weight: 700; color: var(--ink); }
.vz-h0 { font-size: 1.7em; } .vz-h1 { font-size: 1.38em; } .vz-h2 { font-size: 1.17em; } .vz-h3 { font-size: 1.04em; } .vz-h4, .vz-h5 { font-size: 1em; }
.vz-secnum { font-weight: 700; color: var(--ink); margin-right: .75em; font-size: 1.38em; white-space: pre; }
.cm-line:has(.vz-h2) .vz-secnum { font-size: 1.17em; } .cm-line:has(.vz-h3) .vz-secnum { font-size: 1.04em; } .cm-line:has(.vz-h0) .vz-secnum { font-size: 1.1em; display: block; }
.cm-page .cm-line:has(.vz-h1), .cm-page .cm-line:has(.vz-h0) { padding-top: .5em; } .cm-page .cm-line:has(.vz-h2) { padding-top: .3em; }
.vz-b { font-weight: 700; } .vz-i { font-style: italic; } .vz-u { text-decoration: underline; } .vz-tt { font-family: var(--mono); font-size: .92em; } .vz-sc { font-variant: small-caps; } .vz-sf { font-family: var(--ui); }
.vz-joinhint { display: inline-block; width: .9em; height: 1em; margin: 0 .15em; vertical-align: -.1em; border-radius: 3px; cursor: pointer; background: transparent; position: relative; }
.vz-joinhint::after { content: '↵'; position: absolute; inset: 0; font: 11px var(--ui); color: var(--accent); opacity: 0; display: grid; place-items: center; }
.cm-line:hover .vz-joinhint::after { opacity: .7; } .vz-joinhint:hover { background: var(--accent-soft); } .vz-joinhint:hover::after { opacity: 1; }
.vz-pv { background: var(--paper); color: var(--ink); border: 1px solid var(--line-2); border-radius: 8px; box-shadow: var(--shadow); padding: 8px 10px 6px; max-width: min(760px, 80vw); overflow-x: auto; }
.vz-pv-math { text-align: center; font-size: 1.05em; min-height: 1.4em; } .vz-pv-math svg { max-width: 100%; }
.vz-pv-err { color: var(--err); font: 12px var(--ui); margin-top: 4px; }
.vz-pv-bar { display: flex; gap: 6px; align-items: center; margin-top: 6px; } .vz-pv-hint { flex: 1; color: var(--faint); font: 11px var(--ui); }
.vz-pv-bar button { font: 500 11.5px var(--ui); padding: 1px 8px; height: 22px; }
.vz-mc { position: absolute; left: 0; top: 2px; font: 500 10.5px var(--ui); padding: 0 6px; height: 17px; line-height: 15px; border-radius: 9px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); opacity: 0; transition: opacity .12s; cursor: pointer; z-index: 1; }
.vz-dmath:hover .vz-mc, .vz-mc.vz-mc-set, .vz-mc:focus-visible { opacity: 1; }
.vz-mc-in { color: var(--ok, #177245); border-color: color-mix(in srgb, var(--ok, #177245) 40%, var(--line)); }
.vz-mc { display: inline-flex; align-items: center; gap: 5px; }
.vz-mcbox { width: 10px; height: 10px; border: 1.4px solid currentColor; border-radius: 2.5px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
.vz-mc-in .vz-mcbox { background: var(--ok, #177245); border-color: var(--ok, #177245); } .vz-mc-in .vz-mcbox::after { content: ''; width: 5px; height: 2.6px; border: solid #fff; border-width: 0 0 1.5px 1.5px; transform: translateY(-0.6px) rotate(-45deg); }
.vz-mc-part .vz-mcbox::after { content: ''; width: 6px; height: 1.5px; background: currentColor; }
.vz-mc-set { border-style: dashed; }
.vz-fitpv { overflow-x: auto; padding: 8px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; margin: 6px 0; }
.vz-fitsrc { font: 12px var(--mono, monospace); background: var(--panel); padding: 8px; border-radius: 6px; max-height: 180px; overflow: auto; white-space: pre-wrap; }
.vz-edit { position: relative; display: flex; align-items: center; gap: 10px; padding: 6px 0 6px; }
.vz-edit math-field { flex: 1; min-width: 0; font-size: 1.15em; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 8px; padding: 6px 10px; background: var(--paper); color: var(--ink); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent); --caret-color: var(--accent); --selection-background-color: var(--sel, #c3d9f5); }
.vz-edit math-field::part(menu-toggle), .vz-edit math-field::part(virtual-keyboard-toggle) { display: none; }
.vz-edit-i { display: inline-flex; padding: 0; vertical-align: middle; } .vz-edit-i math-field { font-size: 1em; padding: 1px 6px; min-width: 3em; }
.vz-edit-num { font-family: var(--serif, serif); color: var(--ink); white-space: nowrap; }
.vz-edit-bar { position: absolute; right: 0; top: -14px; display: inline-flex; gap: 4px; z-index: 2; }
.vz-edit-i .vz-edit-bar { top: -24px; }
.vz-edit-bar button { font: 500 11px var(--ui); padding: 1px 7px; height: 20px; border-radius: 5px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); }
.vz-edit-bar button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.vz-edit:not(.vz-edit-i) { padding-top: 28px; }
@keyframes vz-flash { 0%, 40% { background: color-mix(in srgb, var(--accent) 22%, transparent); } 100% { background: transparent; } }
.vz-flash { animation: vz-flash 1.2s ease-out; border-radius: 3px; }
.vz-edit-head { position: absolute; left: 0; right: 0; top: 2px; display: flex; align-items: center; gap: 8px; z-index: 3; pointer-events: none; }
.vz-edit-head > * { pointer-events: auto; }
.vz-edit-head .vz-edit-bar { position: static; flex: none; margin-left: auto; }
.vz-edit-bar, .vz-fmt-bar { gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
.vz-edit-bar button, .vz-fmt-bar button { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 4px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
.vz-edit-bar button:hover, .vz-fmt-bar button:hover { background: var(--accent-soft, #e8eefc); color: var(--ink); }
.vz-edit-bar button.primary { background: var(--accent); color: #fff; padding: 0 6px; } .vz-edit-bar button.primary:hover { background: var(--accent); filter: brightness(1.08); color: #fff; }
.vz-edit-bar button.vz-danger:hover { background: color-mix(in srgb, #d33 14%, transparent); color: #c22; }
.vz-ib { display: inline-flex; align-items: center; gap: 1px; } .vz-om { font: 600 14px var(--serif, serif); }
.vz-fmt-bar { position: absolute; left: 0; top: calc(100% - 4px); z-index: 4; display: inline-flex; flex-wrap: wrap; align-items: center; max-width: 100%; box-sizing: border-box; }
.vz-fmt-bar > span:not(.vz-bsep):not(.vz-hint) { display: contents; }
.vz-acc { position: relative; display: inline-block; font-style: italic; padding: 0 1px; } .vz-acc::after { content: attr(data-acc); position: absolute; left: 50%; top: -0.16em; transform: translateX(-38%); font-style: normal; font-size: 0.95em; line-height: 1; } .vz-acc sup { font-size: 0.7em; font-style: normal; }
.vz-vec { position: relative; display: inline-block; font-style: italic; } .vz-vec::after { content: ''; position: absolute; left: 1px; right: -1px; top: -1px; height: 4px; background: no-repeat center/100% 100% url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 4'%3E%3Cpath d='M0 2h9M7 0.300l2 1.700-2 1.700' fill='none' stroke='%23888' stroke-width='0.900'/%3E%3C/svg%3E"); }
.vz-fb { font: 15px/1 var(--serif, 'STIX Two Text', serif); color: var(--ink); white-space: nowrap; }
.vz-fb.b { font-weight: 700; } .vz-fb.i { font-style: italic; } .vz-fb.u { text-decoration: underline; } .vz-fb.tt { font: 600 11px var(--ui); }
.vz-bsep { display: inline-block; width: 1px; height: 16px; min-width: 0; padding: 0; margin: 0 3px; background: var(--line); flex: none; }
.vz-fmt-bar:not(.has-sel) > .vz-only-sel, .vz-fmt-bar.has-sel > .vz-only-nosel { display: none !important; }
.vz-hint { font: 11px var(--ui); color: var(--muted); padding: 0 6px; white-space: nowrap; }
.vz-edit-i .vz-fmt-bar { top: calc(100% + 3px); width: max-content; max-width: min(560px, 90vw); }
.vz-edit-i .vz-hint { display: none; }
.vz-sym { position: fixed; z-index: 1000; width: 320px; display: flex; flex-direction: column; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 28px rgb(0 0 0 / 18%); overflow: hidden; }
.vz-sym-q { margin: 8px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); color: var(--ink); font: 13px var(--ui); }
.vz-sym-body { overflow-y: auto; padding: 0 8px 6px; flex: 1; }
.vz-sym-h { font: 600 10.5px var(--ui); text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 8px 2px 3px; }
.vz-sym-g { display: grid; grid-template-columns: repeat(9, 1fr); gap: 2px; }
.vz-sym-c { height: 30px; border: 0; border-radius: 5px; background: transparent; color: var(--ink); font: 17px var(--serif, 'STIX Two Text', serif); cursor: pointer; padding: 0; overflow: hidden; white-space: nowrap; }
.vz-sym-c.w { grid-column: span 2; font-size: 14px; }
.vz-sym-c:hover { background: var(--accent-soft, #e8eefc); }
.vz-sym-foot { font: 11px var(--ui); padding: 6px 10px; border-top: 1px solid var(--line); }
.vz-dmath { display: flex; justify-content: center; align-items: center; position: relative; padding: 6px 0; min-height: 2.2em; cursor: text; overflow-x: auto; }
.vz-dmath mjx-container { margin: 0 !important; } .vz-dmath mjx-container[width="full"] { width: 100%; }
.vz-dmath:hover, .vz-imath:hover, .vz-tablewrap:hover, .vz-title:hover { background: color-mix(in srgb, var(--accent-soft) 70%, transparent); border-radius: 4px; }
.vz-imath { cursor: text; padding: 0 1px; }
.vz-wait { font-family: var(--mono); color: var(--muted); font-size: .9em; }
.vz-err { outline: 1px dashed var(--err); outline-offset: 2px; border-radius: 3px; }
.vz-src-math { background: color-mix(in srgb, var(--accent-soft) 60%, transparent); font-family: var(--mono); font-size: .92em; }
.vz-cite, .vz-ref, .vz-label, .vz-link, .vz-fn, .vz-envtag { cursor: text; }
.vz-jump { cursor: pointer; } .vz-jump:hover { text-decoration: underline; text-underline-offset: 2px; }
.vz-card { position: fixed; z-index: 950; max-width: 460px; background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 26px rgb(0 0 0 / 16%); font: 13px var(--ui); overflow: hidden; }
.vz-card-body { padding: 10px 12px; } .vz-card-math { overflow-x: auto; text-align: center; } .vz-card-math svg { max-width: 100%; height: auto; }
.vz-card-cite { line-height: 1.45; } .vz-card-line { font-family: var(--serif, serif); }
.vz-card-foot { font-size: 11px; color: var(--muted); padding: 5px 12px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--line) 25%, transparent); }
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
.vz-preamble-w { display: flow-root; }
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
.vz-tabedit { margin: 4px 0 8px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line)); border-radius: 10px; background: var(--paper); box-shadow: 0 2px 10px rgb(0 0 0 / 6%); }
.vz-tabbar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 4px 6px; border-bottom: 1px solid var(--line); background: var(--panel); border-radius: 10px 10px 0 0; position: sticky; top: 0; z-index: 2; }
.vz-tabbar button { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 5px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; font: 14px var(--ui); }
.vz-tabbar button:hover:not(:disabled) { background: var(--accent-soft, #e8eefc); color: var(--ink); }
.vz-tabbar button:disabled { opacity: .35; cursor: default; }
.vz-tabbar button.on { background: var(--accent-soft, #e8eefc); color: var(--ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent); }
.vz-tabbar button.primary { background: var(--accent); color: #fff; } .vz-tabbar .spacer { flex: 1; }
.vz-tabbar .vz-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; padding: 1px; gap: 1px; } .vz-tabbar .vz-seg button { height: 22px; font-size: 11.5px; padding: 0 7px; }
.vz-tabwhere { font: 600 11px var(--ui); color: var(--muted); white-space: nowrap; }
.vz-tabfoot { text-align: center; padding: 0 10px 2px; min-height: 16px; }
.vz-tabgridwrap { display: flex; justify-content: center; padding: 10px 8px 6px; overflow-x: auto; }
.vz-table-edit td { min-width: 3.5em; cursor: text; outline: none; position: relative; border-left: 1px dashed color-mix(in srgb, var(--line) 80%, transparent); border-right: 1px dashed color-mix(in srgb, var(--line) 80%, transparent); }
.vz-table-edit tr:not([class*="r-"]) td { border-top: 1px dashed color-mix(in srgb, var(--line) 60%, transparent); }
.vz-table-edit td.grid { border: 1px solid var(--ink) !important; }
.vz-table-edit td:hover { background: color-mix(in srgb, var(--accent-soft, #e8eefc) 50%, transparent); }
.vz-table-edit td.editing { background: var(--paper); box-shadow: inset 0 0 0 2px var(--accent); font: 13px var(--mono, monospace); white-space: pre; }
.vz-table-edit td.sel { background: color-mix(in srgb, var(--accent) 22%, transparent) !important; }
.vz-tabedit.has-cells .vz-table-edit { user-select: none; } .vz-tabedit:focus { outline: none; }
.vz-empty { display: inline-block; min-width: 2em; }
.vz-cblock-w { display: flow-root; }
.vz-cellbar { position: fixed; z-index: 960; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: min(620px, calc(100vw - 16px)); }
.vz-cellbar .vz-fmt-bar { position: static; max-width: none; }
.vz-cellbar-end { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: 0 2px 8px rgb(0 0 0 / 8%); }
.vz-cellbar-end button { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 4px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; }
.vz-cellbar-end button:hover { background: var(--accent-soft, #e8eefc); color: var(--ink); } .vz-cellbar-end button.primary { background: var(--accent); color: #fff; }
.vz-cblock { margin: 4px 0; padding: 3px 10px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); font: italic 12px var(--ui); text-align: center; cursor: pointer; background: color-mix(in srgb, var(--panel-2, var(--panel)) 60%, transparent); }
.vz-cblock:hover { border-color: var(--accent); color: var(--accent); }
.vz-table-edit td.editing.visual { font: inherit; white-space: nowrap; box-shadow: inset 0 0 0 2px var(--accent); }
.vz-cm { display: inline-block; padding: 0 1px; border-radius: 3px; cursor: pointer; } .vz-cm:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.vz-cm:empty::before { content: '□'; color: var(--muted); }
.vz-craw { font: 11.5px var(--mono, monospace); color: var(--muted); background: color-mix(in srgb, var(--line) 45%, transparent); border-radius: 3px; padding: 0 3px; }
math-field.vz-cellmath { display: inline-block; min-width: 2.5em; font-size: 1em; padding: 0 4px; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line)); border-radius: 5px; background: var(--paper); vertical-align: middle; }
math-field.vz-cellmath::part(menu-toggle), math-field.vz-cellmath::part(virtual-keyboard-toggle) { display: none; }
.vz-tabbar button.vz-latexsw { font: 600 11px var(--ui); border: 1px solid var(--line); height: 24px; padding: 0 7px; } .vz-tabbar button.vz-latexsw.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.vz-tabhint { font: 11px var(--ui); padding: 0 10px 6px; text-align: center; }
.vz-tabgrid { position: fixed; z-index: 1000; padding: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 26px rgb(0 0 0 / 16%); }
.vz-tabgrid-l { font: 600 12px var(--ui); margin-bottom: 6px; } .vz-tabgrid-f { font: 11px var(--ui); margin-top: 6px; }
.vz-tabgrid-g { display: grid; gap: 3px; } .vz-tabgrid-g span { width: 18px; height: 18px; border: 1px solid var(--line); border-radius: 3px; background: var(--paper); cursor: pointer; }
.vz-tabgrid-g span.on { background: color-mix(in srgb, var(--accent) 30%, var(--paper)); border-color: var(--accent); }
.vz-toc, .vz-bib { display: flex; flex-direction: column; gap: .15em; padding: 6px 0 10px; cursor: text; }
.vz-toc-h, .vz-bib-h { font-weight: 700; font-size: 1.38em; margin-bottom: .3em; }
.vz-toc-l.l1 { padding-left: 1.5em; } .vz-toc-l.l2 { padding-left: 3em; } .vz-toc-l.l0 { font-weight: 700; }
.vz-bib-e { padding-left: 1.6em; text-indent: -1.6em; font-size: .95em; }
`);
    document.head.append(css);
    ctx.onDispose(() => css.remove());
  },
};
