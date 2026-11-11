// Reading LaTeX maths the way an economist writes it: which symbols appear, with which time index,
// and whether an expectation operator covers them. Shared by the DSGE modules. No dependencies.

export const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'];
const GREEK_SET = new Set(GREEK);
const ACCENTS = new Set(['hat', 'widehat', 'bar', 'overline', 'tilde', 'widetilde', 'check', 'dot', 'ddot', 'breve', 'underline', 'vec']);
const FONTS = new Set(['mathbb', 'mathcal', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'boldsymbol', 'bm', 'text', 'textit', 'textrm', 'operatorname', 'mathds', 'mathscr', 'mathfrak', 'mathbbm']);
const BIGOPS = new Set(['sum', 'prod', 'int', 'lim', 'max', 'min', 'sup', 'inf', 'arg', 'argmax', 'argmin']);
const E_FONTS = new Set(['mathbb', 'mathrm', 'mathbf', 'operatorname', 'mathds', 'mathsf', 'mathbbm', 'mathcal']);
const TIME = /^t(?:\s*([+-])\s*(\d+|[a-z]))?$/;

// Read one argument starting at i: a {group}, a \command, or a single character. Returns { content, end }.
export function readArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    let depth = 0, j = i;
    for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
    return { content: s.slice(i + 1, j), end: Math.min(j + 1, s.length), start: i + 1 };
  }
  if (s[i] === '\\') { const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)); return { content: m[0], end: i + m[0].length, start: i }; }
  return { content: s[i] || '', end: i + 1, start: i };
}
const plain = (x) => x.replace(/\\(?:mathrm|text|textit|mathit|mathbf|textrm)\s*\{([^{}]*)\}/g, '$1').replace(/[{}\s]/g, '');

// Remove everything that is layout rather than maths, keeping string length (so positions still line up).
export function blank(src) {
  const pad = (m) => ' '.repeat(m.length);
  return src.replace(/(^|[^\\])%.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length))
    .replace(/\\(?:label|tag|ref|eqref|cite[a-z]*)\s*\{[^{}]*\}/g, pad)
    .replace(/\\(?:text|textrm|textit|mbox|intertext)\s*\{[^{}]*\}/g, pad)
    .replace(/\\(?:nonumber|notag|left|right|bigg?l?|Bigg?l?|biggr|Biggr|bigr|Bigr|displaystyle|quad|qquad|,|;|!|:)(?![a-zA-Z])/g, pad)
    .replace(/\\ /g, '  ');
}

