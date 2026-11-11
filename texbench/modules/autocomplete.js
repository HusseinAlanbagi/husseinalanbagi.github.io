// Autocomplete for LaTeX: commands, environments, \ref labels, \cite keys, file names and packages.
const COMMANDS = ['section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'label{}', 'ref{}', 'eqref{}', 'cref{}', 'autoref{}', 'pageref{}', 'cite{}', 'citet{}', 'citep{}', 'citeauthor{}', 'citeyear{}', 'footnote{}', 'textbf{}', 'textit{}', 'emph{}', 'underline{}', 'texttt{}', 'textsc{}',
  'frac{}{}', 'sqrt{}', 'sum', 'prod', 'int', 'partial', 'infty', 'left(', 'right)', 'left[', 'right]', 'cdot', 'times', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'in', 'forall', 'exists', 'rightarrow', 'Rightarrow', 'leftarrow', 'to', 'mapsto',
  'mathbb{}', 'mathcal{}', 'mathbf{}', 'mathrm{}', 'mathit{}', 'boldsymbol{}', 'hat{}', 'bar{}', 'tilde{}', 'widehat{}', 'overline{}', 'dot{}', 'text{}', 'operatorname{}', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'arg',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'usepackage{}', 'documentclass{}', 'input{}', 'include{}', 'includegraphics[width=\\textwidth]{}', 'caption{}', 'centering', 'toprule', 'midrule', 'bottomrule', 'hline', 'multicolumn{}{}{}', 'multirow{}{}{}', 'item', 'newcommand{}{}', 'renewcommand{}{}', 'DeclareMathOperator{}{}',
  'title{}', 'author{}', 'date{}', 'maketitle', 'tableofcontents', 'bibliography{}', 'bibliographystyle{}', 'newpage', 'clearpage', 'noindent', 'vspace{}', 'hspace{}', 'quad', 'qquad', 'nonumber', 'notag', 'today', 'appendix', 'textwidth', 'linewidth'];
const ENVS = ['equation', 'equation*', 'align', 'align*', 'gather', 'multline', 'split', 'aligned', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'figure', 'table', 'tabular', 'itemize', 'enumerate', 'description', 'abstract', 'center', 'quote', 'theorem', 'lemma', 'proposition', 'corollary', 'definition', 'proof', 'remark', 'assumption', 'tikzpicture', 'axis', 'frame', 'columns', 'minipage', 'subfigure', 'verbatim', 'appendix', 'threeparttable', 'tablenotes', 'landscape'];
const PACKAGES = ['amsmath', 'amssymb', 'amsthm', 'mathtools', 'bm', 'graphicx', 'booktabs', 'geometry', 'hyperref', 'cleveref', 'natbib', 'biblatex', 'xcolor', 'tikz', 'pgfplots', 'siunitx', 'setspace', 'caption', 'subcaption', 'float', 'multirow', 'threeparttable', 'longtable', 'dcolumn', 'enumitem', 'fancyhdr', 'titlesec', 'appendix', 'lmodern', 'fontenc', 'inputenc', 'babel', 'csquotes', 'microtype', 'rotating', 'pdflscape', 'placeins', 'footmisc', 'authblk', 'url', 'todonotes', 'listings', 'algorithm2e', 'tabularx', 'array', 'bbm', 'dsfont', 'mathrsfs', 'eurosym', 'ulem', 'soul'];

