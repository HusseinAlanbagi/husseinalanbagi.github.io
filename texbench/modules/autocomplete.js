// Autocomplete for LaTeX: commands, environments, \ref labels, \cite keys, file names and packages.
const COMMANDS = ['section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'label{}', 'ref{}', 'eqref{}', 'cref{}', 'autoref{}', 'pageref{}', 'cite{}', 'citet{}', 'citep{}', 'citeauthor{}', 'citeyear{}', 'footnote{}', 'textbf{}', 'textit{}', 'emph{}', 'underline{}', 'texttt{}', 'textsc{}',
  'frac{}{}', 'sqrt{}', 'sum', 'prod', 'int', 'partial', 'infty', 'left(', 'right)', 'left[', 'right]', 'cdot', 'times', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'in', 'forall', 'exists', 'rightarrow', 'Rightarrow', 'leftarrow', 'to', 'mapsto',
  'mathbb{}', 'mathcal{}', 'mathbf{}', 'mathrm{}', 'mathit{}', 'boldsymbol{}', 'hat{}', 'bar{}', 'tilde{}', 'widehat{}', 'overline{}', 'dot{}', 'text{}', 'operatorname{}', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'arg',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'usepackage{}', 'documentclass{}', 'input{}', 'include{}', 'includegraphics[width=\\textwidth]{}', 'caption{}', 'centering', 'toprule', 'midrule', 'bottomrule', 'hline', 'multicolumn{}{}{}', 'multirow{}{}{}', 'item', 'newcommand{}{}', 'renewcommand{}{}', 'DeclareMathOperator{}{}',
  'title{}', 'author{}', 'date{}', 'maketitle', 'tableofcontents', 'bibliography{}', 'bibliographystyle{}', 'newpage', 'clearpage', 'noindent', 'vspace{}', 'hspace{}', 'quad', 'qquad', 'nonumber', 'notag', 'today', 'appendix', 'textwidth', 'linewidth'];
