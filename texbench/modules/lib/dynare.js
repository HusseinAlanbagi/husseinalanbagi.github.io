// Reading a Dynare .mod file and writing its model block as LaTeX. No dependencies.
import { GREEK } from './latex-math.js';
const GREEK_SET = new Set(GREEK);

// ---- parse the .mod file -------------------------------------------------------------------
export function parseMod(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(\/\/|%).*$/gm, '');
  // blocks that reuse the word "var" or assign values that are not calibration
  const decls = text.replace(/(?<=^|;|\n)\s*(shocks|initval|endval|histval|estimated_params\w*|observation_trends|steady_state_model|mshocks|homotopy_setup)\b[^;]*;[\s\S]*?(?<=^|;|\n)\s*end\s*;/gm, ';');
  const decl = (kw) => {
    const out = [];
    for (const m of decls.matchAll(new RegExp(`(?<=^|;|\\n)\\s*${kw}\\b(?:\\s*\\([^)]*\\))?([^;]*);`, 'g'))) {
      const re = /([A-Za-z_]\w*)\s*(?:\$([^$]*)\$)?\s*(?:\(\s*long_name\s*=\s*'([^']*)'[^)]*\))?\s*,?/g;
      for (const d of m[1].matchAll(re)) if (d[1]) out.push({ name: d[1], tex: d[2]?.trim() || null, longName: d[3] || null });
    }
    return out;
  };
  const vars = decl('var'), exo = [...decl('varexo'), ...decl('varexo_det')], params = decl('parameters');
  const mm = /(?:^|;|\n)\s*model\s*(\([^)]*\))?\s*;([\s\S]*?)(?:^|;|\n)\s*end\s*;/m.exec(text);
  const linear = !!(mm && mm[1] && /linear/.test(mm[1]));
  const equations = [], locals = [];
  if (mm) {
    for (let stmt of mm[2].split(';')) {
      stmt = stmt.trim(); if (!stmt) continue;
      let name = null;
      const tag = /^\[([^\]]*)\]/.exec(stmt);
      if (tag) { const nm = /name\s*=\s*'([^']*)'/.exec(tag[1]); name = nm ? nm[1] : null; stmt = stmt.slice(tag[0].length).trim(); }
      if (stmt.startsWith('#')) { locals.push(stmt.slice(1).trim()); const l = /^#\s*([A-Za-z_]\w*)/.exec(stmt); if (l && !params.some(p => p.name === l[1])) params.push({ name: l[1], tex: null, longName: 'model-local variable', local: true }); equations.push({ src: stmt.slice(1).trim(), name, local: true }); continue; }
      equations.push({ src: stmt.replace(/\s+/g, ' '), name });
    }
  }
  // calibration: "beta = 0.99;" anywhere outside the model block
  const outside = mm ? decls.replace(mm[0], ';') : decls, values = {};
  const pnames = new Set(params.map(p => p.name));
  for (const m of outside.matchAll(/(?<=^|;|\n)\s*([A-Za-z_]\w*)\s*=\s*([^;=]+);/g)) if (pnames.has(m[1])) values[m[1]] = m[2].trim();
  for (const p of params) p.value = values[p.name] ?? null;
  return { vars, exo, params, equations, linear, hasModel: !!mm };
}

// ---- names -----------------------------------------------------------------------------------
// y -> y, pi -> \pi, rho_a -> \rho_{a}, eps_a -> \varepsilon_{a}, c_hat -> \hat{c}, inv -> \mathit{inv}
export function texName(name) {
  const parts = name.split('_').filter(Boolean);
  let accent = null, steady = false;
  for (const [suffix, cmd] of [['hat', 'hat'], ['tilde', 'tilde'], ['bar', 'bar']]) { const k = parts.indexOf(suffix); if (k > 0) { accent = cmd; parts.splice(k, 1); } }
  if (parts.length > 1 && /^(ss|SS|star)$/.test(parts[parts.length - 1])) { steady = true; parts.pop(); }
  const piece = (p, head) => {
    const m = /^([A-Za-z]+?)(\d+)$/.exec(p);
    if (m && head) return piece(m[1], true) + '_{' + m[2] + '}';
    if (p === 'eps' || p === 'epsilon') return '\\varepsilon';
    if (GREEK_SET.has(p)) return '\\' + p;
    if (GREEK_SET.has(p.toLowerCase()) && p === p.toUpperCase() && p.length > 1) return '\\' + p[0] + p.slice(1).toLowerCase();
    return p.length === 1 || /^\d+$/.test(p) ? p : head ? `\\mathit{${p}}` : `\\mathrm{${p}}`;
  };
  let base = piece(parts[0] || name, true), sub = parts.slice(1).map(p => piece(p, false)).join(',');
  const inner = /^(.*)_\{(\d+)\}$/.exec(base);
  if (inner) { base = inner[1]; sub = inner[2] + (sub ? ',' + sub : ''); }
  if (accent) base = `\\${accent}{${base}}`;
  return { base, sub, steady };
}