// Scan one equation. Returns { symbols, operators } with character positions in `eq`.
//   symbol:   { key, tex, time, steady, pos, end }     time: null | 0 | ±n ; steady: null | 'bar' | 'ss' | 'star'
//   operator: { pos, from, to }                        an expectation operator and the stretch of text it covers
export function scan(eq, offset = 0, out = { symbols: [], operators: [] }) {
  const s = offset ? eq : blank(eq);
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    let base = null, accent = null, isE = false;
    const pos = i;
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)), name = m[1];
      i += m[0].length;
      if (ACCENTS.has(name)) { const a = readArg(s, i); i = a.end; accent = name; base = plain(a.content).replace(/^\\imath$/, 'i').replace(/^\\jmath$/, 'j'); if (!base) continue; }
      else if (FONTS.has(name)) { const a = readArg(s, i); i = a.end; const inner = plain(a.content); if (!inner || name.startsWith('text')) continue; isE = inner === 'E' && E_FONTS.has(name); base = /^(mathrm|mathit|operatorname)$/.test(name) ? inner : `\\${name}{${inner}}`; }
      else if (GREEK_SET.has(name)) base = '\\' + name;
      else if (BIGOPS.has(name)) { i = skipScripts(s, i); continue; }
      else if (name === 'imath') base = 'i'; else if (name === 'jmath') base = 'j'; else if (name === 'ell') base = '\\ell';
      else continue;       // \frac, \sqrt, \cdot, \log … : structure, not symbols
    } else if (/[A-Za-z]/.test(c)) { base = c; i++; }
    else { i++; continue; }

    // scripts
    let subs = [], label = '', time = null, steady = accent === 'bar' || accent === 'overline' ? 'bar' : null, primes = '';
    for (;;) {
      let j = i; while (s[j] === ' ') j++;
      if (s[j] === "'") { primes += "'"; i = j + 1; continue; }
      if (s[j] !== '_' && s[j] !== '^') break;
      const a = readArg(s, j + 1), raw = a.content.trim();
      if (s[j] === '_') {
        for (const part of splitTop(raw)) {
          const p = plain(part), tm = TIME.exec(p);
          if (tm) time = tm[1] ? (tm[1] === '-' ? -1 : 1) * (/\d/.test(tm[2]) ? +tm[2] : 1) : 0;
          else if (p === 'ss') steady = 'ss'; else if (p) subs.push(p);
        }
      } else {
        const p = plain(raw);
        if (p === '*' || p === '\\ast' || p === '\\star') steady = 'star';
        else if (p === 'ss') steady = 'ss';
        else if (p === '\\prime') primes += "'";
        else if (/^[A-Za-z]{1,3}$/.test(p)) label = p;               // R^k_t, \pi^w_t: a label, not a power
        else scan(' '.repeat(offset + a.start) + raw, 1, out).symbols;   // a power: look inside it
      }
      i = a.end;
    }
    if (isE || (base === 'E' && !accent && time !== null && !subs.length && !label)) { out.operators.push({ pos: offset ? pos : pos, ...scope(s, i) }); continue; }
    const tex = (accent ? `\\${accent}{${base}}` : base) + (label ? `^{${label}}` : '') + (subs.length ? `_{${subs.join(',')}}` : '') + primes;
    out.symbols.push({ key: tex, base, accent, subs, label, tex, time, steady, pos, end: i });
  }
  if (!offset) for (const sym of out.symbols) sym.expected = out.operators.some(o => sym.pos >= o.from && sym.pos < o.to);
  return out;
}
function skipScripts(s, i) {
  for (;;) { let j = i; while (s[j] === ' ') j++; if (s[j] !== '_' && s[j] !== '^') return i; i = readArg(s, j + 1).end; }
}
function splitTop(x) {
  const parts = []; let depth = 0, cur = '';
  for (let k = 0; k < x.length; k++) { const ch = x[k]; if (ch === '{') depth++; else if (ch === '}') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur); return parts;
}
const OPEN = { '(': ')', '[': ']', '{': '}' };
// What an expectation operator ending at i applies to: a bracketed group if one follows, otherwise the current term.
function scope(s, i) {
  let j = i; while (s[j] === ' ') j++;
  let k = j; if (s[k] === '\\' && (s[k + 1] === '{' || s[k + 1] === '[')) k++;
  if (OPEN[s[k]]) {
    const open = s[k], close = OPEN[open]; let depth = 0, m = k;
    for (; m < s.length; m++) { if (s[m] === '\\' && s[m + 1] !== open && s[m + 1] !== close) { m++; continue; } if (s[m] === open) depth++; else if (s[m] === close && --depth === 0) break; }
    return { from: j, to: m + 1 };
  }
  let depth = 0, m = j, started = false;
  for (; m < s.length; m++) {
    const ch = s[m];
    if (ch === '\\') { if (s[m + 1] === '\\') break; m++; started = true; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') { if (--depth < 0) break; }
    else if (depth === 0 && (ch === '=' || ch === '&' || ((ch === '+' || ch === '-') && started))) break;
    if (ch !== ' ') started = true;
  }
  return { from: j, to: m };
}

// Find the display equations of a .tex source. Returns [{ tex, line, env }], one per row of an align.
const ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat';
export function findEquations(src) {
  const out = [], lineAt = (idx) => src.slice(0, idx).split('\n').length;
  const clean = src.replace(/(^|[^\\])%.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
  const re = new RegExp(`\\\\begin\\{(${ENVS})(\\*?)\\}(?:\\{[^}]*\\})?([\\s\\S]*?)\\\\end\\{\\1\\2\\}|\\\\\\[([\\s\\S]*?)\\\\\\]`, 'g');
  for (const m of clean.matchAll(re)) {
    const body = m[3] ?? m[4], start = m.index + m[0].indexOf(body);
    let at = 0;
    for (const row of splitRows(body)) {
      const idx = start + at; at += row.length + 2;
      const lead = row.length - row.trimStart().length;
      if (row.trim()) out.push({ tex: src.slice(idx, idx + row.length), line: lineAt(idx + lead), env: m[1] || 'display', index: idx });
    }
  }
  return out;
}
function splitRows(body) {
  // split at \\ that are not inside an inner environment (cases, matrix, aligned …)
  const rows = []; let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('\\begin{', i)) depth++; else if (body.startsWith('\\end{', i)) depth--;
    if (body[i] === '\\' && body[i + 1] === '\\' && depth === 0) { rows.push(cur); cur = ''; i++; if (body[i + 1] === '[') { const e = body.indexOf(']', i); cur = ' '.repeat(e - i); i = e; } continue; }
    cur += body[i];
  }
  rows.push(cur); return rows;
}