const ENVS = ['equation', 'equation*', 'align', 'align*', 'gather', 'multline', 'split', 'aligned', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'figure', 'table', 'tabular', 'itemize', 'enumerate', 'description', 'abstract', 'center', 'quote', 'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'assumption', 'tikzpicture', 'axis', 'frame', 'columns', 'minipage', 'subfigure', 'verbatim', 'appendix', 'threeparttable', 'tablenotes', 'landscape'];
// What each environment is for (shown beside it), and what is filled in when you pick it. ${n} are the places Tab moves to.
const ENV_INFO = { equation: 'numbered equation', 'equation*': 'equation without a number', align: 'aligned equations, numbered', 'align*': 'aligned equations, no numbers', gather: 'centred equations, numbered', multline: 'one long equation over lines', split: 'split one equation (inside equation)', aligned: 'aligned block inside maths', cases: 'piecewise cases', matrix: 'matrix, no brackets', pmatrix: 'matrix in ( )', bmatrix: 'matrix in [ ]', figure: 'figure with caption and label', table: 'table with caption and label', tabular: 'grid of cells', itemize: 'bullet list', enumerate: 'numbered list', description: 'list of terms', abstract: 'abstract', center: 'centred block', quote: 'indented quotation', theorem: 'theorem', lemma: 'lemma', proposition: 'proposition', corollary: 'corollary', definition: 'definition', proof: 'proof, ends with ∎', remark: 'remark', assumption: 'assumption', tikzpicture: 'TikZ drawing', axis: 'pgfplots axis', frame: 'Beamer slide', columns: 'Beamer columns', minipage: 'box of a given width', subfigure: 'part of a figure', verbatim: 'text exactly as typed', appendix: 'appendix sections', threeparttable: 'table with notes', tablenotes: 'notes under a table', landscape: 'landscape page' };
const COMMON = { equation: 12, align: 11, figure: 10, table: 9, itemize: 8, enumerate: 7, tabular: 6, 'equation*': 5, 'align*': 4, proposition: 3, proof: 2 };
const ENV_BODY = {
  figure: '[htbp]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${1:file}}\n\t\\caption{${2:Caption}}\n\t\\label{fig:${3}}\n',
  table: '[htbp]\n\t\\centering\n\t\\caption{${1:Caption}}\n\t\\label{tab:${2}}\n\t\\begin{tabular}{${3:lcc}}\n\t\t\\toprule\n\t\t${4} \\\\\n\t\t\\midrule\n\t\t \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n',
  tabular: '{${1:lcc}}\n\t${2}\n', itemize: '\n\t\\item ${1}\n', enumerate: '\n\t\\item ${1}\n', description: '\n\t\\item[${1:Term}] ${2}\n',
  frame: '{${1:Title}}\n\t${2}\n', minipage: '{${1:0.48\\linewidth}}\n\t${2}\n', subfigure: '{${1:0.48\\linewidth}}\n\t\\centering\n\t${2}\n', columns: '\n\t\\column{0.5\\textwidth}\n\t${1}\n',
  axis: '[xlabel={${1}}, ylabel={${2}}]\n\t\\addplot ${3};\n', cases: '\n\t${1} & \\text{if } ${2} \\\\\n\t${3} & \\text{otherwise}\n'
};
const PACKAGES = ['amsmath', 'amssymb', 'amsthm', 'mathtools', 'bm', 'graphicx', 'booktabs', 'geometry', 'hyperref', 'cleveref', 'natbib', 'biblatex', 'xcolor', 'tikz', 'pgfplots', 'siunitx', 'setspace', 'caption', 'subcaption', 'float', 'multirow', 'threeparttable', 'longtable', 'dcolumn', 'enumitem', 'fancyhdr', 'titlesec', 'appendix', 'lmodern', 'fontenc', 'inputenc', 'babel', 'csquotes', 'microtype', 'rotating', 'pdflscape', 'placeins', 'footmisc', 'authblk', 'url', 'todonotes', 'listings', 'algorithm2e', 'tabularx', 'array', 'bbm', 'dsfont', 'mathrsfs', 'eurosym', 'ulem', 'soul'];

export default {
  id: 'autocomplete',
  name: 'Autocomplete',
  description: 'Suggests commands, environments, \\ref labels, \\cite keys, file names and packages as you type.',
  category: 'Writing',
  activate(ctx) {
    const { snippetCompletion, snippet, startCompletion } = ctx.cm;
    // environments still open before a position, innermost last
    const openEnvs = (text) => { const st = []; for (const x of text.replace(/(^|[^\\])%.*$/gm, '$1').matchAll(/\\(begin|end)\{([^}]+)\}/g)) { if (x[1] === 'begin') st.push(x[2]); else { const k = st.lastIndexOf(x[2]); if (k >= 0) st.length = k; } } return st; };
    let cache = null;
    const scanProject = () => {
      if (cache) return cache;
      const labels = new Map(), cites = new Map(), macros = new Set(), envs = new Set();
      for (const p of ctx.project.files()) {
        if (!ctx.project.isText(p)) continue;
        const text = ctx.project.read(p);
        if (/\.(tex|sty|cls)$/i.test(p)) {
          for (const m of text.matchAll(/\\label\{([^}]+)\}/g)) labels.set(m[1], p);
          for (const m of text.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?|\\DeclareMathOperator\*?\s*\{\\([A-Za-z]+)\}|\\def\\([A-Za-z]+)/g)) macros.add(m[1] || m[2] || m[3]);
          for (const m of text.matchAll(/\\(?:newtheorem|newenvironment|declaretheorem)\*?\s*\{([^}]+)\}/g)) envs.add(m[1]);
          for (const m of text.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) cites.set(m[1], 'bibitem');
        } else if (/\.bib$/i.test(p)) {
          for (const m of text.matchAll(/@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|$)/g)) {
            if (/^(comment|string|preamble)$/i.test(m[1])) continue;
            const field = (n) => (new RegExp(`\\b${n}\\s*=\\s*[{"]([\\s\\S]*?)["}]\\s*,?\\s*(?:\\n|$)`, 'i').exec(m[3]) || [])[1]?.replace(/[{}\n]/g, '').replace(/\s+/g, ' ').trim() || '';
            cites.set(m[2], [field('author').split(' and ').map(a => a.split(',')[0]).slice(0, 3).join(', '), field('year'), field('title')].filter(Boolean).join(' · '));
          }
        }
      }
      return (cache = { labels, cites, macros, envs });
    };
    const invalidate = () => { cache = null; };
    ctx.on('change', invalidate); ctx.on('files', invalidate); ctx.on('project', invalidate);

    ctx.editor.addCompletionSource((c) => {
      const line = c.state.doc.lineAt(c.pos), before = line.text.slice(0, c.pos - line.from);
      let m;
      if ((m = /\\(?:eq|c|C|auto|page|v|name)?ref\{([^}]*)$/.exec(before))) { const { labels } = scanProject(); return { from: c.pos - m[1].length, options: [...labels].map(([label, file]) => ({ label, detail: file, type: 'constant' })), validFor: /^[^}]*$/ }; }
      if ((m = /\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{(?:[^},]*,\s*)*([^},]*)$/.exec(before))) { const { cites } = scanProject(); return { from: c.pos - m[1].length, options: [...cites].map(([label, detail]) => ({ label, detail, type: 'text' })), validFor: /^[^},]*$/ }; }
      if ((m = /\\(begin|end)\{([\w*]*)$/.exec(before))) {
        const isBegin = m[1] === 'begin', from = c.pos - m[2].length;
        const open = openEnvs(c.state.sliceDoc(0, line.from + before.length - m[0].length));
        const names = [...new Set([...(isBegin ? [] : open.slice().reverse()), ...ENVS, ...scanProject().envs])];
        return { from, validFor: /^[\w*]*$/, options: names.map((env, i) => ({ label: env, type: 'class', detail: ENV_INFO[env] || '', boost: !isBegin && open.includes(env) ? 99 - i : (COMMON[env] || 0),
          apply: (view, comp, f, t) => {
            // replace the typed name and any name and } already after the cursor
            const rest = view.state.sliceDoc(t, Math.min(view.state.doc.length, t + 60)), tail = /^[\w*]*\}?/.exec(rest)[0];
            const end = t + tail.length;
            if (!isBegin) { view.dispatch({ changes: { from: f, to: end, insert: env + '}' }, selection: { anchor: f + env.length + 1 }, userEvent: 'input.complete' }); return; }
            const closed = new RegExp('^\\s*\\\\end\\{' + env.replace(/\*/g, '\\*') + '\\}').test(view.state.sliceDoc(end, end + 200));
            snippet(env + '}' + (closed ? '${0}' : (ENV_BODY[env] || '\n\t${0}\n') + '\\end{' + env + '}'))(view, comp, f, end);
          } })) };
      }

      if ((m = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{(?:[^},]*,\s*)*([^},]*)$/.exec(before))) return { from: c.pos - m[1].length, options: PACKAGES.map(label => ({ label, type: 'namespace' })), validFor: /^[\w-]*$/ };
      if ((m = /\\(input|include|includegraphics|bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)$/.exec(before))) {
        const want = { input: /\.tex$/i, include: /\.tex$/i, includegraphics: /\.(png|jpe?g|pdf|eps)$/i, bibliography: /\.bib$/i, addbibresource: /\.bib$/i }[m[1]];
        const strip = m[1] === 'addbibresource' || m[1] === 'includegraphics' ? (p) => p : (p) => p.replace(/\.(tex|bib)$/i, '');
        return { from: c.pos - m[2].length, options: ctx.project.files().filter(p => want.test(p)).map(p => ({ label: strip(p), type: 'variable' })), validFor: /^[^}]*$/ };
      }
      if ((m = /\\([a-zA-Z]*)$/.exec(before)) && (m[1].length || c.explicit)) {
        const { macros } = scanProject();
        // \begin and \end insert their braces and open the list of environments straight away
        const brace = (name) => ({ label: '\\' + name, detail: '{…}', type: 'keyword', boost: 50, info: name === 'begin' ? 'Start an environment: pick it from the list that opens' : 'Close the open environment',
          apply: (view, comp, from, to) => {
            const after = view.state.sliceDoc(to, to + 1) === '{';
            view.dispatch({ changes: { from, to, insert: '\\' + name + (after ? '' : '{}') }, selection: { anchor: from + name.length + 2 }, userEvent: 'input.complete' });
            setTimeout(() => startCompletion(view), 0);
          } });
        const opts = [
          brace('begin'), brace('end'),
          ...COMMANDS.map(cmd => { const name = cmd.replace(/[{[(].*$/, ''); let n = 0; return cmd.includes('{}') ? snippetCompletion('\\' + cmd.replace(/\{\}/g, () => `{\${${++n}}}`), { label: '\\' + name, detail: cmd.slice(name.length), type: 'function' }) : { label: '\\' + cmd, type: 'function' }; }),
          ...[...macros].map(x => ({ label: '\\' + x, detail: 'yours', type: 'variable', boost: 1 })),
        ];
        return { from: c.pos - m[0].length, options: opts, validFor: /^\\[a-zA-Z]*$/ };
      }
      return null;
    });
  },
};