export default {
  id: 'autocomplete',
  name: 'Autocomplete',
  description: 'Suggests commands, environments, \\ref labels, \\cite keys, file names and packages as you type.',
  category: 'Writing',
  activate(ctx) {
    const { snippetCompletion } = ctx.cm;
    let cache = null;
    const scanProject = () => {
      if (cache) return cache;
      const labels = new Map(), cites = new Map(), macros = new Set();
      for (const p of ctx.project.files()) {
        if (!ctx.project.isText(p)) continue;
        const text = ctx.project.read(p);
        if (/\.(tex|sty|cls)$/i.test(p)) {
          for (const m of text.matchAll(/\\label\{([^}]+)\}/g)) labels.set(m[1], p);
          for (const m of text.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)\}?|\\DeclareMathOperator\*?\s*\{\\([A-Za-z]+)\}|\\def\\([A-Za-z]+)/g)) macros.add(m[1] || m[2] || m[3]);
          for (const m of text.matchAll(/\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g)) cites.set(m[1], 'bibitem');
        } else if (/\.bib$/i.test(p)) {
          for (const m of text.matchAll(/@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n@|$)/g)) {
            if (/^(comment|string|preamble)$/i.test(m[1])) continue;
            const field = (n) => (new RegExp(`\\b${n}\\s*=\\s*[{"]([\\s\\S]*?)["}]\\s*,?\\s*(?:\\n|$)`, 'i').exec(m[3]) || [])[1]?.replace(/[{}\n]/g, '').replace(/\s+/g, ' ').trim() || '';
            cites.set(m[2], [field('author').split(' and ').map(a => a.split(',')[0]).slice(0, 3).join(', '), field('year'), field('title')].filter(Boolean).join(' · '));
          }
        }
      }
      return (cache = { labels, cites, macros });
    };
    const invalidate = () => { cache = null; };
    ctx.on('change', invalidate); ctx.on('files', invalidate); ctx.on('project', invalidate);

    ctx.editor.addCompletionSource((c) => {
      const line = c.state.doc.lineAt(c.pos), before = line.text.slice(0, c.pos - line.from);
      let m;
      if ((m = /\\(?:eq|c|C|auto|page|v|name)?ref\{([^}]*)$/.exec(before))) { const { labels } = scanProject(); return { from: c.pos - m[1].length, options: [...labels].map(([label, file]) => ({ label, detail: file, type: 'constant' })), validFor: /^[^}]*$/ }; }
      if ((m = /\\[a-zA-Z]*cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{(?:[^},]*,\s*)*([^},]*)$/.exec(before))) { const { cites } = scanProject(); return { from: c.pos - m[1].length, options: [...cites].map(([label, detail]) => ({ label, detail, type: 'text' })), validFor: /^[^},]*$/ }; }
      if ((m = /\\(?:begin|end)\{([^}]*)$/.exec(before))) return { from: c.pos - m[1].length, options: ENVS.map(label => ({ label, type: 'class' })), validFor: /^[\w*]*$/ };
      if ((m = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{(?:[^},]*,\s*)*([^},]*)$/.exec(before))) return { from: c.pos - m[1].length, options: PACKAGES.map(label => ({ label, type: 'namespace' })), validFor: /^[\w-]*$/ };
      if ((m = /\\(input|include|includegraphics|bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)$/.exec(before))) {
        const want = { input: /\.tex$/i, include: /\.tex$/i, includegraphics: /\.(png|jpe?g|pdf|eps)$/i, bibliography: /\.bib$/i, addbibresource: /\.bib$/i }[m[1]];
        const strip = m[1] === 'addbibresource' || m[1] === 'includegraphics' ? (p) => p : (p) => p.replace(/\.(tex|bib)$/i, '');
        return { from: c.pos - m[2].length, options: ctx.project.files().filter(p => want.test(p)).map(p => ({ label: strip(p), type: 'variable' })), validFor: /^[^}]*$/ };
      }
      if ((m = /\\([a-zA-Z]*)$/.exec(before)) && (m[1].length || c.explicit)) {
        const { macros } = scanProject();
        const opts = [
          ...ENVS.slice(0, 22).map(e => snippetCompletion(`\\begin{${e}}\n\t\${}\n\\end{${e}}`, { label: `\\begin{${e}}`, type: 'class', boost: m[1].startsWith('b') ? 2 : -1 })),
          ...COMMANDS.map(cmd => { const name = cmd.replace(/[{[(].*$/, ''); let n = 0; return cmd.includes('{}') ? snippetCompletion('\\' + cmd.replace(/\{\}/g, () => `{\${${++n}}}`), { label: '\\' + name, detail: cmd.slice(name.length), type: 'function' }) : { label: '\\' + cmd, type: 'function' }; }),
          ...[...macros].map(x => ({ label: '\\' + x, detail: 'yours', type: 'variable', boost: 1 })),
        ];
        return { from: c.pos - m[0].length, options: opts, validFor: /^\\[a-zA-Z]*$/ };
      }
      return null;
    });
  },
};
