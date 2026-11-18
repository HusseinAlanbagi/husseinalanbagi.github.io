// Checks for the equations of a DSGE model, as you write them:
//   timing    - a future-dated variable with no expectation operator; a symbol dated both t+1 and t-1 without expectations
//   notation  - two steady-state styles in one paper; a symbol used both with and without a time index
//   counting  - equations of the final model against its endogenous variables
// Which equations are the model: by default the numbered ones (no starred environments, no \nonumber rows; a multline
// is one equation). A comment  % model  or  % not model  on an equation's \begin line (or on a row's own line) overrides
// that, and the comment lines  % model-begin / % model-end  still limit the check to what is between them.
// Variables come only from the chosen equations. Their type (endogenous, shock, parameter, ignore) and Dynare name
// can be set by hand; that is kept per project and used by the Dynare export.
import { scan, findEquations, symName, multiLetterCandidates } from './lib/latex-math.js';
import { parseMod } from './lib/dynare.js';
import { modelState } from './lib/model-state.js';
import { loadMathJax, mathSvg } from './lib/mathjax.js';

const SHOCK = /^\\(varepsilon|epsilon|eta|nu|xi|zeta|upsilon)$|^[ue]$/;
const STYLE = { bar: 'a bar (\\bar{x})', ss: 'the subscript ss (x_{ss})', star: 'a star (x^{*})' };
const TYPES = [['endo', 'Endogenous', 'E'], ['shock', 'Shock', 'S'], ['param', 'Parameter', 'P'], ['ignore', 'Ignore', '–']];
const show = (s, t) => `${s.tex}${t == null ? '' : `, dated ${t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t}`}`;

// files: [{ path, text }]; opts: { mode: 'numbered' | 'all', multi: [names], vars: { key: { type, name } } }
export function checkProject(files, opts = {}) {
  const mode = opts.mode || 'numbered', multi = new Set(opts.multi || []), chosen = opts.vars || {};
  const eqs = [], envs = new Map();
  let marked = false;
  for (const { path, text } of files) {
    const marks = [...text.matchAll(/^[ \t]*%+[ \t]*model-(begin|end)\b.*$/gm)].map(m => ({ kind: m[1], line: text.slice(0, m.index).split('\n').length }));
    if (marks.length) marked = true;
    const inMarks = (line) => { if (!marks.length) return true; let on = false; for (const m of marks) { if (m.line > line) break; on = m.kind === 'begin'; } return on; };
    const envMap = new Map(); envs.set(path, envMap);
    const lists = listBlocks(text).map(b => [b.beginLine, b.endLine]);
    for (const e of findEquations(text)) {
      if (lists.some(([a, z]) => e.line >= a && e.line <= z)) continue;      // the list of model equations is a copy, never counted
      let r; try { r = scan(e.tex, 0, undefined, multi); } catch { continue; }
      const candidate = r.symbols.some(s => s.time !== null) && /=/.test(e.tex.replace(/%.*$/gm, ''));
      const auto = marks.length ? inMarks(e.line) && candidate : candidate && (mode === 'all' || e.numbered);
      const inModel = e.override ? e.override === 'in' : auto;
      const row = { ...e, file: path, ...r, auto, inModel, candidate };
      eqs.push(row);
      // per environment, for the chips in the visual view
      {        // every display equation can be ticked into the model, not only the candidates
        const st = envMap.get(e.envLine) || { in: 0, out: 0, auto: 0, rows: 0, override: null };
        st.rows++; st[inModel ? 'in' : 'out']++; if (auto) st.auto++; st.override = e.envOverride;
        envMap.set(e.envLine, st);
      }
    }
  }
  const problems = [], add = (e, severity, message) => problems.push({ file: e.file, line: e.line, severity, message });
  const model = eqs.filter(e => e.inModel);
  const usesE = model.some(e => e.operators.length);

  // ---- timing
  const lead = new Map(), lag = new Map();
  for (const e of model) for (const s of e.symbols) {
    if (s.time > 0 && !s.expected) { if (!lead.has(s.key)) lead.set(s.key, []); lead.get(s.key).push(e); }
    if (s.time < 0) { if (!lag.has(s.key)) lag.set(s.key, e); }
  }
  for (const e of model) {
    const seen = new Set();
    for (const s of e.symbols) {
      if (!(s.time > 0) || s.expected || seen.has(s.key)) continue; seen.add(s.key);
      if ((chosen[s.key] || {}).type === 'ignore') continue;
      if (lag.has(s.key)) add(e, 'warning', `Timing: ${s.tex} is dated t+${s.time} here with no expectation, and t−1 in another equation (line ${lag.get(s.key).line}). Check which dating convention you use for it.`);
      else if (usesE && !SHOCK.test(s.base) && (chosen[s.key] || {}).type !== 'shock') {
        const soleLhs = e.symbols[0] === s && e.tex.indexOf('=') > s.pos;
        if (!soleLhs) add(e, 'warning', `Timing: ${show(s, s.time)}, has no expectation operator. Other equations use one.`);
      }
    }
  }

  // ---- notation
  const styles = new Map();
  for (const e of eqs) for (const s of e.symbols) if (s.steady) { if (!styles.has(s.steady)) styles.set(s.steady, []); styles.get(s.steady).push({ e, s }); }
  if (styles.size > 1) {
    const ranked = [...styles].sort((a, b) => b[1].length - a[1].length), main = ranked[0][0];
    // a star is often something else (foreign variable, optimal price): only report bar against ss
    const clash = ranked.slice(1).filter(([k]) => k !== 'star' && main !== 'star');
    for (const [k, list] of clash) { const done = new Set(); for (const { e, s } of list) { if (done.has(e)) continue; done.add(e); add(e, 'info', `Notation: steady state written with ${STYLE[k]} here (${s.tex}${k === 'ss' ? '_{ss}' : k === 'star' ? '^{*}' : ''}), but with ${STYLE[main]} in most other places.`); } }
  }
  const dated = new Map(), undated = new Map();
  for (const e of model) for (const s of e.symbols) { if (s.steady) continue; const m = s.time !== null ? dated : undated; if (!m.has(s.key)) m.set(s.key, e); }
  for (const [k, e] of undated) if (dated.has(k) && (chosen[k] || {}).type !== 'param') add(e, 'info', `Notation: ${k} has no time index here, but has one in another equation (line ${dated.get(k).line}). If this is its steady state, mark it; if it is a parameter, give it another symbol.`);

  // ---- variables of the chosen equations
  const vars = new Map();
  model.forEach((e, ei) => {
    for (const s of e.symbols) {
      if (s.steady) continue;
      let v = vars.get(s.key);
      if (!v) {
        const autoType = dated.has(s.key) ? (SHOCK.test(s.base) ? 'shock' : 'endo') : 'param';
        const set = chosen[s.key] || {};
        v = { key: s.key, tex: s.tex, autoType, type: set.type || autoType, autoName: symName(s), name: set.name || symName(s), eqs: new Set(), times: new Set(), manual: !!(set.type || set.name) };
        vars.set(s.key, v);
      }
      v.eqs.add(ei); if (s.time !== null) v.times.add(s.time);
    }
  });
  const list = [...vars.values()];
  const of = (t) => list.filter(v => v.type === t);
  // Dynare names must be unique
  const byName = new Map(); for (const v of list) if (v.type !== 'ignore') { if (!byName.has(v.name)) byName.set(v.name, []); byName.get(v.name).push(v); }
  for (const [n, vs] of byName) if (vs.length > 1) add(model[[...vs[0].eqs][0]], 'warning', `Dynare names: ${vs.map(v => v.tex).join(' and ')} would both be called ${n}. Give one of them another name in the variables table.`);

  // ---- multi-letter names written like rer_t that are read as r·e·r_t
  const known = new Set(multi), suggestions = new Set();
  for (const e of model.length ? model : eqs) for (const w of multiLetterCandidates(e.tex)) if (!known.has(w)) suggestions.add(w);

  const summary = { equations: model.length, endo: of('endo'), shocks: of('shock'), params: of('param'), ignored: of('ignore'), marked, mode, candidates: eqs.filter(e => e.candidate).length, first: model[0] || null };
  return { problems, summary, model, all: eqs, vars: list, suggestions: [...suggestions], envs };
}