// ---- expressions -----------------------------------------------------------------------------
const FUNCS = { exp: '\\exp', log: '\\log', ln: '\\log', log10: '\\log_{10}', sqrt: 'sqrt', abs: 'abs', sin: '\\sin', cos: '\\cos', tan: '\\tan', max: '\\max', min: '\\min', normcdf: '\\Phi', normpdf: '\\phi', erf: '\\operatorname{erf}', sign: '\\operatorname{sign}' };
function tokenize(s) {
  const toks = [], re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(==|<=|>=|!=|[-+*/^()=,<>]))/y;
  let m; re.lastIndex = 0;
  while (re.lastIndex < s.length && (m = re.exec(s))) toks.push(m[1] != null ? { t: 'num', v: m[1] } : m[2] != null ? { t: 'id', v: m[2] } : { t: 'op', v: m[3] });
  return toks;
}
function parseExpr(toks) {
  let i = 0;
  const peek = () => toks[i], eat = (v) => (toks[i] && toks[i].v === v ? (i++, true) : false);
  const add = () => { let l = mul(); while (peek() && (peek().v === '+' || peek().v === '-')) { const op = toks[i++].v; l = { k: 'bin', op, l, r: mul() }; } return l; };
  const mul = () => { let l = unary(); while (peek() && (peek().v === '*' || peek().v === '/')) { const op = toks[i++].v; l = { k: 'bin', op, l, r: unary() }; } return l; };
  const unary = () => { if (eat('-')) return { k: 'neg', x: unary() }; if (eat('+')) return unary(); return pow(); };
  const pow = () => { const b = atom(); if (eat('^')) return { k: 'pow', b, e: unary() }; return b; };
  const atom = () => {
    const t = toks[i++];
    if (!t) return { k: 'num', v: '?' };
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.v === '(') { const e = add(); eat(')'); return { k: 'par', x: e }; }
    if (t.t === 'id') {
      if (peek() && peek().v === '(') {
        // lead/lag  x(+1)  x(-1)
        if (toks[i + 1] && (toks[i + 1].v === '+' || toks[i + 1].v === '-') && toks[i + 2]?.t === 'num' && toks[i + 3]?.v === ')') { const lag = (toks[i + 1].v === '-' ? -1 : 1) * +toks[i + 2].v; i += 4; return { k: 'var', name: t.v, lag }; }
        if (toks[i + 1]?.t === 'num' && toks[i + 2]?.v === ')' && !FUNCS[t.v] && !/^(STEADY_STATE|EXPECTATION)$/i.test(t.v)) { const lag = +toks[i + 1].v; i += 3; return { k: 'var', name: t.v, lag }; }
        i++; const args = []; if (!eat(')')) { do args.push(add()); while (eat(',')); eat(')'); }
        if (/^EXPECTATION$/i.test(t.v) && eat('(')) { const x = add(); eat(')'); return { k: 'expect', x }; }
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'var', name: t.v, lag: 0 };
    }
    return { k: 'num', v: t.v };
  };
  const lhs = add();
  if (eat('=')) return { k: 'eq', l: lhs, r: add() };
  return lhs;
}
const hasLead = (n) => !n || typeof n !== 'object' ? false : n.k === 'var' ? n.lag > 0 : n.k === 'expect' ? false : Object.values(n).some(v => Array.isArray(v) ? v.some(hasLead) : hasLead(v));

