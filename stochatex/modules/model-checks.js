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
    for (const e of findEquations(text)) {
      let r; try { r = scan(e.tex, 0, undefined, multi); } catch { continue; }
      const candidate = r.symbols.some(s => s.time !== null) && /=/.test(e.tex.replace(/%.*$/gm, ''));
      const auto = marks.length ? inMarks(e.line) && candidate : candidate && (mode === 'all' || e.numbered);
      const inModel = e.override ? e.override === 'in' : auto;
      const row = { ...e, file: path, ...r, auto, inModel, candidate };
      eqs.push(row);
      // per environment, for the chips in the visual view
      if (candidate || e.override) {
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
  return { problems, summary, model, vars: list, suggestions: [...suggestions], envs };
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
    const files = () => ctx.project.files().filter(p => /\.tex$/i.test(p) && ctx.project.isText(p)).map(path => ({ path, text: ctx.project.read(path) }));

    function run() {
      let r; try { r = checkProject(files(), { mode: mode(), multi: getMulti(), vars: getVars() }); } catch (e) { console.error('model checks', e); return; }
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
          h('button', { class: 'small', title: 'Compare these equations and variables with a Dynare .mod file', onClick: (e) => compareMenu(e.currentTarget) }, 'Compare with .mod')),
        group('endogenous variables', s.endo, true), group('shocks', s.shocks), group('parameters', s.params), s.ignored.length ? group('ignored', s.ignored) : null,
        r.suggestions.length ? h('div', { class: 'mc-sugg', style: pad }, h('div', { class: 'muted' }, 'Read as one name?'), ...r.suggestions.slice(0, 8).map(w => h('button', { class: 'small', title: `${w}_t is now read as ${w.split('').join('·')}_t. Click to read ${w} as one variable.`, onClick: () => setMulti([...multi, w]) }, w))) : null,
        multi.length ? h('div', { class: 'mc-sugg', style: pad }, h('div', { class: 'muted' }, 'Read as one name:'), ...multi.map(w => h('button', { class: 'small', title: 'Click to read it as separate letters again', onClick: () => setMulti(multi.filter(x => x !== w)) }, w + ' ×'))) : null,
        h('p', { class: 'muted', style: { ...pad, margin: '6px 0 0', fontSize: '12px' } }, s.marked ? 'Counting only between % model-begin and % model-end.' : (mode() === 'numbered' ? 'Counting numbered equations. ' : 'Counting every display equation with time indices. ') + 'Put % model or % not model on an equation’s \\begin line to include or leave it out (or use the chip on the equation in the visual view).'),
        r.problems.length ? h('p', { style: { ...pad, margin: '6px 0 0' } }, `${r.problems.length} note${r.problems.length === 1 ? '' : 's'} in the Problems list below the editor.`) : null].filter(Boolean));
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
      const content = h('div', { class: 'mc-viz' });
      const tabs = h('div', { class: 'mc-tabs', role: 'tablist' });
      const render = () => {
        const r = last; if (!r) return;
        tabs.replaceChildren(...[['table', 'Variables'], ['map', 'Where each one appears']].map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), class: 'small' + (tab === k ? ' primary' : ''), onClick: () => { tab = k; render(); } }, l)));
        content.replaceChildren(tab === 'table' ? table(r) : map(r));
      };
      const m = ctx.ui.modal({ title: 'Variables of the model', wide: 'full', body: h('div', {}, tabs, content), buttons: [{ label: 'Close' }], onClose: () => { openViz = null; } });
      openViz = { refresh: render, m };
      render();
    }
    const sym = (tex) => { const svg = mathSvg(tex); const el = h('span', { class: 'mc-sym', title: tex }); if (svg) el.innerHTML = svg; else el.textContent = tex; return el; };
    const dates = (v) => [...v.times].sort((a, b) => a - b).map(t => t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t).join(', ') || '—';
    function table(r) {
      const order = ['endo', 'shock', 'param', 'ignore'];
      const vars = [...r.vars].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name));
      return h('table', { class: 'mc-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Symbol'), h('th', {}, 'Type'), h('th', {}, 'Dynare name'), h('th', {}, 'Dates'), h('th', {}, 'Equations'))),
        h('tbody', {}, ...vars.map(v => h('tr', { class: 'mc-row-' + v.type },
          h('td', {}, sym(v.tex)),
          h('td', {}, h('span', { class: 'mc-seg' }, ...TYPES.map(([k, label, short]) => h('button', { class: v.type === k ? 'on' : '', title: label + (v.autoType === k ? ' (guessed)' : ''), 'aria-pressed': String(v.type === k), onClick: () => setVar(v.key, { type: k === v.autoType ? null : k }) }, short)))),
          h('td', {}, h('input', { class: 'mc-name', value: v.name, spellcheck: false, title: v.name === v.autoName ? 'Written from the symbol; type to change it' : 'Your name (empty it to go back to ' + v.autoName + ')', onChange: (e) => setVar(v.key, { name: e.target.value.trim() === v.autoName ? null : e.target.value.trim().replace(/[^A-Za-z0-9_]/g, '_') }) })),
          h('td', { class: 'muted' }, dates(v)),
          h('td', { class: 'muted' }, String(v.eqs.size))))));
    }
    function map(r) {
      const cols = r.vars.filter(v => v.type === 'endo' || v.type === 'shock').sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'endo' ? -1 : 1));
      const cell = (e, v) => {
        const ts = [...new Set(e.symbols.filter(s => s.key === v.key && !s.steady).map(s => s.time))].filter(t => t !== null).sort((a, b) => a - b);
        if (!ts.length) return h('td', {});
        return h('td', { class: 'mc-hit', title: `${v.tex} in line ${e.line}: ` + ts.map(t => t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t).join(', ') }, ...ts.map(t => h('span', { class: 'mc-t ' + (t < 0 ? 'lag' : t > 0 ? 'lead' : 'now') }, t === 0 ? 't' : t > 0 ? '+' + t : '−' + -t)));
      };
      return h('div', { class: 'mc-mapwrap' }, h('table', { class: 'mc-map' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Equation'), ...cols.map(v => h('th', { class: v.type === 'shock' ? 'mc-shockcol' : '' }, sym(v.tex))))),
        h('tbody', {}, ...r.model.map((e, i) => h('tr', {},
          h('th', { class: 'mc-eq', title: e.tex.replace(/%.*$/gm, '').trim() }, h('button', { class: 'linklike', onClick: () => { openViz?.m.close(); ctx.goto(e.file, e.line); } }, `${i + 1} · line ${e.line}`)),
          ...cols.map(v => cell(e, v)))))),
        h('p', { class: 'muted' }, h('span', { class: 'mc-t lag' }, '−1'), ' dated t−1 · ', h('span', { class: 'mc-t now' }, 't'), ' dated t · ', h('span', { class: 'mc-t lead' }, '+1'), ' dated t+1. A column with no t entry, or a variable that appears only lagged, is worth a second look.'));
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
.mc-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.mc-table { border-collapse: collapse; width: 100%; } .mc-table th, .mc-table td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.mc-table th { font-weight: 600; font-size: 12px; color: var(--muted); }
.mc-row-ignore td { opacity: .55; }
.mc-sym { display: inline-block; font-size: 15px; } .mc-sym svg { vertical-align: middle; }
.mc-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.mc-seg button { border: 0; border-radius: 0; padding: 2px 9px; background: var(--paper); color: var(--muted); font: 600 12px var(--ui); min-width: 28px; }
.mc-seg button + button { border-left: 1px solid var(--line); }
.mc-seg button.on { background: var(--accent); color: #fff; }
.mc-name { font: 12.5px var(--mono, monospace); width: 12em; padding: 2px 6px; }
.mc-mapwrap { overflow: auto; max-height: 64vh; }
.mc-map { border-collapse: collapse; } .mc-map th, .mc-map td { border: 1px solid var(--line); padding: 3px 6px; text-align: center; min-width: 34px; }
.mc-map thead th { position: sticky; top: 0; background: var(--panel); z-index: 1; }
.mc-map .mc-eq { text-align: left; white-space: nowrap; position: sticky; left: 0; background: var(--panel); font-weight: 500; font-size: 12px; }
.mc-map .mc-shockcol { background: color-mix(in srgb, var(--warn, #9a6700) 10%, var(--panel)); }
.mc-t { display: inline-block; font: 600 11px var(--mono, monospace); padding: 0 4px; border-radius: 4px; margin: 1px; }
.mc-t.lag { background: #e3ecfb; color: #234e9a; } .mc-t.now { background: #e5f2ea; color: #1c6b3c; } .mc-t.lead { background: #fbeedd; color: #8a4b08; }
[data-theme=dark] .mc-t.lag { background: #22324f; color: #a9c4f5; } [data-theme=dark] .mc-t.now { background: #1f3a2a; color: #9fd9b4; } [data-theme=dark] .mc-t.lead { background: #45321a; color: #f1c58d; }
.mc-cmp table { border-collapse: collapse; margin-bottom: 10px; } .mc-cmp td, .mc-cmp th { padding: 4px 12px; border-bottom: 1px solid var(--line); text-align: left; }
.mc-ok { color: var(--ok, #177245); } .mc-bad { color: var(--warn, #9a6700); font-weight: 600; }
.mc-cmp code { font-size: 12px; word-break: break-word; }
button.linklike { border: 0; background: none; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
`);
    document.head.append(css);
  },
};