// Compare the model of the paper with a Dynare .mod file
export function compareMod(result, src) {
  const mod = parseMod(src), eqsMod = mod.equations.filter(e => !e.local);
  const names = (arr) => new Set(arr.map(v => v.name));
  const paper = { endo: names(result.summary.endo), shocks: names(result.summary.shocks), params: names(result.summary.params) };
  const declared = { endo: names(mod.vars), shocks: names(mod.exo), params: names(mod.params.filter(p => !p.local)) };
  const used = new Set(eqsMod.flatMap(e => e.src.match(/[A-Za-z_]\w*/g) || []));
  const minus = (a, b) => [...a].filter(x => !b.has(x));
  const rows = ['endo', 'shocks', 'params'].map(k => ({ kind: k, paperOnly: minus(paper[k], declared[k]), modOnly: minus(declared[k], paper[k]) }));
  return {
    counts: { paperEqs: result.summary.equations, modEqs: eqsMod.length, paperEndo: paper.endo.size, modEndo: declared.endo.size, paperShocks: paper.shocks.size, modShocks: declared.shocks.size, paperParams: paper.params.size, modParams: declared.params.size },
    rows,
    unusedVars: [...declared.endo].filter(n => !used.has(n)), unusedShocks: [...declared.shocks].filter(n => !used.has(n)), unusedParams: [...declared.params].filter(n => !used.has(n)),
  };
}

