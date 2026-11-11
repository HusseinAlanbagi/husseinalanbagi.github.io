// Proofreading: spelling, grammar, punctuation, repeated words and wordiness, checked as you type.
// The checker (Harper, Apache-2.0) runs inside your browser, so your text is never sent anywhere.
// Only the prose is checked: commands, maths, comments and the preamble are left alone.
import { proseOf } from './lib/latex-text.js';

const TERMS = 'Calvo Dynare Keynesian DSGE Phillips Bayesian Ricardian Euler Cobb Solow Ramsey Galí Woodford Smets Wouters Blanchard Kahn Kalman Metropolis Hastings Rotemberg Dixit Stiglitz Kimball Epstein Zin Hodrick Prescott Kydland Lucas Sargent Sims Bernanke Gertler Gilchrist Kiyotaki Mankiw Friedman Taylor Fisher Pareto Walras Walrasian Arrow Debreu Bellman Lagrangian Hamiltonian Jacobian Hessian heteroskedasticity heteroskedastic homoskedastic endogenous exogenous endogeneity exogeneity loglinear linearised linearized linearisation linearization markup markups microfounded microfoundations macroprudential seigniorage numeraire intertemporal intratemporal stochastic deterministic calibrated calibration posterior priors idiosyncratic nonlinear nonstationary stationarity cointegration cointegrated detrended detrending hysteresis monopolistically frictionless homothetic isoelastic counterfactual counterfactuals tatonnement IRF IRFs VAR VARs SVAR ZLB ELB TFP GMM MCMC HPD OLS IV CES Ctrl Eq Eqs Fig Figs cf iid CRRA CARA NKPC RBC HANK TANK GDP CPI PCE FOC FOCs pgfplots BibTeX LaTeX TeX'.split(' ');
const KIND = { Spelling: 'spell', Typo: 'spell', Grammar: 'grammar', Agreement: 'grammar', Punctuation: 'grammar', Capitalization: 'grammar', BoundaryError: 'grammar', WordOrder: 'grammar', Malapropism: 'grammar', Eggcorn: 'grammar', Usage: 'grammar', Repetition: 'grammar', Formatting: 'grammar' };
const LABEL = { spell: 'Spelling', grammar: 'Grammar', style: 'Style' };
const DIALECTS = [['American', 0], ['British', 1], ['Australian', 2], ['Canadian', 3], ['Indian', 4]];

