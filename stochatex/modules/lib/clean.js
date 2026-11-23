// Equation clean-up: the same rules as the full equation editor's "Clean" (empty scripts and braces, double braces,
// braces around one-character scripts, repeated fonts, \operatorname{sin}, \displaystyle in display maths, spacing
// at the edges, extra spaces; to check first: \left…\right around simple content, {}^{…}, stacked spacing).
// Copied from equation/index.html so other modules (the table editor) can use it; keep the two in step.
const SAFE = 'safe', CHECK = 'check';
const isEscaped = (src, i) => { let n = 0; while (i - 1 - n >= 0 && src[i - 1 - n] === '\\') n++; return n % 2 === 1; };
const prevNonWs = (src, i) => { i--; while (i >= 0 && /\s/.test(src[i])) i--; return i; };
const nextNonWs = (src, i) => { while (i < src.length && /\s/.test(src[i])) i++; return i; };
const FUNCS = 'sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|coth|arcsin|arccos|arctan|log|ln|lg|exp|lim|liminf|limsup|max|min|sup|inf|det|dim|deg|gcd|hom|ker|arg|Pr';
function isArg(src, i) {
  const j = prevNonWs(src, i);
  if (j < 0) return false;
  const c = src[j];
  if (c === '^' || c === '_' || c === '}' || c === ']') return true;
  if (/[a-zA-Z]/.test(c)) {
    const m = src.slice(0, j + 1).match(/\\([a-zA-Z]+)$/);
    if (!m) return false;
    return !new RegExp(`^(${FUNCS})$`).test(m[1]); // \sin{x}: the braces are not an argument
  }
  return false;
}
function singleToken(inner, src, afterIdx) {
  const t = inner.trim();
  if (/^[A-Za-z0-9]$/.test(t)) return t;
  if (/^\\[a-zA-Z]+$/.test(t) || /^\\[^a-zA-Z]$/.test(t)) return t;
  return null;
}
const glue = (rep, src, after) => (/\\[a-zA-Z]+$/.test(rep) && /[a-zA-Z]/.test(src[after] || '')) ? rep + ' ' : rep;
const TALL = /\\(frac|dfrac|tfrac|cfrac|sum|prod|int|iint|iiint|oint|bigcup|bigcap|lim|binom|dbinom|sqrt|begin|over|matrix|pmatrix|bmatrix|displaystyle|overbrace|underbrace|overset|underset|stackrel)\b|\^|_/;
function bodyBounds(txt) {
  let a = txt.length - txt.trimStart().length, b = txt.trimEnd().length;
  const t = txt.slice(a, b), m = t.match(/^\\begin\{((?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?)\}/);
  if (m && t.endsWith(`\\end{${m[1]}}`)) return [a + m[0].length, b - `\\end{${m[1]}}`.length];
  for (const [o, c] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']])
    if (t.startsWith(o) && t.endsWith(c) && t.length >= o.length + c.length) return [a + o.length, b - c.length];
  return [a, b];
}
function matchBrace(src, i) { // src[i] === '{' or '['
  const open = src[i], close = open === '{' ? '}' : ']';
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (src[j] === open) d++;
    else if (src[j] === close && --d === 0) return j;
  }
  return src.length - 1;
}
function findPair(src, i, openRe, closeRe) { // nested \left..\right or \begin{env}..\end{env}
  const re = new RegExp(`${openRe.source}|${closeRe.source}`, 'g');
  re.lastIndex = i; let d = 1, m;
  while ((m = re.exec(src))) {
    if (new RegExp('^' + openRe.source).test(m[0])) d++; else if (--d === 0) return m.index;
  }
  return -1;
}
export function scanIssues(txt, autoSize = false) {
  const [bs, be] = bodyBounds(txt);
  const inBody = (a, b) => a >= bs && b <= be;
  // text-like command contents are left alone
  const prot = [];
  for (const m of txt.matchAll(/\\(label|tag|text|textrm|textbf|textit|textsf|texttt|mbox|ref|eqref|mathrm|operatorname|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|boldsymbol)\s*\{/g)) {
    const open = m.index + m[0].length - 1; prot.push([open + 1, matchBrace(txt, open)]);
  }
  const isProt = (a, b) => prot.some(([x, y]) => a < y && b > x);
  const isDisplay = /^\s*(\\\[|\$\$|\\begin\{(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?\})/.test(txt);
  const groups = {};
  function add(kind, edits, extra = {}) {
    if (!edits.every(([a, b]) => inBody(a, b))) return;
    const g = groups[kind] || (groups[kind] = { kind, items: [] });
    g.items.push({ edits, ...extra });
  }

  // brace scan
  const braces = [];
  for (let i = bs; i < be; i++) if (txt[i] === '{' && !isEscaped(txt, i)) braces.push([i, matchBrace(txt, i)]);
  const braceAt = new Map(braces);

  for (const [o, c] of braces) {
    if (c >= be) continue;
    const inner = txt.slice(o + 1, c);
    const j = prevNonWs(txt, o), before = txt[j];
    const k = nextNonWs(txt, c + 1), after = txt[k];
    // empty ^{} / _{}
    if (!inner.trim() && (before === '^' || before === '_')) { add('emptyScript', [[j, c + 1, '']]); continue; }
    // empty \cmd{} for font/text commands
    if (!inner.trim() && /[a-zA-Z]/.test(before || '')) {
      const m = txt.slice(0, j + 1).match(/\\(mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|boldsymbol|text|textrm|textbf|textit|mbox|operatorname|bm)$/);
      if (m) { add('emptyCmd', [[j + 1 - m[0].length, c + 1, '']]); continue; }
    }
    if (isProt(o, c)) continue;
    // {}^{..} left-side scripts: probably intentional
    if (!inner.trim() && !isArg(txt, o) && (after === '^' || after === '_')) { add('emptyPrescript', [[o, c + 1, '']]); continue; }
    // stray empty {}
    if (!inner.trim() && !isArg(txt, o)) { add('emptyGroup', [[o, c + 1, '']]); continue; }
    // ^{2} -> ^2
    if ((before === '^' || before === '_')) {
      const t = singleToken(inner);
      if (t && !(/^[0-9]$/.test(t) === false && t.length > 1 && !t.startsWith('\\'))) {
        add('scriptBraces', [[o, o + 1, ''], [c, c + 1, / $/.test(glue(t, txt, c + 1)) ? ' ' : '']]); continue;
      }
    }
    // {{x}} -> {x}
    const io = nextNonWs(txt, o + 1);
    if (txt[io] === '{' && braceAt.has(io) && nextNonWs(txt, braceAt.get(io) + 1) === c) {
      add('doubleBraces', [[o, io, ''], [braceAt.get(io) + 1, c + 1, '']]); continue;
    }
    // a+{b} -> a+b
    if (!isArg(txt, o) && after !== '^' && after !== '_') {
      const t = singleToken(inner);
      if (t) {
        const needSpace = /[a-zA-Z]/.test(txt[o - 1] || '') && /^[a-zA-Z]/.test(t); // \sin{x} -> \sin x
        add('loneBraces', [[o, o + 1, needSpace ? ' ' : ''], [c, c + 1, / $/.test(glue(t, txt, c + 1)) ? ' ' : '']]);
      }
    }
  }

  // \operatorname{sin} -> \sin
  for (const m of txt.matchAll(new RegExp(`\\\\operatorname\\s*\\{\\s*(${FUNCS})\\s*\\}`, 'g'))) {
    const end = m.index + m[0].length;
    add('operatorname', [[m.index, end, glue('\\' + m[1], txt, end)]]);
  }
  // \mathrm{\mathrm{x}} -> \mathrm{x}
  for (const m of txt.matchAll(/\\(mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|boldsymbol|text)\s*\{\s*\\\1\s*\{/g)) {
    const o1 = txt.indexOf('{', m.index), o2 = m.index + m[0].length - 1;
    const c2 = matchBrace(txt, o2), c1 = matchBrace(txt, o1);
    if (nextNonWs(txt, c2 + 1) === c1) add('nestedFont', [[o1 + 1, o2 + 1, ''], [c2, c1, '']]);
  }
  // \left( a+b \right) with nothing tall inside
  for (const m of txt.matchAll(/\\left\s*(\\[{|]|\\[a-zA-Z]+|[()[\]|.])/g)) {
    const start = m.index, inner0 = start + m[0].length;
    const r = findPair(txt, inner0, /\\left(?![a-zA-Z])/, /\\right(?![a-zA-Z])/);
    if (r < 0) continue;
    const rd = txt.slice(r).match(/^\\right\s*(\\[}|]|\\[a-zA-Z]+|[()[\]|.])/);
    if (!rd || m[1] === '.' || rd[1] === '.') continue;
    const inner = txt.slice(inner0, r);
    if (autoSize || TALL.test(inner) || /\\left/.test(inner)) continue;
    add('leftRight', [[start, inner0, glue(m[1], txt, inner0)], [r, r + rd[0].length, glue(rd[1], txt, r + rd[0].length)]]);
  }
  // \displaystyle in display maths
  if (isDisplay) for (const m of txt.matchAll(/\\displaystyle(?![a-zA-Z])\s*/g)) add('displaystyle', [[m.index, m.index + m[0].length, '']]);
  // stacked spacing commands \,\,\, or \quad\quad
  for (const m of txt.matchAll(/(?:(?:\\[,:;! ]|\\quad|\\qquad|~)\s*){2,}/g)) {
    if (isProt(m.index, m.index + m[0].length)) continue;
    add('stackedSpace', [[m.index, m.index + m[0].length, m[0]]], { note: 'review' });
  }
  // spacing at the very start / end of the equation
  const body = txt.slice(bs, be);
  const lead = body.match(/^\s*((?:\\[,:;! ]|\\quad|\\qquad|~)\s*)+/);
  if (lead) add('edgeSpace', [[bs, bs + lead[0].length, body.match(/^\s*/)[0]]]);
  const trail = body.match(/((?:\\[,:;!]|\\quad|\\qquad|~)\s*)+$/);
  if (trail && (!lead || trail.index > lead[0].length)) add('edgeSpace', [[be - trail[0].length, be, '']]);
  // trailing \\ at the end of a multi-line environment
  const tb = body.match(/\\\\\s*((?:\\(?:label\{[^}]*\}|nonumber|notag)\s*)*)$/);
  if (tb && /\\begin\{/.test(txt.slice(0, bs))) { const at = be - tb[0].length; add('trailingBreak', [[at, at + 2, '']]); }
  // repeated spaces
  for (const m of txt.matchAll(/[ \t]{2,}/g)) {
    const a = m.index, b = a + m[0].length;
    const lineStart = a === 0 || txt[a - 1] === '\n';
    if (lineStart || isProt(a, b) || !inBody(a, b)) continue;
    add('spaces', [[a, b, ' ']]);
  }
  // order groups for display
  return ORDER.filter(k => groups[k]).map(k => groups[k]);
}
const INFO = {
  emptyScript:   [SAFE,  'Empty superscripts / subscripts', 'x^{} or x_{} adds nothing.', true],
  emptyCmd:      [SAFE,  'Empty formatting commands', 'e.g. \\mathrm{} or \\text{} with nothing inside.', true],
  emptyGroup:    [SAFE,  'Empty { } braces', 'Leftover braces with nothing inside (common after copy-paste or editors).', true],
  doubleBraces:  [SAFE,  'Double braces {{ }}', 'One pair is enough.', true],
  scriptBraces:  [SAFE,  'Braces around a one-character script', 'x^{2} → x^2. Same output, easier to read.', true],
  loneBraces:    [SAFE,  'Braces around a single symbol', 'a+{b} → a+b, \\sin{x} → \\sin x.', true],
  nestedFont:    [SAFE,  'Repeated font command', '\\mathrm{\\mathrm{x}} → \\mathrm{x}.', true],
  operatorname:  [SAFE,  'Built-in function names', '\\operatorname{sin} → \\sin (LaTeX already knows these).', true],
  displaystyle:  [SAFE,  '\\displaystyle in display maths', 'Display equations are already in display style.', true],
  trailingBreak: [SAFE,  'Trailing \\\\ on the last line', 'Creates an empty (and sometimes numbered) extra line.', true],
  edgeSpace:     [SAFE,  'Spacing at the start/end', 'Spacing commands at the edges of an equation have no visible effect or add unwanted gaps.', true],
  spaces:        [SAFE,  'Extra spaces in the code', 'Cosmetic only — LaTeX ignores them in maths.', true],
  leftRight:     [CHECK, '\\left … \\right around simple content', 'Plain brackets look tighter when nothing inside is tall. Keep them if you want auto-sizing.', false],
  emptyPrescript:[CHECK, 'Empty {} before a script', 'Often intentional, e.g. {}^{14}C for left-side scripts. Only remove if not.', false],
  stackedSpace:  [CHECK, 'Stacked spacing commands', 'Several spacing commands in a row (\\,\\,\\, …). Could be simplified — review manually.', false],
};
const ORDER = ['emptyScript', 'emptyCmd', 'emptyGroup', 'doubleBraces', 'scriptBraces', 'loneBraces', 'nestedFont', 'operatorname', 'displaystyle', 'trailingBreak', 'edgeSpace', 'spaces', 'leftRight', 'emptyPrescript', 'stackedSpace'];

export { INFO, ORDER, SAFE, CHECK };
// apply the suggestions: the safe ones (as ticked by default in the editor), or every one with { all: true }
export function cleanTeX(txt, { all = false, autoSize = false } = {}) {
  const groups = scanIssues(txt, autoSize), edits = [], taken = [];
  let n = 0;
  for (const g of groups) {
    const def = INFO[g.kind][3];
    if (!all && (!def || g.kind === 'stackedSpace')) continue;
    for (const it of g.items) {
      if (it.edits.some(([a, b]) => taken.some(([x, y]) => a < y && b > x))) continue;
      it.edits.forEach(e => { edits.push(e); taken.push([e[0], e[1]]); }); n++;
    }
  }
  edits.sort((x, y) => y[0] - x[0]);
  let out = txt; for (const [a, b, rep] of edits) out = out.slice(0, a) + rep + out.slice(b);
  return { text: out, changes: n };
}