export function makePrinter(model, { expectations = true } = {}) {
  const kind = new Map();
  for (const v of model.vars) kind.set(v.name, { type: 'var', ...v });
  for (const v of model.exo) kind.set(v.name, { type: 'exo', ...v });
  for (const v of model.params) kind.set(v.name, { type: 'param', ...v });
  const symbol = (name, lag, timed) => {
    const info = kind.get(name);
    const t = timed ? (lag === 0 ? 't' : `t${lag > 0 ? '+' : '-'}${Math.abs(lag)}`) : '';
    if (info?.tex) return t ? (/[_^]/.test(info.tex) ? `{${info.tex}}_{${t}}` : `${info.tex}_{${t}}`) : info.tex;
    const n = texName(name);
    const sub = [n.sub, n.steady ? '' : t].filter(Boolean).join(',');
    return (n.steady ? `\\bar{${n.base}}` : n.base) + (sub ? `_{${sub}}` : '');
  };
  const sym = (name, lag = 0) => { const info = kind.get(name); return symbol(name, lag, info ? info.type !== 'param' : lag !== 0); };
  const prec = (n) => n.k === 'bin' ? (n.op === '+' || n.op === '-' ? 1 : 2) : n.k === 'neg' ? 1 : 4;
  const wrap = (x) => `\\left( ${x} \\right)`;
  function pr(n, top = false) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': return sym(n.name, n.lag);
      case 'par': return n.x.k === 'bin' || n.x.k === 'neg' ? wrap(pr(n.x)) : pr(n.x);
      case 'neg': return '-' + (prec(n.x) < 2 && n.x.k !== 'par' ? wrap(pr(n.x)) : pr(n.x));
      case 'pow': { const b = n.b.k === 'var' || n.b.k === 'num' ? pr(n.b) : n.b.k === 'par' ? wrap(pr(n.b.x)) : wrap(pr(n.b)); const e = n.e.k === 'par' ? pr(n.e.x) : pr(n.e); return `${/[_^]\{[^}]*\}$|\}$/.test(b) && n.b.k === 'var' ? b : b}^{${e}}`; }
      case 'call': {
        const a = n.args.map(x => pr(x)), f = FUNCS[n.fn];
        if (/^STEADY_STATE$/i.test(n.fn) && n.args[0]?.k === 'var') { const t = texName(n.args[0].name), info = kind.get(n.args[0].name); return `\\bar{${info?.tex || t.base + (t.sub ? `_{${t.sub}}` : '')}}`; }
        if (f === 'sqrt') return `\\sqrt{${a[0]}}`;
        if (f === 'abs') return `\\left| ${a[0]} \\right|`;
        const name = f || `\\operatorname{${n.fn.replace(/_/g, '\\_')}}`;
        return n.args.length === 1 && n.args[0].k === 'var' && /^\\(exp|log|sin|cos|tan)$/.test(name) ? `${name} ${a[0]}` : name + wrap(a.join(', '));
      }
      case 'expect': return `\\mathbb{E}_t\\left[ ${pr(n.x)} \\right]`;
      case 'eq': return `${side(n.l)} &= ${side(n.r)}`;
      case 'bin': {
        if (n.op === '/') return `\\frac{${pr(strip(n.l))}}{${pr(strip(n.r))}}`;
        if (n.op === '*') {
          const l = prec(n.l) < 2 ? wrap(pr(n.l)) : pr(n.l), r = prec(n.r) < 2 ? wrap(pr(n.r)) : pr(n.r);
          return /^[\d.]/.test(r) ? `${l} \\cdot ${r}` : /\d$/.test(l) && /^\\?[A-Za-z({\\]/.test(r) ? `${l} ${r}` : `${l} ${r}`;
        }
        const r = n.r.k === 'bin' && prec(n.r) === 1 && n.op === '-' ? wrap(pr(n.r)) : pr(n.r);
        return `${pr(n.l)} ${n.op} ${r}`;
      }
    }
    return '?';
  }
  const strip = (n) => (n.k === 'par' ? n.x : n);
  // one side of an equation: put E_t in front of every additive term that contains a lead
  function side(n) {
    if (!expectations || !hasLead(n)) return pr(n);
    const terms = []; (function split(x, sign) { if (x.k === 'bin' && (x.op === '+' || x.op === '-')) { split(x.l, sign); split(x.r, x.op === '-' ? -sign : sign); } else terms.push({ x, sign }); })(n, 1);
    return terms.map(({ x, sign }, idx) => {
      let neg = sign < 0; if (x.k === 'neg') { neg = !neg; x = x.x; }
      const body = hasLead(x) ? expectTerm(x) : (x.k === 'bin' && prec(x) === 1 ? wrap(pr(x)) : pr(x));
      return (idx === 0 ? (neg ? '-' : '') : neg ? ' - ' : ' + ') + body;
    }).join('');
  }
  function expectTerm(x) {
    // a product: keep the factors without leads outside the expectation
    const factors = []; (function fl(y) { if (y.k === 'bin' && y.op === '*') { fl(y.l); fl(y.r); } else factors.push(y); })(x);
    const out = factors.filter(f => !hasLead(f)), inn = factors.filter(hasLead);
    const outside = out.map(f => (prec(f) < 2 ? wrap(pr(f)) : pr(f))).join(' ');
    const inner = inn.map(f => (prec(f) < 2 ? wrap(pr(f)) : pr(f))).join(' ');
    const simple = inn.length === 1 && inn[0].k === 'var';
    return `${outside ? outside + ' ' : ''}\\mathbb{E}_t${simple ? ' ' + inner : `\\left[ ${inner} \\right]`}`;
  }
  return { sym, equation: (src) => pr(parseExpr(tokenize(src))), expr: (src) => pr(parseExpr(tokenize(src))) };
}

