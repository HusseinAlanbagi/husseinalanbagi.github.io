// Checks for the equations of a DSGE model, as you write them:
//   timing    - a future-dated variable with no expectation operator; a symbol dated both t+1 and t-1 without expectations
//   notation  - two steady-state styles in one paper; a symbol used both with and without a time index
//   counting  - equations against endogenous variables
// To check only the model (and not derivations in an appendix), put the comment lines
//   % model-begin   and   % model-end   around the model equations.
import { scan, findEquations } from './lib/latex-math.js';

const SHOCK = /^\\(varepsilon|epsilon|eta|nu|xi|zeta|upsilon)$|^[ue]$/;
const STYLE = { bar: 'a bar (\\bar{x})', ss: 'the subscript ss (x_{ss})', star: 'a star (x^{*})' };
const show = (s, t) => `${s.tex}${t == null ? '' : `, dated ${t === 0 ? 't' : t > 0 ? 't+' + t : 't−' + -t}`}`;

export function checkProject(files) {     // files: [{ path, text }]
  const eqs = [];
  for (const { path, text } of files) {
    const marks = [...text.matchAll(/^[ \t]*%+[ \t]*model-(begin|end)\b.*$/gm)].map(m => ({ kind: m[1], line: text.slice(0, m.index).split('\n').length }));
    const inModel = (line) => { if (!marks.length) return true; let on = false; for (const m of marks) { if (m.line > line) break; on = m.kind === 'begin'; } return on; };
    for (const e of findEquations(text)) { if (!inModel(e.line)) continue; let r; try { r = scan(e.tex); } catch { continue; } eqs.push({ ...e, file: path, ...r, marked: marks.length > 0 }); }
  }
  const problems = [], add = (e, severity, message) => problems.push({ file: e.file, line: e.line, severity, message });
  const model = eqs.filter(e => e.symbols.some(s => s.time !== null) && /=/.test(e.tex));
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
      if (lag.has(s.key)) add(e, 'warning', `Timing: ${s.tex} is dated t+${s.time} here with no expectation, and t−1 in another equation (line ${lag.get(s.key).line}). Check which dating convention you use for it.`);
      else if (usesE && !SHOCK.test(s.base)) {
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
  for (const [k, e] of undated) if (dated.has(k)) add(e, 'info', `Notation: ${k} has no time index here, but has one in another equation (line ${dated.get(k).line}). If this is its steady state, mark it; if it is a parameter, give it another symbol.`);

  // ---- counting
  const endo = new Set(), shocks = new Set(), params = new Set();
  for (const e of model) for (const s of e.symbols) { if (s.steady) continue; if (s.time === null) { if (!dated.has(s.key)) params.add(s.key); } else (SHOCK.test(s.base) ? shocks : endo).add(s.key); }
  return { problems, summary: { equations: model.length, endo: [...endo], shocks: [...shocks], params: [...params], marked: eqs.some(e => e.marked), first: model[0] || null } };
}

export default {
  id: 'model-checks',
  name: 'Model checks',
  description: 'Checks model equations as you write: missing expectation operators, mixed timing, mixed steady-state notation, and equations against variables.',
  category: 'DSGE',
  activate(ctx) {
    let box, timer;
    const run = () => {
      const files = ctx.project.files().filter(p => /\.tex$/i.test(p) && ctx.project.isText(p)).map(path => ({ path, text: ctx.project.read(path) }));
      let r; try { r = checkProject(files); } catch (e) { console.error('model checks', e); return; }
      ctx.problems.set(r.problems);
      if (!box) return;
      const s = r.summary, h = ctx.h;
      if (!s.equations) return box.replaceChildren(h('p', { class: 'muted', style: { padding: '0 10px' } }, 'No model equations found yet (display equations with time indices such as x_t).'));
      const ok = s.equations === s.endo.length;
      const list = (title, items) => h('details', { style: { padding: '0 10px 4px' } }, h('summary', { style: { cursor: 'pointer' } }, `${items.length} ${title}`), h('div', { class: 'muted', style: { fontFamily: 'var(--mono, monospace)', fontSize: '12px', wordBreak: 'break-word', padding: '2px 0 4px 12px' } }, items.join('   ') || '—'));
      box.replaceChildren(...[
        h('p', { style: { padding: '0 10px', margin: '4px 0 6px' } }, h('strong', { style: { color: ok ? 'var(--ok, #177245)' : 'var(--warn, #9a6700)' } }, ok ? '✓ ' : '⚠ '), `${s.equations} equation${s.equations === 1 ? '' : 's'}, ${s.endo.length} endogenous variable${s.endo.length === 1 ? '' : 's'}`),
        ok ? null : h('p', { class: 'muted', style: { padding: '0 10px', margin: '0 0 6px' } }, s.equations < s.endo.length ? `${s.endo.length - s.equations} more equation${s.endo.length - s.equations === 1 ? ' is' : 's are'} needed to close the model.` : `${s.equations - s.endo.length} more equation${s.equations - s.endo.length === 1 ? '' : 's'} than variables.`),
        list('endogenous variables', s.endo), list('shocks', s.shocks), list('parameters', s.params),
        h('p', { class: 'muted', style: { padding: '0 10px', margin: '4px 0 0', fontSize: '12px' } }, s.marked ? 'Counting only between % model-begin and % model-end.' : 'Counting every display equation. To count only the model, put % model-begin and % model-end around it.'),
        r.problems.length ? h('p', { style: { padding: '0 10px', margin: '6px 0 0' } }, `${r.problems.length} note${r.problems.length === 1 ? '' : 's'} in the Problems list below the editor.`) : null].filter(Boolean));
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(run, 700); };
    ctx.ui.addPanel({ id: 'model-checks', title: 'Model check', render(el) { box = el; run(); } });
    ['change', 'files', 'project'].forEach(n => ctx.on(n, later));
    ctx.onDispose(() => { clearTimeout(timer); ctx.problems.clear(); });
  },
};
