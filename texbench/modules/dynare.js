// Dynare <-> LaTeX. Reads a .mod file and writes its model block as numbered equations, a table of
// variables and a calibration table; and turns equations of the paper back into Dynare model lines.
import { parseMod, modelToLatex, variableTable, parameterTable } from './lib/dynare.js';
import { findEquations, toDynare } from './lib/latex-math.js';

export default {
  id: 'dynare',
  name: 'Dynare import and export',
  description: 'Turn a Dynare .mod file into numbered equations, a variable list and a calibration table. Turn equations of the paper into Dynare model lines.',
  category: 'DSGE',
  activate(ctx) {
    const h = ctx.h;
    const mods = () => ctx.project.files().filter(p => /\.mod$/i.test(p) && ctx.project.isText(p));

    async function upload() {
      const [f] = await ctx.ui.pickFiles('.mod,.dyn,.txt', false);
      if (!f) return;
      const text = await f.text();
      ctx.project.write(f.name, text);
      importDialog(f.name);
    }

    function importDialog(path) {
      let model;
      try { model = parseMod(ctx.project.read(path)); } catch (e) { return ctx.ui.toast(`Could not read ${path}: ${e.message}`, 'err'); }
      if (!model.equations.length) return ctx.ui.toast(`${path} has no model block (model; … end;).`, 'err');
      const opt = { expectations: ctx.settings.get('expectations', true), labels: ctx.settings.get('labels', true), separate: ctx.settings.get('separate', false) };
      const out = h('textarea', { class: 'code', readOnly: true, spellcheck: false, style: { width: '100%', height: '46vh', fontFamily: 'var(--mono, monospace)', fontSize: '12.5px' } });
      let what = 'equations';
      const text = () => what === 'equations' ? modelToLatex(model, opt) : what === 'parameters' ? parameterTable(model) : variableTable(model);
      const draw = () => { out.value = text(); };
      const check = (key, label, title) => h('label', { class: 'check', title }, h('input', { type: 'checkbox', checked: opt[key], onChange: (e) => { opt[key] = e.target.checked; ctx.settings.set(key, opt[key]); draw(); } }), ' ' + label);
      const tab = (id, label) => h('button', { class: 'small', onClick: (e) => { what = id; [...e.target.parentNode.children].forEach(b => b.classList.toggle('primary', b === e.target)); optRow.style.visibility = id === 'equations' ? '' : 'hidden'; draw(); } }, label);
      const optRow = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '8px 0' } },
        check('expectations', 'Write expectations', 'x(+1) becomes E_t x_{t+1}. Switch off for a perfect-foresight model.'),
        check('labels', 'Add \\label to each equation', 'Labels come from [name=\'…\'] tags in the .mod file, or are numbered.'),
        check('separate', 'One equation environment each', 'Otherwise all equations go into one align.'));
      const tabs = h('div', { style: { display: 'flex', gap: '6px' } }, tab('equations', `Model equations (${model.equations.length})`), tab('parameters', `Calibration table (${model.params.length})`), tab('variables', `Variable list (${model.vars.length + model.exo.length})`));
      tabs.firstChild.classList.add('primary');
      const endo = model.vars.length, n = model.equations.length;
      const note = h('p', { class: 'muted', style: { margin: '6px 0 0' } }, `${path}: ${n} equation${n === 1 ? '' : 's'}, ${endo} endogenous variable${endo === 1 ? '' : 's'}` + (n !== endo ? ' — these should be equal.' : '.') + ' Names are converted automatically (rho_a → ρ with subscript a, c_hat → c with a hat); a name given in the .mod file with $…$ is used as written.');
      ctx.ui.modal({
        title: 'Import from Dynare', wide: true,
        body: h('div', {}, tabs, optRow, out, note),
        buttons: [{ label: 'Cancel' }, { label: 'Copy', onClick: () => { navigator.clipboard?.writeText(out.value); ctx.ui.toast('Copied.'); } },
          { label: 'Insert at the cursor', primary: true, onClick: (m) => { m.close(); insert(out.value, what); } }],
      });
      draw();
    }

    function insert(tex, what) {
      if (!/\.tex$/i.test(ctx.project.activeFile || '')) { ctx.project.open(ctx.project.mainFile); }
      ctx.editor.insert('\n' + tex + '\n');
      const need = what === 'equations' ? ['amsmath', 'amssymb'] : ['booktabs'];
      const added = ensurePackages(ctx, need);
      ctx.ui.toast(added.length ? `Inserted. Added \\usepackage{${added.join(', ')}} to the preamble.` : 'Inserted.');
    }

    function exportDialog() {
      const sel = ctx.editor.getSelection(), all = ctx.editor.getText();
      const src = sel.from !== sel.to ? sel.text : all;
      let eqs = findEquations(src);
      if (!eqs.length && sel.from !== sel.to) eqs = [{ tex: sel.text, line: 1 }];
      if (!eqs.length) return ctx.ui.toast('No display equations found. Select some equations, or open the file that has the model.', 'err');
      const names = new Map(), lines = [], notes = [];
      for (const e of eqs) {
        const tex = e.tex.replace(/\\label\{[^}]*\}|\\(?:nonumber|notag)\b/g, '');
        if (!tex.includes('=')) continue;
        try { const d = toDynare(tex); lines.push('  ' + d.text); for (const [k, v] of d.names) names.set(k, v === 'var' || names.get(k) === 'var' ? 'var' : 'param'); notes.push(...d.notes); }
        catch (err) { lines.push(`  // could not convert: ${tex.trim().replace(/\s+/g, ' ')}`); }
      }
      const vars = [...names].filter(([, v]) => v === 'var').map(([k]) => k), shocks = vars.filter(v => /^(eps|eta|nu|u)(_|$)/.test(v)), endo = vars.filter(v => !shocks.includes(v));
      const params = [...names].filter(([, v]) => v === 'param').map(([k]) => k);
      const text = `// Draft written from the LaTeX equations. Check every line before you run it.\nvar ${endo.join(' ')};\nvarexo ${shocks.join(' ')};\nparameters ${params.join(' ')};\n\n${params.map(p => `${p} = ;`).join('\n')}\n\nmodel;\n${lines.join('\n')}\nend;\n`;
      const out = h('textarea', { spellcheck: false, style: { width: '100%', height: '50vh', fontFamily: 'var(--mono, monospace)', fontSize: '12.5px' } }); out.value = text;
      const count = lines.filter(l => !l.trim().startsWith('//')).length;
      ctx.ui.modal({
        title: 'Equations as Dynare code', wide: true,
        body: h('div', {}, out, h('p', { class: 'muted' }, `${count} equation${count === 1 ? '' : 's'}, ${endo.length} endogenous variable${endo.length === 1 ? '' : 's'}, ${shocks.length} shock${shocks.length === 1 ? '' : 's'}. ` + (sel.from !== sel.to ? 'From your selection.' : 'From every display equation in this file — select the model equations first to convert only those.') + ' This is a draft: hats and tildes are dropped, a symbol with a time index is a variable, one without is a parameter.' + ([...new Set(notes)].length ? ' ' + [...new Set(notes)].join(' ') : ''))),
        buttons: [{ label: 'Close' }, { label: 'Copy', onClick: () => { navigator.clipboard?.writeText(out.value); ctx.ui.toast('Copied.'); } },
          { label: 'Save as model.mod in the project', primary: true, onClick: (m) => { let p = 'model.mod', i = 2; while (ctx.project.exists(p)) p = `model-${i++}.mod`; ctx.project.write(p, out.value, { open: true }); m.close(); } }],
      });
    }

    const btn = ctx.ui.addToolbarButton({ label: 'Dynare', icon: '⇄', title: 'Import a .mod file as equations and tables, or turn equations into Dynare code', onClick: () => ctx.ui.menu(btn.el, [
      { heading: 'Dynare → LaTeX' },
      ...mods().map(p => ({ label: `Import from ${p}`, onClick: () => importDialog(p) })),
      { label: 'Import a .mod file from your computer…', onClick: upload },
      '-', { heading: 'LaTeX → Dynare' },
      { label: 'Equations as Dynare code…', title: 'Uses the selected equations, or all display equations in the open file', onClick: exportDialog },
    ]) });
    ctx.ui.addCommand({ id: 'dynare.import', name: 'Dynare: import a .mod file', run: () => { const m = mods(); m.length === 1 ? importDialog(m[0]) : upload(); } });
    ctx.ui.addCommand({ id: 'dynare.export', name: 'Dynare: equations as Dynare code', run: exportDialog });
  },
};

// Add \usepackage lines for packages the main file does not load yet. Returns the names added.
export function ensurePackages(ctx, names, extraLines = []) {
  const main = ctx.project.mainFile; if (!main) return [];
  const src = ctx.project.read(main);
  const loaded = new Set([...src.matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g)].flatMap(m => m[1].split(',').map(s => s.trim())));
  if (loaded.has('mathtools')) loaded.add('amsmath');
  const missing = names.filter(n => !loaded.has(n));
  const lines = [...missing.map(n => `\\usepackage{${n}}`), ...extraLines.filter(l => !src.includes(l))];
  if (!lines.length) return [];
  const doc = src.indexOf('\\begin{document}');
  if (doc < 0) return [];
  const text = lines.join('\n') + '\n';
  if (ctx.project.activeFile === main) ctx.editor.view.dispatch({ changes: { from: doc, insert: text } });
  else ctx.project.write(main, src.slice(0, doc) + text + src.slice(doc));
  return missing.length ? missing : lines;
}