export default {
  id: 'proofread',
  name: 'Proofreading',
  description: 'Checks spelling, grammar, punctuation and wordiness as you type, and offers fixes. Runs inside your browser: nothing you write leaves this computer. English only.',
  category: 'Writing',
  activate(ctx) {
    const { StateField, StateEffect, EditorView, Decoration, hoverTooltip } = ctx.cm, h = ctx.h;
    let linter = null, loading = null, failed = null, lints = [], running = false, again = false, timer, box = null, statusEl = null, disposed = false, checkedFile = null;
    const ignored = new Set(ctx.settings.get('ignored', []));
    const words = new Set(ctx.settings.get('words', []));
    const keyOf = (l) => `${l.kind}|${l.text.toLowerCase()}|${l.message}`;

    async function load() {
      if (linter) return linter;
      return loading ||= (async () => {
        const base = new URL('./harper/', document.baseURI).href;
        const [H, B] = await Promise.all([import(/* @vite-ignore */ base + 'index.js'), import(/* @vite-ignore */ base + 'slimBinary.js')]);
        const dialect = ctx.settings.get('dialect', 1);
        let l;
        try { l = new H.WorkerLinter({ binary: B.slimBinary, dialect }); await l.setup(); }
        catch (e) { console.warn('proofreading: worker failed, using the page thread', e); l = new H.LocalLinter({ binary: B.slimBinary, dialect }); await l.setup(); }
        await l.importWords([...TERMS, ...words]);
        linter = l; linter.__kinds = H.SuggestionKind; return l;
      })().catch((e) => { failed = e.message; loading = null; throw e; });
    }

    // ---- underlines
    const setLints = StateEffect.define();
    const mark = { spell: Decoration.mark({ class: 'pr pr-spell' }), grammar: Decoration.mark({ class: 'pr pr-grammar' }), style: Decoration.mark({ class: 'pr pr-style' }) };
    const field = StateField.define({
      create: () => Decoration.none,
      update(v, tr) {
        v = v.map(tr.changes);
        for (const e of tr.effects) if (e.is(setLints)) v = Decoration.set(e.value.filter(l => l.to <= tr.state.doc.length && l.to > l.from).map(l => mark[l.group].range(l.from, l.to)), true);
        return v;
      },
      provide: f => EditorView.decorations.from(f),
    });
    const at = (pos) => lints.find(l => pos >= l.from && pos <= l.to);
    // positions move while you type; follow them until the next check
    const tracker = EditorView.updateListener.of((u) => { if (u.docChanged) lints = lints.map(l => ({ ...l, from: u.changes.mapPos(l.from, 1), to: u.changes.mapPos(l.to, -1) })).filter(l => l.to > l.from); });
    const fixButtons = (l, done) => [
      ...l.fixes.slice(0, 4).map(f => h('button', { class: 'small pr-fix', onClick: () => { apply(l, f); done && done(); } }, f.kind === 'remove' ? 'Remove' : f.kind === 'insert' ? `Add “${f.text}”` : f.text || 'Remove')),
      l.group === 'spell' ? h('button', { class: 'small ghost', title: 'Stop marking this word, in every project', onClick: () => { addWord(l.text); done && done(); } }, 'Add to dictionary') : null,
      h('button', { class: 'small ghost', title: 'Stop showing this suggestion for this text', onClick: () => { ignore(l); done && done(); } }, 'Ignore'),
    ];
    const hover = hoverTooltip((view, pos) => {
      const l = at(pos); if (!l) return null;
      return { pos: l.from, end: l.to, above: true, create: () => ({ dom: h('div', { class: 'pr-card' }, h('div', { class: 'pr-kind pr-' + l.group }, LABEL[l.group]), h('div', { class: 'pr-msg' }, l.message), h('div', { class: 'pr-fixes' }, fixButtons(l))) }) };
    }, { hoverTime: 200 });
    ctx.editor.addExtension([field, tracker, hover]);

    function apply(l, f) {
      const view = ctx.editor.view;
      const cur = at(l.from + 1) || l;
      if (f.kind === 'insert') view.dispatch({ changes: { from: cur.to, insert: f.text }, userEvent: 'input' });
      else view.dispatch({ changes: { from: cur.from, to: cur.to, insert: f.kind === 'remove' ? '' : f.text }, userEvent: 'input' });
      lints = lints.filter(x => x !== cur && x.to > x.from); show(); schedule(300);
    }
    function ignore(l) { ignored.add(keyOf(l)); ctx.settings.set('ignored', [...ignored]); lints = lints.filter(x => keyOf(x) !== keyOf(l)); show(); }
    async function addWord(w) { words.add(w); ctx.settings.set('words', [...words]); try { await linter?.importWords([w]); } catch {} lints = lints.filter(x => !(x.group === 'spell' && x.text === w)); show(); schedule(100); }

    // ---- checking
    async function check() {
      clearTimeout(timer);
      if (disposed) return;
      if (running) { again = true; return; }
      const file = ctx.project.activeFile;
      if (!file || !/\.(tex|ltx|txt|md)$/i.test(file) || !ctx.project.isText(file)) { lints = []; checkedFile = file; return show(); }
      running = true; draw();
      try {
        const l = await load();
        const src = ctx.editor.getText(), prose = /\.(tex|ltx)$/i.test(file) ? proseOf(src) : src;
        const raw = await l.lint(prose, { language: 'plaintext' });
        if (disposed || ctx.project.activeFile !== file) return;
        const K = l.__kinds, style = ctx.settings.get('style', true), out = [];
        for (const x of raw) {
          const sp = x.span(), from = sp.start, to = sp.end;
          const text = src.slice(from, to), kind = x.lint_kind(), group = KIND[kind] || 'style';
          if (to <= from || prose.slice(from, to) !== text) continue;          // touches a command or maths: not prose
          if (/^\s*$/.test(text) && (/[\\{}$~]/.test(src.slice(Math.max(0, from - 2), to + 2)))) continue;
          if (group === 'style' && !style) continue;
          if (group === 'spell' && (/^[A-Z0-9]{2,}s?$/.test(text) || /\d/.test(text) || words.has(text))) continue;   // acronyms, codes
          const fixes = x.suggestions().map(sg => { const k = sg.kind(); return { kind: k === K.Remove ? 'remove' : k === K.InsertAfter ? 'insert' : 'replace', text: sg.get_replacement_text() }; }).filter(f => f.kind === 'remove' || !/[–—⁠]/.test(f.text));
          const item = { from, to, text, kind, group, message: x.message().replace(/\s+/g, ' ').replace(/`([^`]*)`/g, '“$1”'), fixes };
          if (!ignored.has(keyOf(item))) out.push(item);
        }
        lints = out.sort((a, b) => a.from - b.from); checkedFile = file; failed = null;
        // the text may have changed while the check ran
        if (ctx.editor.getText() !== src) again = true;
      } catch (e) { console.error('proofreading', e); failed = e.message || String(e); lints = []; }
      finally { running = false; }
      show();
      if (again) { again = false; schedule(400); }
    }
    const schedule = (ms = 900) => { clearTimeout(timer); timer = setTimeout(check, ms); };
    function show() { try { ctx.editor.view.dispatch({ effects: setLints.of(lints) }); } catch {} draw(); }

    // ---- panel and status
    function draw() {
      const n = lints.length, c = { spell: 0, grammar: 0, style: 0 }; lints.forEach(l => c[l.group]++);
      if (statusEl) { statusEl.textContent = failed ? 'Proofreading unavailable' : !linter ? 'Loading proofreading…' : n ? `${n} writing suggestion${n === 1 ? '' : 's'}` : 'Writing: no suggestions'; statusEl.classList.toggle('pr-has', n > 0); }
      if (!box) return;
      const doc = ctx.editor.view.state.doc;
      const opts = h('div', { class: 'pr-opts' },
        h('label', {}, 'English ', h('select', { onChange: async (e) => { ctx.settings.set('dialect', +e.target.value); try { await linter?.setDialect(+e.target.value); } catch {} schedule(50); } }, DIALECTS.map(([name, v]) => h('option', { value: v, selected: ctx.settings.get('dialect', 1) === v }, name)))),
        h('label', { class: 'check', title: 'Wordiness, redundancy, word choice and readability' }, h('input', { type: 'checkbox', checked: ctx.settings.get('style', true), onChange: (e) => { ctx.settings.set('style', e.target.checked); schedule(50); } }), ' Style'));
      let body;
      if (failed) body = h('p', { class: 'muted pr-pad' }, 'The checker could not be loaded: ' + failed);
      else if (!linter) body = h('p', { class: 'muted pr-pad' }, 'Loading the checker (about 20 MB, the first time only)…');
      else if (!n) body = h('p', { class: 'muted pr-pad' }, /\.(tex|ltx|txt|md)$/i.test(ctx.project.activeFile || '') ? 'No suggestions for this file.' : 'Open a .tex file to check its text.');
      else body = h('div', {}, lints.map(l => {
        const ln = doc.lineAt(Math.min(l.from, doc.length));
        const a = Math.max(ln.from, l.from - 24), b = Math.min(ln.to, l.to + 24);
        return h('div', { class: 'pr-item', onClick: (e) => { if (e.target.closest('button')) return; ctx.editor.view.dispatch({ selection: { anchor: Math.min(l.from, doc.length), head: Math.min(l.to, doc.length) }, effects: EditorView.scrollIntoView(Math.min(l.from, doc.length), { y: 'center' }) }); ctx.editor.focus(); } },
          h('div', { class: 'pr-ctx' }, (a > ln.from ? '…' : '') + doc.sliceString(a, l.from), h('mark', { class: 'pr-' + l.group }, doc.sliceString(l.from, l.to) || '␣'), doc.sliceString(l.to, b) + (b < ln.to ? '…' : '')),
          h('div', { class: 'pr-msg' }, l.message), h('div', { class: 'pr-fixes' }, fixButtons(l)));
      }));
      const sum = n ? h('p', { class: 'pr-pad pr-sum' }, [c.spell && `${c.spell} spelling`, c.grammar && `${c.grammar} grammar`, c.style && `${c.style} style`].filter(Boolean).join(', ') + ` in ${ctx.project.activeFile}`) : null;
      const keep = box.scrollTop; box.replaceChildren(opts, ...[sum, body].filter(Boolean),
        h('p', { class: 'muted pr-pad pr-foot' }, 'Checked on this computer; your text is not sent anywhere. Hover an underlined word in the source for the same fixes.',
          ignored.size || words.size ? h('button', { class: 'small ghost', onClick: () => { ignored.clear(); ctx.settings.set('ignored', []); schedule(50); } }, `Show ignored again (${ignored.size})`) : null));
      box.scrollTop = keep;
    }
    ctx.ui.addPanel({ id: 'proofread', title: 'Proofreading', icon: 'proof', render(el) { box = el; draw(); } });
    statusEl = h('button', { class: 'status-item', title: 'Open the proofreading panel', onClick: () => document.querySelector('.rail-btn[aria-label="Proofreading"]:not(.on)')?.click() });
    ctx.ui.addStatusItem((el) => { el.replaceWith(statusEl); });
    ctx.onDispose(() => statusEl.remove());
    const next = () => { if (!lints.length) return ctx.ui.toast('No writing suggestions.'); const pos = ctx.editor.getCursor().pos, l = lints.find(x => x.from > pos) || lints[0]; ctx.editor.view.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) }); ctx.editor.focus(); };
    ctx.ui.addCommand({ id: 'proofread.next', name: 'Proofreading: go to the next suggestion', key: 'Alt+N', run: next });
    ctx.ui.addCommand({ id: 'proofread.check', name: 'Proofreading: check this file now', run: () => check() });
    ctx.editor.addKeymap([{ key: 'Alt-n', run: () => (next(), true) }]);
    ctx.on('change', (path) => { if (path === ctx.project.activeFile) schedule(); });
    ctx.on('open', () => { lints = []; show(); schedule(200); });
    schedule(1500);
    const css = h('style', {}, `
.pr { text-decoration: underline wavy; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-skip-ink: none; }
.pr-spell { text-decoration-color: var(--err); } .pr-grammar { text-decoration-color: #2f6fde; } .pr-style { text-decoration-color: var(--warn); }
.pr-card { padding: 10px 12px; max-width: 340px; font: 13px/1.45 var(--ui); }
.pr-kind { font-size: 11px; font-weight: 600; margin-bottom: 2px; text-decoration: none; } .pr-kind.pr-spell { color: var(--err); } .pr-kind.pr-grammar { color: #2f6fde; } .pr-kind.pr-style { color: var(--warn); }
.pr-fixes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; } .pr-fix { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.pr-opts { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 12px 8px; color: var(--muted); font-size: 12px; } .pr-opts select { padding: 2px 4px; font-size: 12px; }
.pr-pad { padding: 0 12px; margin: 6px 0; } .pr-sum { font-weight: 600; } .pr-foot { font-size: 12px; margin-top: 14px; } .pr-foot button { display: flex; margin-top: 6px; padding-left: 0; }
.pr-item { padding: 9px 12px; border-top: 1px solid var(--line); cursor: pointer; } .pr-item:hover { background: var(--panel-2); }
.pr-ctx { font: 12px/1.5 var(--mono); color: var(--muted); word-break: break-word; } .pr-ctx mark { background: none; color: var(--ink); font-weight: 600; text-decoration: underline wavy 1px; text-underline-offset: 3px; }
.pr-item .pr-msg { margin-top: 3px; } .pr-item .pr-fixes { margin-top: 6px; }
`);
    document.head.append(css);
    ctx.onDispose(() => { disposed = true; clearTimeout(timer); css.remove(); try { ctx.editor.view.dispatch({ effects: setLints.of([]) }); } catch {} try { linter?.dispose?.(); } catch {} });
  },
};