// LaTeX equation -> Dynare model line (a draft: always check it before running).
export function toDynare(eq, { dropAccents = true } = {}) {
  const names = new Map(), notes = [];
  const body = blank(eq).replace(/&/g, ' ').replace(/[.,;]\s*$/, '').trim();
  const text = conv(body);
  return { text: text.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/\(- /g, '(-').replace(/^- /, '-').replace(/= - /g, '= -').trim() + ';', names, notes };

  function ident(sym) {
    let b = sym.base.replace(/^\\(?:mathbb|mathcal|mathbf|bm|boldsymbol|mathsf)\{(.*)\}$/, '$1').replace(/^\\/, '').replace(/^var(epsilon|phi|theta|rho|sigma|pi)$/, '$1').replace(/^epsilon$/, 'eps').replace(/^ell$/, 'l');
    let name = b + (sym.label ? '_' + sym.label : '') + sym.subs.map(x => '_' + x.replace(/^\\/, '').replace(/[^A-Za-z0-9]/g, '')).join('');
    if (sym.accent && !(dropAccents && /^(hat|widehat|tilde|widetilde)$/.test(sym.accent))) name += '_' + sym.accent.replace('overline', 'bar').replace(/^wide/, '');
    if (sym.steady === 'ss' || sym.steady === 'star') name += '_ss';
    name = name.replace(/'/g, '_p');
    names.set(name, sym.time !== null ? 'var' : (names.get(name) || 'param'));
    return name + (sym.time ? `(${sym.time > 0 ? '+' : ''}${sym.time})` : '');
  }
  function conv(s) {
    const out = []; let i = 0;
    const push = (tok, kind) => { const prev = out[out.length - 1]; if (prev && (prev.kind === 'val' || prev.kind === 'close') && (kind === 'val' || kind === 'open' || kind === 'func')) out.push({ t: '*', kind: 'op' }); out.push({ t: tok, kind }); };
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/\d/.test(c)) { const m = /^\d+(?:\.\d+)?/.exec(s.slice(i)); push(m[0], 'val'); i += m[0].length; continue; }
      if (c === '.' && /\d/.test(s[i + 1] || '')) { const m = /^\.\d+/.exec(s.slice(i)); push('0' + m[0], 'val'); i += m[0].length; continue; }
      if ('+-=/*'.includes(c)) { out.push({ t: c === '=' ? ' = ' : c === '+' || c === '-' ? ` ${c} ` : c, kind: 'op' }); i++; continue; }
      if (c === '(' || c === '[') { push('(', 'open'); i++; continue; }
      if (c === ')' || c === ']') { out.push({ t: ')', kind: 'close' }); i++; i = power(s, i, out); continue; }
      if (c === '{') { const a = readArg(s, i); push('(' + conv(a.content) + ')', 'val'); i = a.end; i = power(s, i, out); continue; }
      if (c === '}') { i++; continue; }
      if (c === '\\') {
        const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)), name = m[1];
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') { const a = readArg(s, i + m[0].length), b = readArg(s, a.end); push(`(${conv(a.content)})/(${conv(b.content)})`, 'val'); out[out.length - 1].t = wrapFrac(conv(a.content), conv(b.content)); i = b.end; i = power(s, i, out); continue; }
        if (name === 'sqrt') { const a = readArg(s, i + m[0].length); push(`sqrt(${conv(a.content)})`, 'val'); i = a.end; continue; }
        if (name === 'exp' || name === 'log' || name === 'ln') {
          i += m[0].length; let j = i; while (s[j] === ' ') j++;
          if (s[j] === '(' || s[j] === '[' || s[j] === '{') { push(name === 'ln' ? 'log' : name, 'func'); i = j; if (s[j] === '{') { const a = readArg(s, j); out.push({ t: '(' + conv(a.content) + ')', kind: 'close' }); i = a.end; } else { out.push({ t: '(', kind: 'open' }); i = j + 1; } }
          else { const len = atomLength(s, j), syms = scan(' '.repeat(j) + s.slice(j, j + len), 1).symbols, one = syms[syms.length - 1]; if (one) { const sup = powerOf(s, j, len); push(`${name === 'ln' ? 'log' : name}(${ident(one)}${sup != null ? '^(' + conv(sup) + ')' : ''})`, 'val'); } i = j + Math.max(len, 1); }
          continue;
        }
        if (name === 'cdot' || name === 'times' || name === 'ast') { out.push({ t: '*', kind: 'op' }); i += m[0].length; continue; }
        if (name === '{') { push('(', 'open'); i += 2; continue; }
        if (name === '}') { out.push({ t: ')', kind: 'close' }); i += 2; i = power(s, i, out); continue; }
        if (name === 'sum' || name === 'prod' || name === 'int') { notes.push(`\\${name} cannot be written in a Dynare model line; expand it by hand.`); i = skipScripts(s, i + m[0].length); push(`/* \\${name} */`, 'val'); continue; }
        if (name === '\\') { i += 2; continue; }
      }
      // a symbol (or an expectation operator, which Dynare does not need)
      const r = scan(' '.repeat(i) + firstAtom(s, i), 1);
      const len = atomLength(s, i);
      if (r.symbols.length) {
        const sym = r.symbols[r.symbols.length - 1];
        let tok = ident(sym);
        const sup = powerOf(s, i, len);
        if (sup != null) tok += `^(${conv(sup)})`.replace(/\^\((\w+|\d+(?:\.\d+)?)\)$/, '^$1');
        push(tok, 'val');
      } else if (!r.operators.length && len === 0) { i++; continue; }
      i += Math.max(len, 1);
    }
    return out.map(o => o.t).join('');
  }
  function wrapFrac(a, b) { const simple = (x) => /^[\w.]+(\([+-]?\d+\))?$/.test(x); return `${simple(a) ? a : '(' + a + ')'}/${simple(b) ? b : '(' + b + ')'}`; }
  function power(s, i, out) { let j = i; while (s[j] === ' ') j++; if (s[j] !== '^') return i; const a = readArg(s, j + 1); out.push({ t: `^(${conv(a.content)})`.replace(/\^\((\w+|\d+(?:\.\d+)?)\)$/, '^$1'), kind: 'close' }); return a.end; }
  // helpers that delimit one atom (base plus its scripts) in s starting at i
  function atomLength(s, i) {
    let j = i;
    if (s[j] === '\\') { const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(j)); j += m[0].length; if (ACCENTS.has(m[1]) || FONTS.has(m[1])) j = readArg(s, j).end; else if (!GREEK_SET.has(m[1]) && !['imath', 'jmath', 'ell'].includes(m[1])) return m[0].length; }
    else if (/[A-Za-z]/.test(s[j])) j++; else return 0;
    for (;;) { let k = j; while (s[k] === ' ') k++; if (s[k] === "'") { j = k + 1; continue; } if (s[k] !== '_' && s[k] !== '^') break; j = readArg(s, k + 1).end; }
    return j - i;
  }
  function firstAtom(s, i) { return s.slice(i, i + atomLength(s, i)); }
  function powerOf(s, i, len) {
    // the superscript of this atom, if it is a power rather than a label
    const atom = s.slice(i, i + len); let j = atom.search(/[_^']/); if (j < 0) return null;
    while (j < atom.length) { let k = j; while (atom[k] === ' ') k++; if (atom[k] === "'") { j = k + 1; continue; } if (atom[k] !== '_' && atom[k] !== '^') break; const a = readArg(atom, k + 1); if (atom[k] === '^') { const p = plain(a.content); if (!(p === '*' || p === 'ss' || p === '\\ast' || p === '\\star' || p === '\\prime' || /^[A-Za-z]{1,3}$/.test(p))) return a.content; } j = a.end; }
    return null;
  }
}