// ---- LaTeX output ----------------------------------------------------------------------------
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function modelToLatex(model, { expectations = true, labels = true, separate = false } = {}) {
  const p = makePrinter(model, { expectations });
  const rows = model.equations.map((e, i) => {
    let body = p.equation(e.src);
    if (!body.includes('&=')) body = body + ' &= 0';
    return { body, label: labels ? `eq:${e.name ? slug(e.name) : 'model-' + (i + 1)}` : null, name: e.name };
  });
  if (separate) return rows.map(r => `${r.name ? `% ${r.name}\n` : ''}\\begin{equation}${r.label ? `\\label{${r.label}}` : ''}\n  ${r.body.replace(' &=', ' =')}\n\\end{equation}`).join('\n');
  return '\\begin{align}\n' + rows.map((r, i) => `  ${r.body}${r.label ? ` \\label{${r.label}}` : ''}${i < rows.length - 1 ? ' \\\\' : ''}${r.name ? `  % ${r.name}` : ''}`).join('\n') + '\n\\end{align}';
}
const esc = (s) => String(s).replace(/([&%#_$])/g, '\\$1');
export function variableTable(model) {
  const p = makePrinter(model);
  const row = (v, what) => `    $${p.sym(v.name)}$ & \\texttt{${esc(v.name)}} & ${esc(v.longName || what)} \\\\`;
  return ['\\begin{table}[htbp]', '  \\centering', '  \\begin{tabular}{lll}', '    \\toprule', '    Symbol & Dynare name & Description \\\\', '    \\midrule',
    ...model.vars.map(v => row(v, '')), ...(model.exo.length ? ['    \\midrule', ...model.exo.map(v => row(v, 'Exogenous shock'))] : []),
    '    \\bottomrule', '  \\end{tabular}', '  \\caption{Model variables.}\\label{tab:variables}', '\\end{table}'].join('\n');
}
export function parameterTable(model) {
  const p = makePrinter(model);
  const val = (v) => v == null ? '' : /^[-+]?[\d.]+(e[-+]?\d+)?$/i.test(v) ? v : `$${p.expr(v)}$`;
  return ['\\begin{table}[htbp]', '  \\centering', '  \\begin{tabular}{llr}', '    \\toprule', '    Parameter & Description & Value \\\\', '    \\midrule',
    ...model.params.filter(x => !x.local).map(v => `    $${p.sym(v.name)}$ & ${esc(v.longName || '')} & ${val(v.value)} \\\\`),
    '    \\bottomrule', '  \\end{tabular}', '  \\caption{Calibration.}\\label{tab:calibration}', '\\end{table}'].join('\n');
}