// ---- the list of model equations, written into the paper as a section
// A block from "% model-list-begin {options}" to "% model-list-end". Its equations are never counted, and
// "Update the list" rewrites it from the options stored on its first line.
export const LIST_DEFAULTS = { title: 'Model equations', level: 'section*', group: 'one', tags: true };
export function listBlocks(text) {
  const out = [], re = /^[ \t]*%+[ \t]*model-list-begin\b([^\n]*)$/gm;
  for (const m of text.matchAll(re)) {
    const endRe = /^[ \t]*%+[ \t]*model-list-end\b[^\n]*$/gm; endRe.lastIndex = m.index + m[0].length;
    const e = endRe.exec(text); if (!e) continue;
    let opts = {}; try { const j = /\{.*\}/.exec(m[1]); if (j) opts = JSON.parse(j[0]); } catch {}
    const lineOf = (i) => text.slice(0, i).split('\n').length;
    out.push({ from: m.index, to: e.index + e[0].length, opts: { ...LIST_DEFAULTS, ...opts }, beginLine: lineOf(m.index), endLine: lineOf(e.index) });
  }
  return out;
}
// the heading each equation sits under: its \subsection, else its \section
function headingsOf(text) {
  const lists = listBlocks(text), out = [];
  for (const m of text.matchAll(/\\(section|subsection)\*?\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
    if (lists.some(b => m.index >= b.from && m.index < b.to)) continue;
    if (/(^|[^\\])%/.test(text.slice(text.lastIndexOf('\n', m.index) + 1, m.index))) continue;      // a commented-out heading
    out.push({ index: m.index, level: m[1], title: m[2].replace(/\\[a-zA-Z]+\s*\{([^{}]*)\}/g, '$1').replace(/\\[a-zA-Z]+/g, '').replace(/[{}~]/g, ' ').replace(/\s+/g, ' ').trim() });
  }
  return out;
}
const topAmp = (t) => {          // put & before the first "=" that is not inside braces
  let d = 0;
  for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '\\') { i++; continue; } if (c === '{') d++; else if (c === '}') d--; else if (c === '=' && d === 0) return t.slice(0, i).trimEnd() + ' &= ' + t.slice(i + 1).trimStart(); }
  return '& ' + t;
};
// files: [{ path, text }] in paper order; model: checkProject(...).model
export function modelListTeX(model, files, opts = {}) {
  const o = { ...LIST_DEFAULTS, ...opts };
  // where each file sits in the paper: the chain of \input positions from the main file (files[0])
  const by = new Map(files.map(f => [f.path, f])), place = new Map();
  const find = (name) => { const n = name.trim().replace(/^\.\//, ''); return [...by.keys()].find(p => p === n || p === n + '.tex' || p.toLowerCase() === n.toLowerCase() || p.toLowerCase() === (n + '.tex').toLowerCase()) || null; };
  const walk = (path, chain) => { if (!path || place.has(path)) return; place.set(path, chain); for (const m of by.get(path).text.replace(/(^|[^\\])%.*$/gm, (x, a) => a + ' '.repeat(x.length - a.length)).matchAll(/\\(?:input|include|subfile)\s*\{([^}]*)\}/g)) walk(find(m[1]), [...chain, m.index]); };
  if (files[0]) walk(files[0].path, []);
  files.forEach((f, k) => { if (!place.has(f.path)) place.set(f.path, [1e9 + k]); });
  const key = (file, idx) => [...place.get(file), idx];
  const cmp = (a, b) => { for (let k = 0; k < Math.max(a.length, b.length); k++) { const x = a[k] ?? -1, y = b[k] ?? -1; if (x !== y) return x - y; } return 0; };
  model = [...model].sort((a, b) => cmp(key(a.file, a.index), key(b.file, b.index)));
  // the heading an equation sits under, across files: every heading of the paper, in paper order
  const heads = files.flatMap(f => headingsOf(f.text).map(hd => ({ ...hd, key: key(f.path, hd.index) }))).sort((a, b) => cmp(a.key, b.key));
  const under = (e) => { const k = key(e.file, e.index); let sec = null, sub = null; for (const hd of heads) { if (cmp(hd.key, k) > 0) break; if (hd.level === 'section') { sec = hd.title; sub = null; } else sub = hd.title; } return sub || sec || 'Other'; };
  const row = (e) => {
    const label = (/\\label\s*\{([^}]*)\}/.exec(e.tex) || [])[1];
    let t = e.tex.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(?:nonumber|notag)(?![A-Za-z])/g, '').replace(/\\tag\*?\s*\{[^}]*\}/g, '')
      .replace(/\\(?:begin|end)\{split\}/g, '').replace(/\s+/g, ' ').trim();
    if (!/(^|[^\\])&/.test(t)) t = topAmp(t);
    return { t: t + (o.tags && label ? ` \\tag{\\ref{${label}}}` : ''), from: label || `${e.file} line ${e.line}` };
  };
  const groups = [];
  for (const e of model) { const g = o.group === 'subsection' ? under(e) : ''; if (!groups.length || groups[groups.length - 1].title !== g) groups.push({ title: g, rows: [] }); groups[groups.length - 1].rows.push(row(e)); }
  const star = /\*$/.test(o.level) ? '*' : '', lvl = o.level.replace('*', ''), sub = lvl === 'section' ? 'subsection' : 'subsubsection';
  const block = (rows) => '\\begin{align*}\n' + rows.map((r, i) => `  ${r.t}${i < rows.length - 1 ? ' \\\\' : ''} % from ${r.from}`).join('\n') + '\n\\end{align*}';
  const body = groups.map(g => (g.title ? `\\${sub}${star}{${g.title}}\n` : '') + block(g.rows)).join('\n');
  return `% model-list-begin ${JSON.stringify(o)}\n% Written by StochaTeX from the equations in the model; "Update the list" (Model check) rewrites everything up to model-list-end.\n\\${lvl}${star}{${o.title}}\n${body}\n% model-list-end`;
}
// files in paper order: the main file, then what it \input s (depth first), then the rest
export function paperOrder(list, main) {
  const by = new Map(list.map(f => [f.path, f])), seen = new Set(), out = [];
  const find = (name) => { const n = name.trim().replace(/^\.\//, ''); for (const c of [n, n + '.tex']) { const hit = [...by.keys()].find(p => p === c || p.toLowerCase() === c.toLowerCase()); if (hit) return hit; } return null; };
  const visit = (p) => { if (!p || seen.has(p)) return; seen.add(p); const f = by.get(p); out.push(f); for (const m of f.text.replace(/(^|[^\\])%.*$/gm, '$1').matchAll(/\\(?:input|include|subfile)\s*\{([^}]*)\}/g)) visit(find(m[1])); };
  visit(main && by.has(main) ? main : null);
  for (const f of list) if (!seen.has(f.path)) { seen.add(f.path); out.push(f); }
  return out;
}

export default {
  id: 'model-checks',
  name: 'Model checks',
  description: 'Checks the model as you write: counts the equations of the final model (the numbered ones, unless you mark others) against its endogenous variables; a variables table with types and Dynare names; comparison with a .mod file; missing expectation operators, mixed timing and mixed steady-state notation.',
  category: 'DSGE',
  activate(ctx) {
    const h = ctx.h;
    let box, timer, last = null;
    const pid = () => ctx.project.id || 'default';
    const getVars = () => ctx.settings.get('vars:' + pid(), {});
    const getMulti = () => ctx.settings.get('multi:' + pid(), []);
    const mode = () => ctx.settings.get('mode', 'numbered');
    const setVar = (key, patch) => { const all = { ...getVars() }; const cur = { ...(all[key] || {}), ...patch }; for (const k of Object.keys(cur)) if (cur[k] == null || cur[k] === '') delete cur[k]; if (Object.keys(cur).length) all[key] = cur; else delete all[key]; ctx.settings.set('vars:' + pid(), all); run(); };
    const setMulti = (list) => { ctx.settings.set('multi:' + pid(), [...new Set(list)]); run(); };
    const files = () => paperOrder(ctx.project.files().filter(p => /\.tex$/i.test(p) && ctx.project.isText(p)).map(path => ({ path, text: ctx.project.read(path) || '' })), ctx.project.mainFile);

    function run() {
      let r; try { r = checkProject(files(), { mode: mode(), multi: getMulti(), vars: getVars() }); } catch (e) { console.error('model checks', e); return; }
      // lists of model equations in the paper that no longer match the model
      r.lists = [];
      const fl = files();
      for (const f of fl) for (const b of listBlocks(f.text)) {
        const now = modelListTeX(r.model, fl, b.opts), stale = now.replace(/\s+/g, '') !== f.text.slice(b.from, b.to).replace(/\s+/g, '');
        r.lists.push({ file: f.path, line: b.beginLine, stale, opts: b.opts });
        if (stale) r.problems.push({ file: f.path, line: b.beginLine, severity: 'info', message: 'The list of model equations here is out of date: the model has changed. Use “Update the list” in the Model check panel (or the command “Model equations: update the list”).' });
      }
      last = r; modelState.set({ ...r, multi: getMulti() });
      ctx.problems.set(r.problems);
      if (box) draw();
      if (openViz) openViz.refresh();
    }

    // ---- the panel
    const chip = (v) => { const b = h('button', { class: 'mc-chip mc-' + v.type + (v.manual ? ' mc-manual' : ''), title: `${v.tex} · ${TYPES.find(t => t[0] === v.type)[1]} · Dynare name ${v.name}. Click to change.`, onClick: (e) => typeMenu(e.currentTarget, v) }, v.tex); const svg = window.MathJax?.tex2svg ? mathSvg(v.tex) : ''; if (svg) { b.innerHTML = svg; b.classList.add('mc-typeset'); } return b; };
    let mjAsked = false;
    function typeMenu(anchor, v) {
      ctx.ui.menu(anchor, [{ heading: v.tex + ' is …' },
        ...TYPES.map(([k, label]) => ({ label: (v.type === k ? '✓ ' : '') + label + (v.autoType === k ? ' (guessed)' : ''), onClick: () => setVar(v.key, { type: k === v.autoType ? null : k }) })),
        '-', { label: `Dynare name: ${v.name}…`, onClick: async () => { const n = prompt(`Dynare name for ${v.tex}`, v.name); if (n != null) setVar(v.key, { name: n.trim() === v.autoName ? null : n.trim().replace(/[^A-Za-z0-9_]/g, '_') }); } }]);
    }
    function draw() {
      if (!mjAsked && !window.MathJax?.tex2svg) { mjAsked = true; loadMathJax().then(() => box && last && draw()).catch(() => {}); }
      const r = last, s = r.summary;
      const pad = { padding: '0 10px' };
      const modeSel = h('select', { class: 'small', title: 'Which display equations make up the model', onChange: (e) => { ctx.settings.set('mode', e.target.value); run(); } },
        h('option', { value: 'numbered', selected: mode() === 'numbered' }, 'Numbered equations'),
        h('option', { value: 'all', selected: mode() === 'all' }, 'All display equations'));
      const head = h('div', { style: { ...pad, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', margin: '2px 0 6px' } }, h('span', { class: 'muted' }, 'Model:'), modeSel);
      if (!s.equations) return box.replaceChildren(head, h('p', { class: 'muted', style: pad }, s.candidates ? `None of the ${s.candidates} equations with time indices is in the model yet. Number them, choose “All display equations”, or put % model on their \\begin line.` : 'No model equations found yet (display equations with time indices such as x_t).'));
      const ok = s.equations === s.endo.length;
      const group = (title, items, open) => h('details', { open: open || null, style: { padding: '0 10px 4px' } }, h('summary', { style: { cursor: 'pointer' } }, `${items.length} ${title}`), h('div', { class: 'mc-chips' }, ...(items.length ? items.map(chip) : [h('span', { class: 'muted' }, '—')])));
      const multi = getMulti();
      box.replaceChildren(...[
        head,
        h('p', { style: { ...pad, margin: '4px 0 6px' } }, h('strong', { style: { color: ok ? 'var(--ok, #177245)' : 'var(--warn, #9a6700)' } }, ok ? '✓ ' : '⚠ '), `${s.equations} equation${s.equations === 1 ? '' : 's'}, ${s.endo.length} endogenous variable${s.endo.length === 1 ? '' : 's'}`),
        ok ? null : h('p', { class: 'muted', style: { ...pad, margin: '0 0 6px' } }, s.equations < s.endo.length ? `${s.endo.length - s.equations} more equation${s.endo.length - s.equations === 1 ? ' is' : 's are'} needed to close the model, or some variables are not endogenous (click one to change its type).` : `${s.equations - s.endo.length} more equation${s.equations - s.endo.length === 1 ? '' : 's'} than variables.`),
        h('div', { style: { ...pad, display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0 0 8px' } },
          h('button', { class: 'small primary', title: 'A typeset table of the variables, and a map of which equation uses which variable at which date', onClick: () => visualise() }, 'Visualise variables'),
          h('button', { class: 'small', title: 'Compare these equations and variables with a Dynare .mod file', onClick: (e) => compareMenu(e.currentTarget) }, 'Compare with .mod'),
          h('button', { class: 'small', title: 'Write the equations that are in the model into the paper, as a section (at the cursor)', onClick: () => listDialog() }, 'List as a section…')),
        ...(r.lists || []).filter(l => l.stale).map(l => h('div', { class: 'mc-stale', style: pad }, h('span', {}, `The list of model equations (${l.file}, line ${l.line}) is out of date.`), h('span', { class: 'mc-stale-btns' }, h('button', { class: 'small primary', onClick: () => updateLists() }, 'Update the list'), h('button', { class: 'small', onClick: () => ctx.goto(l.file, l.line) }, 'Show it')))),
        eqList(r),
        group('endogenous variables', s.endo, true), group('shocks', s.shocks), group('parameters', s.params), s.ignored.length ? group('ignored', s.ignored) : null,
        r.suggestions.length ? h('div', { class: 'mc-sugg', style: pad }, h('div', { class: 'muted' }, 'Read as one name?'), ...r.suggestions.slice(0, 8).map(w => h('button', { class: 'small', title: `${w}_t is now read as ${w.split('').join('·')}_t. Click to read ${w} as one variable.`, onClick: () => setMulti([...multi, w]) }, w))) : null,
        multi.length ? h('div', { class: 'mc-sugg', style: pad }, h('div', { class: 'muted' }, 'Read as one name:'), ...multi.map(w => h('button', { class: 'small', title: 'Click to read it as separate letters again', onClick: () => setMulti(multi.filter(x => x !== w)) }, w + ' ×'))) : null,
        h('p', { class: 'muted', style: { ...pad, margin: '6px 0 0', fontSize: '12px' } }, s.marked ? 'Counting only between % model-begin and % model-end.' : (mode() === 'numbered' ? 'Counting numbered equations. ' : 'Counting every display equation with time indices. ') + 'Put % model or % not model on an equation’s \\begin line to include or leave it out (or tick the box on the equation in the visual view, or in the Equations list above).'),
        r.problems.length ? h('p', { style: { ...pad, margin: '6px 0 0' } }, `${r.problems.length} note${r.problems.length === 1 ? '' : 's'} in the Problems list below the editor.`) : null].filter(Boolean));
    }

    // ---- the list of model equations as a section
    const listOpts = () => ({ ...LIST_DEFAULTS, ...ctx.settings.get('list:' + pid(), {}) });
    function writeBlock(path, from, to, text) {
      if (path === ctx.project.activeFile && ctx.editor.view) { ctx.editor.view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input' }); return; }
      const t = ctx.project.read(path) || ''; ctx.project.write(path, t.slice(0, from) + text + t.slice(to));
    }
    function updateLists() {
      run(); if (!last) return;
      const fl = files(); let n = 0;
      for (const f of fl) { const blocks = listBlocks(f.text); for (let k = blocks.length - 1; k >= 0; k--) { const b = blocks[k], now = modelListTeX(last.model, fl, b.opts); if (now.replace(/\s+/g, '') !== f.text.slice(b.from, b.to).replace(/\s+/g, '')) { writeBlock(f.path, b.from, b.to, now); n++; } } }
      ctx.ui.toast(n ? `Updated ${n === 1 ? 'the list' : n + ' lists'} of model equations${n && fl.some(f => f.path === ctx.project.activeFile) ? ' (Ctrl+Z undoes it)' : ''}.` : 'The list of model equations is already up to date.');
      run();
    }
    function listDialog() {
      run();
      if (!last || !last.model.length) return ctx.ui.toast('There are no model equations yet: number them, or mark them with % model.', 'warn');
      const existing = (last.lists || [])[0];
      const o = existing ? { ...existing.opts } : listOpts();
      const fl = files();
      const pre = h('pre', { class: 'mc-listpre' }), info = h('p', { class: 'muted', style: { margin: '0 0 6px' } });
      const refresh = () => {
        const tex = modelListTeX(last.model, fl, o);
        pre.textContent = tex;
        const groups = o.group === 'subsection' ? (tex.match(/\\sub(?:sub)?section\*?\{/g) || []).length : 1;
        const unlabelled = last.model.filter(e => !/\\label\s*\{/.test(e.tex)).length;
        info.textContent = `${last.model.length} equation${last.model.length === 1 ? '' : 's'}${o.group === 'subsection' ? ` in ${groups} group${groups === 1 ? '' : 's'}` : ''}, in the order of the paper.` + (o.tags && unlabelled ? ` ${unlabelled} ${unlabelled === 1 ? 'has' : 'have'} no \\label, so ${unlabelled === 1 ? 'it shows' : 'they show'} no number.` : '');
      };
      const field = (label, el) => h('label', { class: 'mc-field' }, h('span', {}, label), el);
      const title = h('input', { type: 'text', value: o.title, onInput: (e) => { o.title = e.target.value.trim() || LIST_DEFAULTS.title; refresh(); } });
      const level = h('select', { onChange: (e) => { o.level = e.target.value; refresh(); } }, ...[['section', 'Section, numbered'], ['section*', 'Section, not numbered'], ['subsection', 'Subsection, numbered'], ['subsection*', 'Subsection, not numbered']].map(([v, l]) => h('option', { value: v, selected: o.level === v }, l)));
      const seg = h('span', { class: 'mc-tabs' });
      const drawSeg = () => seg.replaceChildren(...[['one', 'One list'], ['subsection', 'By subsection']].map(([v, l]) => h('button', { type: 'button', class: o.group === v ? 'on' : '', title: v === 'subsection' ? 'One heading for each \\subsection the equations come from (Households, Firms …)' : 'All equations in one block', onClick: () => { o.group = v; drawSeg(); refresh(); } }, l)));
      drawSeg();
      const tags = h('input', { type: 'checkbox', checked: !!o.tags, onChange: (e) => { o.tags = e.target.checked; refresh(); } });
      refresh();
      const body = h('div', { class: 'mc-listdlg' },
        h('p', { class: 'muted', style: { marginTop: 0 } }, 'Only the equations in the model are listed (as counted in the Model check). The block is a copy: its equations are not counted again, and when the model changes you are offered “Update the list”.'),
        field('Title', title), field('Heading', level), field('Group', seg),
        h('label', { class: 'mc-check' }, tags, ' Show each equation’s number from the paper (\\tag{\\ref{…}}, for equations with a \\label)'),
        info, h('details', {}, h('summary', {}, 'The LaTeX that will be written'), pre));
      ctx.ui.modal({ title: existing ? 'Update the list of model equations' : 'List the model equations as a section', wide: true, body, buttons: [{ label: 'Cancel' },
        ...(existing ? [{ label: 'Insert another copy here', onClick: (m) => { m.close(); insertList(o); } }, { label: 'Update the list', primary: true, onClick: (m) => { m.close(); replaceList(existing, o); } }]
          : [{ label: 'Insert at the cursor', primary: true, onClick: (m) => { m.close(); insertList(o); } }])] });
    }
    function replaceList(existing, o) {
      ctx.settings.set('list:' + pid(), o);
      const f = files().find(x => x.path === existing.file); if (!f) return;
      const b = listBlocks(f.text).find(x => x.beginLine === existing.line); if (!b) return;
      writeBlock(f.path, b.from, b.to, modelListTeX(last.model, files(), o));
      ctx.ui.toast('Updated the list of model equations.'); run();
    }
    function insertList(o) {
      ctx.settings.set('list:' + pid(), o);
      const v = ctx.editor.view, path = ctx.project.activeFile;
      if (!v || !/\.tex$/i.test(path || '')) return ctx.ui.toast('Open a .tex file and put the cursor where the section should go.', 'warn');
      const st = v.state, pos = st.selection.main.head, text = st.doc.toString();
      const docAt = text.indexOf('\\begin{document}'), endAt = text.indexOf('\\end{document}');
      if ((docAt >= 0 && pos < docAt) || (endAt >= 0 && pos > endAt)) return ctx.ui.toast('Put the cursor inside the document (between \\begin{document} and \\end{document}).', 'warn');
      const line = st.doc.lineAt(pos), blankLine = !line.text.trim();
      const at = blankLine ? line.from : line.to;
      const tex = modelListTeX(last.model, files(), o);
      const ins = (blankLine ? '' : '\n\n') + tex + '\n';
      v.dispatch({ changes: { from: at, to: blankLine ? line.to : at, insert: ins }, selection: { anchor: at + ins.length }, scrollIntoView: true, userEvent: 'input' });
      v.focus();
      ctx.ui.toast('Inserted the model equations as a section. Ctrl+Z removes it; when the model changes, you are offered “Update the list”.', '', 6000);
      setTimeout(run, 50);
    }
    ctx.ui.addCommand({ id: 'model.list', name: 'Model equations: insert them as a section…', run: () => listDialog() });
    ctx.ui.addCommand({ id: 'model.listUpdate', name: 'Model equations: update the list', run: () => updateLists() });

    // ---- every display equation with a tick: in the model or not (writes % model / % not model)
    let eqFilter = 'all', eqOpen = false;
    function tick(e, want) {
      const text = ctx.project.read(e.file) || ''; const lines = text.split('\n');
      const single = (r) => r.all.filter(x => x.file === e.file && x.envLine === e.envLine).length === 1;
      // one row: its own last line (or, for a one-row environment, the \begin line)
      const lastLine = text.slice(0, e.index + e.tex.trimEnd().length).split('\n').length;
      const n = single(last) ? e.envLine : (lastLine === e.envLine ? e.line : lastLine);
      const L = lines[n - 1] ?? '';
      const MC = /[ \t]*%[ \t]*(not[ \t-]*)?model\b(?!-)[ \t]*$/i;
      const base = L.replace(MC, '');
      const envOther = !single(last) && !!e.envOverride;          // the environment's own comment still applies to this row
      const next = want === (e.auto ? 'in' : 'out') && !envOther ? base : base + (want === 'in' ? ' % model' : ' % not model');
      if (next === L) return;
      const from = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
      if (e.file === ctx.project.activeFile && ctx.editor.view) ctx.editor.view.dispatch({ changes: { from, to: from + L.length, insert: next }, userEvent: 'input.model' });
      else { lines[n - 1] = next; ctx.project.write(e.file, lines.join('\n')); }
      setTimeout(run, 30);
    }
    function eqList(r) {
      const all = r.all || []; if (!all.length) return null;
      const shown = all.filter(e => eqFilter === 'all' || (eqFilter === 'in') === e.inModel);
      const seg = h('span', { class: 'mc-tabs mc-tabs-s' }, ...[['all', 'All'], ['in', 'In'], ['out', 'Out']].map(([k, l]) => h('button', { class: eqFilter === k ? 'on' : '', onClick: () => { eqFilter = k; eqOpen = true; draw(); } }, l)));
      const row = (e) => {
        const cb = h('input', { type: 'checkbox', checked: e.inModel, title: e.inModel ? 'In the model: untick to leave it out' : 'Not in the model: tick to put it in', onChange: (ev) => tick(e, ev.target.checked ? 'in' : 'out') });
        const m = h('span', { class: 'mc-eqpic' }); const svgTxt = window.MathJax?.tex2svg ? mathSvg(e.tex.replace(/%.*$/gm, '').replace(/\\(label|tag)\*?\{[^}]*\}|\\(nonumber|notag)\b|&/g, '').trim()) : null; if (svgTxt) m.innerHTML = svgTxt; else m.textContent = e.tex.trim().slice(0, 60);
        return h('label', { class: 'mc-eqrow' + (e.inModel ? ' in' : '') + (e.override ? ' set' : ''), title: (e.override ? 'Set by hand (% ' + (e.override === 'in' ? 'model' : 'not model') + '). ' : 'Chosen automatically. ') + e.file + ', line ' + e.line }, cb, m,
          h('button', { class: 'linklike mc-eqline', title: 'Go to it', onClick: (ev) => { ev.preventDefault(); ctx.goto(e.file, e.line); } }, 'line ' + e.line));
      };
      const d = h('details', { class: 'mc-eqs', open: eqOpen || null, onToggle: (ev) => { eqOpen = ev.currentTarget.open; } },
        h('summary', {}, `Equations: ${r.model.length} of ${all.length} in the model`),
        h('div', { class: 'mc-eqhead' }, seg, h('span', { class: 'muted' }, 'Tick to put one in')),
        h('div', { class: 'mc-eqlist' }, ...(shown.length ? shown.map(row) : [h('p', { class: 'muted' }, 'None.')])));
      return d;
    }

    // ---- compare with a .mod file
    function compareMenu(anchor) {
      const mods = ctx.project.files().filter(p => /\.mod$/i.test(p) && ctx.project.isText(p));
      ctx.ui.menu(anchor, [...mods.map(p => ({ label: p, onClick: () => compare(p, ctx.project.read(p)) })), ...(mods.length ? ['-'] : []),
        { label: 'A .mod file from your computer…', onClick: async () => { const [f] = await ctx.ui.pickFiles('.mod,.dyn,.txt', false); if (f) compare(f.name, await f.text()); } }]);
    }
    function compare(path, src) {
      if (!last) return;
      let c; try { c = compareMod(last, src); } catch (e) { return ctx.ui.toast(`Could not read ${path}: ${e.message}`, 'err'); }
      const k = c.counts, LABEL = { endo: 'Endogenous variables', shocks: 'Shocks', params: 'Parameters' };
      const row = (label, a, b) => h('tr', {}, h('td', {}, label), h('td', {}, String(a)), h('td', {}, String(b)), h('td', { class: a === b ? 'mc-ok' : 'mc-bad' }, a === b ? '✓' : (a > b ? '+' : '') + (a - b)));
      const names = (title, list) => list.length ? h('p', {}, h('strong', {}, title + ': '), h('code', {}, list.join('  '))) : null;
      const body = h('div', { class: 'mc-cmp' },
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Paper'), h('th', {}, path), h('th', {}, ''))),
          h('tbody', {}, row('Equations', k.paperEqs, k.modEqs), row('Endogenous variables', k.paperEndo, k.modEndo), row('Shocks', k.paperShocks, k.modShocks), row('Parameters', k.paperParams, k.modParams))),
        ...c.rows.flatMap(r => [names(`${LABEL[r.kind]} in the paper, not declared in ${path}`, r.paperOnly), names(`${LABEL[r.kind]} declared in ${path}, not in the paper`, r.modOnly)]),
        names(`Declared with var but used in no model equation of ${path}`, c.unusedVars),
        names(`Shocks (varexo) that appear nowhere in the model block`, c.unusedShocks),
        names(`Parameters declared but not used in the model block`, c.unusedParams),
        h('p', { class: 'muted' }, 'Names are matched by their Dynare names. Change a name in the variables table (Visualise variables) so the two sides line up.'));
      if (!body.querySelector('p strong')) body.insertBefore(h('p', { class: 'mc-ok' }, '✓ The same names on both sides.'), body.children[1]);
      ctx.ui.modal({ title: 'Paper and ' + path, wide: true, body, buttons: [{ label: 'Close' }] });
    }

    // ---- visualise: a typeset table and a map of equations × variables
    let openViz = null;
    async function visualise() {
      try { await loadMathJax(); } catch (e) { ctx.ui.toast(e.message, 'err'); }
      let tab = 'table';
      const content = h('div', { class: 'mc-viz-body' });
      const tabs = h('div', { class: 'mc-tabs', role: 'tablist' });
      const summary = h('div', { class: 'mc-viz-sum' });
      const render = () => {
        const r = last; if (!r) return;
        const n = (t) => r.vars.filter(v => v.type === t).length;
        summary.replaceChildren(...[[r.model.length, 'equations'], [n('endo'), 'endogenous'], [n('shock'), 'shocks'], [n('param'), 'parameters']].map(([k, l]) => h('span', { class: 'mc-stat' }, h('b', {}, String(k)), ' ' + l)),
          ...(r.model.length !== n('endo') ? [h('span', { class: 'mc-stat mc-bad' }, r.model.length > n('endo') ? `${r.model.length - n('endo')} more equation${r.model.length - n('endo') > 1 ? 's' : ''} than variables` : `${n('endo') - r.model.length} more variable${n('endo') - r.model.length > 1 ? 's' : ''} than equations`)] : [h('span', { class: 'mc-stat mc-ok' }, '✓ as many equations as variables')]));
        tabs.replaceChildren(...[['table', 'Variables'], ['map', 'Where each one appears']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'on' : '', onClick: () => { tab = k; render(); } }, l)));
        const keep = content.scrollTop; content.replaceChildren(tab === 'table' ? table(r) : map(r)); content.scrollTop = tab === openViz?.lastTab ? keep : 0; if (openViz) openViz.lastTab = tab;
      };
      const m = ctx.ui.modal({ title: 'Variables of the model', wide: 'full', body: h('div', { class: 'mc-viz' }, h('div', { class: 'mc-viz-top' }, tabs, summary), content), buttons: [{ label: 'Close' }], onClose: () => { openViz = null; } });
      openViz = { refresh: render, m, lastTab: tab };
      render();
    }
    const sym = (tex) => { const svg = mathSvg(tex); const el = h('span', { class: 'mc-sym', title: tex }); if (svg) el.innerHTML = svg; else el.textContent = tex; return el; };
    const dates = (v) => [...v.times].sort((a, b) => a - b).map(t => t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t).join(', ') || '—';
    function table(r) {
      const order = ['endo', 'shock', 'param', 'ignore'];
      const vars = [...r.vars].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name));
      const GROUP = { endo: 'Endogenous variables', shock: 'Shocks', param: 'Parameters', ignore: 'Ignored' };
      const rows = []; let prev = null;
      for (const v of vars) { if (v.type !== prev) { prev = v.type; rows.push(h('tr', { class: 'mc-grp' }, h('th', { colspan: 5 }, GROUP[v.type] || v.type, h('span', { class: 'muted' }, ' · ' + vars.filter(x => x.type === v.type).length)))); } rows.push(v); }
      return h('table', { class: 'mc-table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'mc-c-sym' }, 'Symbol'), h('th', {}, 'Type'), h('th', {}, 'Dynare name'), h('th', {}, 'Dates'), h('th', { class: 'mc-c-num' }, 'Equations'))),
        h('tbody', {}, ...rows.map(v => v instanceof Element ? v : h('tr', { class: 'mc-row-' + v.type },
          h('td', { class: 'mc-c-sym' }, sym(v.tex)),
          h('td', {}, h('span', { class: 'mc-seg' }, ...TYPES.map(([k, label, short]) => h('button', { class: v.type === k ? 'on' : '', title: label + (v.autoType === k ? ' (guessed)' : ''), 'aria-pressed': String(v.type === k), onClick: () => setVar(v.key, { type: k === v.autoType ? null : k }) }, short)))),
          h('td', {}, h('input', { class: 'mc-name', value: v.name, spellcheck: false, title: v.name === v.autoName ? 'Written from the symbol; type to change it' : 'Your name (empty it to go back to ' + v.autoName + ')', onChange: (e) => setVar(v.key, { name: e.target.value.trim() === v.autoName ? null : e.target.value.trim().replace(/[^A-Za-z0-9_]/g, '_') }) })),
          h('td', {}, v.times.size ? [...v.times].sort((x, y) => x - y).map(t => h('span', { class: 'mc-t ' + (t < 0 ? 'lag' : t > 0 ? 'lead' : 'now') }, t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t)) : h('span', { class: 'muted' }, '—')),
          h('td', { class: 'mc-c-num' }, String(v.eqs.size))))));
    }
    function map(r) {
      const cols = r.vars.filter(v => v.type === 'endo' || v.type === 'shock').sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'endo' ? -1 : 1));
      const cell = (e, v) => {
        const ts = [...new Set(e.symbols.filter(s => s.key === v.key && !s.steady).map(s => s.time))].filter(t => t !== null).sort((a, b) => a - b);
        if (!ts.length) return h('td', {});
        return h('td', { class: 'mc-hit', title: `${v.tex} in line ${e.line}: ` + ts.map(t => t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t).join(', ') }, ...ts.map(t => h('span', { class: 'mc-t ' + (t < 0 ? 'lag' : t > 0 ? 'lead' : 'now') }, t === 0 ? 't' : t > 0 ? '+' + t : '−' + -t)));
      };
      const nE = cols.filter(v => v.type === 'endo').length, nS = cols.length - nE;
      const legend = h('p', { class: 'mc-legend muted' }, h('span', { class: 'mc-t lag' }, '−1'), ' dated t−1', h('span', { class: 'mc-t now' }, 't'), ' dated t', h('span', { class: 'mc-t lead' }, '+1'), ' dated t+1', h('span', { class: 'mc-legend-note' }, 'A column with no t, or a variable that appears only lagged, is worth a second look. Click an equation to go to it.'));
      const hover = (e) => { const td = e.target.closest('td, th'); const tb = e.currentTarget; tb.querySelectorAll('.mc-hl').forEach(x => x.classList.remove('mc-hl')); if (!td || !td.parentElement) return; const ci = [...td.parentElement.children].indexOf(td); if (ci > 0) tb.querySelectorAll(`tr > :nth-child(${ci + 1})`).forEach(x => { if (x.closest('tbody') || x.closest('tr.mc-hrow')) x.classList.add('mc-hl'); }); };
      return h('div', { class: 'mc-mapbox' }, legend, h('div', { class: 'mc-mapwrap' }, h('table', { class: 'mc-map', onMouseover: hover, onMouseleave: (e) => e.currentTarget.querySelectorAll('.mc-hl').forEach(x => x.classList.remove('mc-hl')) },
        h('thead', {},
          h('tr', { class: 'mc-grow' }, h('th', { class: 'mc-eq' }), ...(nE ? [h('th', { colspan: nE }, 'Endogenous')] : []), ...(nS ? [h('th', { colspan: nS, class: 'mc-shockcol' }, 'Shocks')] : [])),
          h('tr', { class: 'mc-hrow' }, h('th', { class: 'mc-eq' }, 'Equation'), ...cols.map(v => h('th', { class: v.type === 'shock' ? 'mc-shockcol' : '' }, sym(v.tex))))),
        h('tbody', {}, ...r.model.map((e, i) => h('tr', {},
          h('th', { class: 'mc-eq', title: e.tex.replace(/%.*$/gm, '').trim() }, h('button', { class: 'linklike', onClick: () => { openViz?.m.close(); ctx.goto(e.file, e.line); } }, h('span', { class: 'mc-eqn' }, String(i + 1)), h('span', { class: 'muted' }, ` line ${e.line}`))),
          ...cols.map(v => cell(e, v))))))));
    }

    const later = () => { clearTimeout(timer); timer = setTimeout(run, 700); };
    ctx.ui.addPanel({ id: 'model-checks', title: 'Model check', icon: 'scale', render(el) { box = el; if (last) draw(); else run(); } });
    ['change', 'files', 'project'].forEach(n => ctx.on(n, later));
    run();
    ctx.onDispose(() => { clearTimeout(timer); ctx.problems.clear(); modelState.set(null); openViz?.m.close(); css.remove(); });

    const css = h('style', {}, `
.mc-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 6px 12px; }
.mc-chip { font: 12px var(--mono, monospace); padding: 1px 6px; border-radius: 5px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
.mc-chip:hover { border-color: var(--accent); } .mc-chip.mc-typeset { font-size: 13px; padding: 1px 6px 0; } .mc-chip svg { vertical-align: middle; }
.mc-chip.mc-manual { border-style: dashed; border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
.mc-sugg { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 4px 0; } .mc-sugg > .muted { width: 100%; font-size: 12px; }
.mc-viz { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mc-viz-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; padding: 12px 20px; border-bottom: 1px solid var(--line); }
.mc-viz-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 20px 18px; scrollbar-gutter: stable; }
.mc-tabs { display: inline-flex; padding: 3px; gap: 2px; border-radius: 9px; background: var(--panel); border: 1px solid var(--line); }
.mc-tabs button { border: 0; border-radius: 6px; padding: 4px 14px; font: 500 12.5px var(--ui); color: var(--muted); background: transparent; cursor: pointer; }
.mc-tabs button.on { background: var(--paper); color: var(--ink); box-shadow: 0 1px 2px rgb(0 0 0 / 12%); }
.mc-viz-sum { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 12.5px var(--ui); color: var(--muted); }
.mc-stat b { color: var(--ink); font-weight: 600; }
.mc-table { border-collapse: collapse; width: 100%; max-width: 820px; margin: 0 auto; } .mc-table th, .mc-table td { text-align: left; padding: 5px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.mc-table thead th { font-weight: 600; font-size: 12px; color: var(--muted); position: sticky; top: -14px; background: var(--paper); z-index: 1; }
.mc-table tr.mc-grp th { padding: 14px 12px 4px; font: 600 12px var(--ui); color: var(--ink); text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid color-mix(in srgb, var(--ink) 25%, var(--line)); }
.mc-table tbody tr:not(.mc-grp):hover td { background: color-mix(in srgb, var(--accent-soft, #e8eefc) 55%, transparent); }
.mc-c-sym { width: 90px; } .mc-c-num { text-align: right !important; width: 80px; color: var(--muted); }
.mc-mapbox { display: flex; flex-direction: column; gap: 10px; align-items: center; }
.mc-legend { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; margin: 0; font-size: 12px; max-width: 900px; } .mc-legend .mc-t { margin-left: 8px; } .mc-legend .mc-t:first-child { margin-left: 0; }
.mc-legend-note { flex-basis: 100%; text-align: center; }
.mc-map tr.mc-grow th { font: 600 11px var(--ui); color: var(--muted); text-transform: uppercase; letter-spacing: .03em; padding: 4px 6px; }
.mc-map tr.mc-grow th.mc-eq { border: 0; background: transparent; }
.mc-map tbody tr:hover th, .mc-map tbody tr:hover td, .mc-map .mc-hl { background: color-mix(in srgb, var(--accent-soft, #e8eefc) 70%, var(--paper)); }
.mc-eqn { display: inline-block; min-width: 1.6em; font-weight: 600; color: var(--ink); }
.mc-row-ignore td { opacity: .55; }
.mc-sym { display: inline-block; font-size: 15px; } .mc-sym svg { vertical-align: middle; }
.mc-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.mc-seg button { border: 0; border-radius: 0; padding: 2px 9px; background: var(--paper); color: var(--muted); font: 600 12px var(--ui); min-width: 28px; }
.mc-seg button + button { border-left: 1px solid var(--line); }
.mc-seg button.on { background: var(--accent); color: #fff; }
.mc-name { font: 12.5px var(--mono, monospace); width: 12em; padding: 2px 6px; }
.mc-mapwrap { max-width: 100%; overflow-x: auto; }
.mc-map { border-collapse: separate; border-spacing: 0; } .mc-map th, .mc-map td { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 4px 7px; text-align: center; min-width: 38px; height: 28px; }
.mc-map tr > :first-child { border-left: 1px solid var(--line); } .mc-map tr.mc-hrow > * { border-top: 1px solid var(--line); }
.mc-map thead th { background: var(--panel); }
.mc-map .mc-eq { text-align: left; white-space: nowrap; position: sticky; left: 0; background: var(--panel); font-weight: 500; font-size: 12px; z-index: 1; padding-right: 12px; }
.mc-map .mc-shockcol { background: color-mix(in srgb, var(--warn, #9a6700) 10%, var(--panel)); }
.mc-t { display: inline-block; font: 600 11px var(--mono, monospace); padding: 0 4px; border-radius: 4px; margin: 1px; }
.mc-t.lag { background: #e3ecfb; color: #234e9a; } .mc-t.now { background: #e5f2ea; color: #1c6b3c; } .mc-t.lead { background: #fbeedd; color: #8a4b08; }
[data-theme=dark] .mc-t.lag { background: #22324f; color: #a9c4f5; } [data-theme=dark] .mc-t.now { background: #1f3a2a; color: #9fd9b4; } [data-theme=dark] .mc-t.lead { background: #45321a; color: #f1c58d; }
.mc-cmp table { border-collapse: collapse; margin-bottom: 10px; } .mc-cmp td, .mc-cmp th { padding: 4px 12px; border-bottom: 1px solid var(--line); text-align: left; }
.mc-ok { color: var(--ok, #177245); } .mc-bad { color: var(--warn, #9a6700); font-weight: 600; }
.mc-cmp code { font-size: 12px; word-break: break-word; }
.mc-eqs { padding: 0 10px 6px; } .mc-eqs > summary { cursor: pointer; }
.mc-eqhead { display: flex; align-items: center; gap: 8px; margin: 6px 0 4px; font-size: 12px; }
.mc-tabs.mc-tabs-s button { padding: 2px 9px; font-size: 11.5px; }
.mc-eqlist { display: flex; flex-direction: column; gap: 1px; max-height: 320px; overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
.mc-eqrow { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 6px; padding: 3px 6px; cursor: pointer; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
.mc-eqrow:hover { background: color-mix(in srgb, var(--accent-soft, #e8eefc) 60%, transparent); } .mc-eqrow:not(.in) .mc-eqpic { opacity: .55; }
.mc-eqrow.set input { outline: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: 1px; }
.mc-eqpic { overflow: hidden; font-size: 11px; white-space: nowrap; min-width: 0; } .mc-eqpic svg { max-width: 100%; height: auto; vertical-align: middle; }
.mc-eqline { font-size: 11px !important; white-space: nowrap; }
.mc-stale { display: flex; flex-direction: column; gap: 6px; margin: 0 10px 8px; padding: 8px 10px !important; border: 1px solid color-mix(in srgb, var(--warn, #9a6700) 40%, var(--line)); background: color-mix(in srgb, var(--warn, #9a6700) 8%, var(--paper)); border-radius: 8px; font-size: 12.5px; }
.mc-stale-btns { display: flex; gap: 6px; }
.mc-listdlg { display: flex; flex-direction: column; gap: 10px; }
.mc-field { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 10px; } .mc-field > span:first-child { color: var(--muted); font-size: 12.5px; }
.mc-field input[type=text], .mc-field select { font: 13px var(--ui); padding: 4px 8px; max-width: 340px; }
.mc-field .mc-tabs { justify-self: start; }
.mc-check { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.mc-listpre { max-height: 260px; overflow: auto; font: 11.5px/1.45 var(--mono, monospace); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin: 6px 0 0; white-space: pre; }
button.linklike { border: 0; background: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
`);
    document.head.append(css);
  },
};
