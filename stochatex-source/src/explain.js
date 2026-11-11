// Plain-language explanations for TeX errors and warnings, with fixes.
// explain(problem, env) -> { title, why, fixes: [ { label, edit?, goto? } ] } or null.
//   edit: { file, line, find, replace }  replace text on one line (find may be a RegExp)
//         { file, preamble: text }         add a line just before \begin{document}
//         { file, line, insertAfter: text } add a line after this one
//   goto: { file, line }
// env: { text(file), files, main }

// commands that need a package
const CMD_PKG = {
  mathbb: 'amssymb', mathfrak: 'amssymb', varnothing: 'amssymb', lesssim: 'amssymb', gtrsim: 'amssymb', therefore: 'amssymb', because: 'amssymb', square: 'amssymb', blacksquare: 'amssymb', checkmark: 'amssymb', nexists: 'amssymb', leqslant: 'amssymb', geqslant: 'amssymb', mathscr: 'mathrsfs',
  text: 'amsmath', eqref: 'amsmath', boldsymbol: 'amsmath', dfrac: 'amsmath', tfrac: 'amsmath', binom: 'amsmath', operatorname: 'amsmath', DeclareMathOperator: 'amsmath', iint: 'amsmath', iiint: 'amsmath', numberwithin: 'amsmath', intertext: 'amsmath', substack: 'amsmath', xrightarrow: 'amsmath', overset: 'amsmath', underset: 'amsmath', tag: 'amsmath', smash: 'amsmath',
  coloneqq: 'mathtools', mathclap: 'mathtools', DeclarePairedDelimiter: 'mathtools', bm: 'bm', mathds: 'dsfont', mathbbm: 'bbm',
  includegraphics: 'graphicx', graphicspath: 'graphicx', rotatebox: 'graphicx', scalebox: 'graphicx', resizebox: 'graphicx',
  toprule: 'booktabs', midrule: 'booktabs', bottomrule: 'booktabs', cmidrule: 'booktabs', addlinespace: 'booktabs', multirow: 'multirow',
  cref: 'cleveref', Cref: 'cleveref', crefrange: 'cleveref', autoref: 'hyperref', href: 'hyperref', url: 'url', hypersetup: 'hyperref', nameref: 'hyperref', phantomsection: 'hyperref',
  citet: 'natbib', citep: 'natbib', citeauthor: 'natbib', citeyear: 'natbib', citealp: 'natbib', citealt: 'natbib', textcite: 'biblatex', parencite: 'biblatex', autocite: 'biblatex', printbibliography: 'biblatex', addbibresource: 'biblatex',
  color: 'xcolor', textcolor: 'xcolor', colorbox: 'xcolor', definecolor: 'xcolor', SI: 'siunitx', si: 'siunitx', num: 'siunitx', qty: 'siunitx', unit: 'siunitx', sisetup: 'siunitx',
  singlespacing: 'setspace', onehalfspacing: 'setspace', doublespacing: 'setspace', setstretch: 'setspace', FloatBarrier: 'placeins', captionof: 'caption', captionsetup: 'caption', subcaption: 'subcaption',
  sout: 'ulem', uline: 'ulem', hl: 'soul', todo: 'todonotes', lipsum: 'lipsum', geometry: 'geometry', newgeometry: 'geometry', tikz: 'tikz', usetikzlibrary: 'tikz', pgfplotsset: 'pgfplots', fancyhead: 'fancyhdr', fancyfoot: 'fancyhdr', lhead: 'fancyhdr', rhead: 'fancyhdr', cfoot: 'fancyhdr',
  euro: 'eurosym', textdegree: 'textcomp', blindtext: 'blindtext', lstinline: 'listings', lstset: 'listings', thead: 'makecell', makecell: 'makecell', newcolumntype: 'array', arraybackslash: 'array', theoremstyle: 'amsthm', qedhere: 'amsthm', newtheorem: 'amsthm', affil: 'authblk', ExecuteBibliographyOptions: 'biblatex', input: null,
};
const ENV_PKG = { align: 'amsmath', 'align*': 'amsmath', gather: 'amsmath', 'gather*': 'amsmath', multline: 'amsmath', 'multline*': 'amsmath', split: 'amsmath', aligned: 'amsmath', cases: 'amsmath', pmatrix: 'amsmath', bmatrix: 'amsmath', vmatrix: 'amsmath', matrix: 'amsmath', 'equation*': 'amsmath', flalign: 'amsmath', alignat: 'amsmath', proof: 'amsthm', tikzpicture: 'tikz', axis: 'pgfplots', subfigure: 'subcaption', subtable: 'subcaption', threeparttable: 'threeparttable', tablenotes: 'threeparttable', landscape: 'pdflscape', algorithm: 'algorithm', algorithmic: 'algpseudocode', lstlisting: 'listings', longtable: 'longtable', tabularx: 'tabularx', minted: 'minted', spacing: 'setspace', singlespace: 'setspace', comment: 'comment', wrapfigure: 'wrapfig', sidewaystable: 'rotating', sidewaysfigure: 'rotating', frame: null, columns: null };
const THEOREMS = { theorem: 'Theorem', lemma: 'Lemma', proposition: 'Proposition', corollary: 'Corollary', definition: 'Definition', assumption: 'Assumption', remark: 'Remark', example: 'Example', conjecture: 'Conjecture', claim: 'Claim', hypothesis: 'Hypothesis' };
// commands people commonly mistype, to suggest the nearest
const KNOWN = ('section subsection subsubsection paragraph label ref eqref cref pageref cite citet citep citeauthor footnote textbf textit emph underline texttt textsc frac dfrac sqrt sum prod int partial infty left right cdot times leq geq neq approx equiv sim forall exists rightarrow Rightarrow leftarrow mapsto mathbb mathcal mathbf mathrm boldsymbol hat bar tilde widehat overline dot ddot text operatorname log ln exp max min lim sup inf arg det alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega usepackage documentclass input include includegraphics caption centering toprule midrule bottomrule hline multicolumn multirow item newcommand renewcommand title author date maketitle tableofcontents bibliography bibliographystyle newpage clearpage noindent vspace hspace quad qquad nonumber notag today appendix textwidth linewidth begin end mathit ldots cdots vdots ddots in notin subset subseteq cup cap setminus emptyset nabla pm mp div circ bullet star ast prime langle rangle lfloor rfloor lceil rceil vert Vert mid parallel perp to gets uparrow downarrow leftrightarrow Leftrightarrow implies iff neg land lor top bot ell Re Im wp aleph hbar imath jmath displaystyle textstyle scriptstyle limits nolimits overbrace underbrace stackrel mathop varpi varsigma varrho textrm textsf small large Large footnotesize normalsize medskip bigskip smallskip newline linebreak pagebreak hfill vfill url href').split(' ');

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : 99);
  return d[a.length][b.length];
}
const nearest = (word, list, max = 2) => { let best = null, bd = max + 1; for (const w of list) { if (w === word) continue; const x = lev(word.toLowerCase(), w.toLowerCase()); if (x < bd) { bd = x; best = w; } } return best; };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripComments = (t) => t.replace(/(^|[^\\])%.*$/gm, '$1');
const preambleOf = (t) => { const i = t.indexOf('\\begin{document}'); return stripComments(i < 0 ? t : t.slice(0, i)); };
const loaded = (t, pkg) => new RegExp(`\\\\usepackage\\s*(\\[[^\\]]*\\])?\\s*\\{[^}]*\\b${reEsc(pkg)}\\b[^}]*\\}`).test(preambleOf(t));
const addPkg = (file, pkg, opt = '') => ({ label: `Add \\usepackage${opt ? '[' + opt + ']' : ''}{${pkg}}`, edit: { file, preamble: `\\usepackage${opt ? '[' + opt + ']' : ''}{${pkg}}` } });
const lineText = (env, file, line) => { const t = env.text(file); if (t == null || !line) return ''; return t.split('\n')[line - 1] || ''; };

export function explain(p, env) {
  const msg = p.message || '', file = p.file || env.main, line = p.line, src = lineText(env, file, line), all = env.text(env.main) || '';
  const token = p.token || ((/(\\[A-Za-z@]+\*?)\s*$/.exec(msg) || [])[1]);
  let m;
  // ---------- errors
  if (/^Undefined control sequence/.test(msg)) {
    const name = (token || '').replace(/^\\/, '').replace(/\*$/, '');
    const fixes = [];
    const pkg = CMD_PKG[name];
    const userMacros = [...stripComments(env.files.filter(f => /\.(tex|sty|cls)$/i.test(f)).map(f => env.text(f) || '').join('\n')).matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)|\\DeclareMathOperator\*?\s*\{\\([A-Za-z]+)|\\def\\([A-Za-z]+)/g)].map(x => x[1] || x[2] || x[3]);
    if (pkg && !loaded(all, pkg)) fixes.push(addPkg(env.main, pkg));
    const near = !pkg && name ? nearest(name, [...KNOWN, ...Object.keys(CMD_PKG), ...userMacros]) : null;
    if (near && src.includes('\\' + name)) fixes.push({ label: `Change \\${name} to \\${near}`, edit: { file, line, find: new RegExp(reEsc('\\' + name) + '(?![A-Za-z])', 'g'), replace: '\\' + near } });
    if (name && !pkg && !near) fixes.push({ label: `Define it: \\newcommand{\\${name}}{…}`, edit: { file: env.main, preamble: `\\newcommand{\\${name}}{${name}}` } });
    return { title: name ? `LaTeX does not know the command \\${name}` : 'A command here is not defined',
      why: pkg ? (loaded(all, pkg) ? `\\${name} comes from the ${pkg} package, which is loaded; check that it is used where it is allowed (maths commands only work inside maths).` : `\\${name} comes from the ${pkg} package, which this document does not load.`)
        : near ? `It is probably a typo for \\${near}.` : 'It is not a standard command, and no package or \\newcommand in this project defines it.',
      fixes };
  }
  if ((m = /^Environment (\S+) undefined/.exec(msg))) {
    const e = m[1], pkg = ENV_PKG[e], fixes = [];
    if (pkg && !loaded(all, pkg)) fixes.push(addPkg(env.main, pkg));
    else if (THEOREMS[e]) fixes.push({ label: `Define it: \\newtheorem{${e}}{${THEOREMS[e]}}`, edit: { file: env.main, preamble: `\\newtheorem{${e}}{${THEOREMS[e]}}` } });
    const near = !pkg && !THEOREMS[e] ? nearest(e, [...Object.keys(ENV_PKG), ...Object.keys(THEOREMS), 'equation', 'figure', 'table', 'tabular', 'itemize', 'enumerate', 'description', 'abstract', 'center', 'quote', 'document', 'minipage', 'verbatim']) : null;
    if (near) fixes.push({ label: `Change ${e} to ${near}`, edit: { file, line, find: new RegExp(`\\\\begin\\{${reEsc(e)}\\}`), replace: `\\begin{${near}}` } });
    return { title: `There is no environment called “${e}”`, why: pkg ? `${e} comes from the ${pkg} package, which is not loaded.` : THEOREMS[e] ? `Theorem-like environments must be declared with \\newtheorem before use.` : near ? `It is probably a typo for ${near}.` : 'No loaded package or \\newenvironment defines it.', fixes };
  }
  if ((m = /\\begin\{([^}]*)\}(?: on input line (\d+))? ended by \\end\{([^}]*)\}/.exec(msg)) && m[3] !== 'document') {
    // read the source rather than trusting TeX, which can lose track after an earlier error
    const open = openEnvs(env.text(file) || '', line), inner = open[open.length - 1] || { name: m[1], line: +m[2] || null };
    return { title: `\\end{${m[3]}} does not match \\begin{${inner.name}}`, why: `Environments close in the reverse order they open. The one open here is ${inner.name}${inner.line ? ` (line ${inner.line})` : ''}, so either this should be \\end{${inner.name}}, or an \\end{${inner.name}} is missing before it.`,
      fixes: [{ label: `Change it to \\end{${inner.name}}`, edit: { file, line, find: `\\end{${m[3]}}`, replace: `\\end{${inner.name}}` } }, ...(inner.line ? [{ label: `Go to \\begin{${inner.name}}`, goto: { file, line: inner.line } }] : [])] };
  }
  if (/^Missing \\endgroup inserted|^Extra \\endgroup|^Missing \\endcsname|^Extra \\else|^Extra \\fi|^Incomplete \\if/.test(msg)) return { title: 'A group was closed in the wrong place', why: 'This usually follows an earlier error on or above this line (an unclosed $, brace or environment). Fix the first error in the list and this one goes away.', fixes: [] };
  if ((m = /^\\begin\{([^}]*)\} ended by \\end\{document\}|Missing \\end\{([^}]*)\}|\\begin\{(\w+)\} on input line (\d+) ended by \\end\{document\}/.exec(msg)) || /ended by \\end\{document\}/.test(msg)) {
    const e = (/\\begin\{([^}]*)\}/.exec(msg) || [])[1] || 'environment';
    return { title: `\\begin{${e}} is never closed`, why: `LaTeX reached \\end{document} while ${e} was still open.`, fixes: [{ label: `Find the \\begin{${e}}`, goto: { file, line: +((/input line (\d+)/.exec(msg) || [])[1] || line) } }] };
  }
  if (/^Missing \$ inserted/.test(msg)) {
    const fixes = [];
    if (/(^|[^\\$])_/.test(src.replace(/\$[^$]*\$/g, '')) && !/\\(url|href|label|ref|cite|includegraphics|input)/.test(src)) fixes.push({ label: 'Escape the underscores in text: _ → \\_', edit: { file, line, find: /(?<![\\$])_(?![^$]*\$)/g, replace: '\\_' } });
    return { title: 'Maths used outside maths mode', why: 'A maths-only symbol (_, ^, \\alpha, \\frac…) is in normal text, or a $ is missing or extra so the maths ended early. A blank line inside display maths causes this too.', fixes: fixes.length ? fixes : [{ label: 'Wrap the symbol in $…$, or remove the blank line inside the equation', goto: { file, line } }] };
  }
  if (/^Display math should end with \$\$|^Bad math environment delimiter|^Command \\\[ invalid in math mode|^Command \\\( invalid/.test(msg)) return { title: 'Maths opened inside maths', why: 'A $, \\[ or \\( starts maths while maths is already open, usually because an earlier one was not closed.', fixes: [{ label: 'Check the maths delimiters on this line and above', goto: { file, line } }] };
  if (/^Missing \} inserted/.test(msg)) return { title: 'A { is not closed', why: 'Something opened with { (or \\left) was still open when a group or the line had to end. Inside maths, \\left( needs a matching \\right).', fixes: braceFix(src, file, line) };
  if (/^Too many \}'s|^Extra \}, or forgotten/.test(msg)) return { title: 'An extra } closes nothing', why: 'There is a } without a matching {, or an environment or \\left was closed in the wrong place.', fixes: braceFix(src, file, line) };
  if (/^Missing \{ inserted/.test(msg)) return { title: 'A { was expected here', why: 'A command that needs an argument in braces got something else, often a stray } or maths symbol, or & outside an alignment.', fixes: [] };
  if (/^Missing \\right\. inserted|^Extra \\right|^Missing \\left|Extra \\middle/.test(msg)) return { title: '\\left and \\right do not pair up', why: 'Every \\left needs a \\right in the same line of an equation (use \\right. for an invisible one). They cannot span & or \\\\ in align.', fixes: [] };
  if (/^Misplaced alignment tab character &/.test(msg)) {
    const fixes = /&/.test(src) && !/\\begin\{(tabular|align|array|matrix|cases)/.test(src) ? [{ label: 'Write a literal ampersand: & → \\&', edit: { file, line, find: /(?<!\\)&/g, replace: '\\&' } }] : [];
    return { title: 'An & outside a table or alignment', why: '& separates columns. In normal text write \\& for an ampersand; in maths, & only works inside align, array, matrix or cases.', fixes };
  }
  if (/^Extra alignment tab has been changed to \\cr/.test(msg)) return { title: 'This row has more cells than the table has columns', why: 'There is one & too many on this row, or the column specification (e.g. {lcc}) has too few columns.', fixes: [{ label: 'Check the & count against the {…} column list', goto: { file, line } }] };
  if (/^Double subscript|^Double superscript/.test(msg)) {
    const sup = /super/.test(msg);
    return { title: `Two ${sup ? 'superscripts' : 'subscripts'} on one symbol`, why: `x${sup ? '^a^b' : '_a_b'} is ambiguous. Group them: x${sup ? '^{a^b}' : '_{a_b}'}, or x${sup ? '^{ab}' : '_{ab}'} if you meant one ${sup ? 'superscript' : 'subscript'}.`, fixes: [] };
  }
  if (/^There's no line here to end/.test(msg)) return { title: '\\\\ with no line to end', why: '\\\\ ends a line, but here it comes after a blank line or at the start of a paragraph. Use a blank line for a new paragraph, or \\vspace{…} for space.', fixes: /\\\\/.test(src) ? [{ label: 'Remove the \\\\ on this line', edit: { file, line, find: /\\\\\s*(\[[^\]]*\])?\s*$/, replace: '' } }] : [] };
  if ((m = /^File [`'](.+?)' not found/.exec(msg)) || (m = /^LaTeX Error: File [`'](.+?)' not found/.exec(msg))) {
    const f = m[1], isPkg = /\.(sty|cls)$/.test(f), base = f.replace(/\.(sty|cls)$/, '');
    if (isPkg) {
      const near = nearest(base, ['amsmath', 'amssymb', 'amsthm', 'mathtools', 'graphicx', 'booktabs', 'geometry', 'hyperref', 'cleveref', 'natbib', 'biblatex', 'xcolor', 'tikz', 'pgfplots', 'siunitx', 'setspace', 'caption', 'subcaption', 'float', 'multirow', 'threeparttable', 'longtable', 'enumitem', 'fancyhdr', 'titlesec', 'appendix', 'lmodern', 'fontenc', 'inputenc', 'babel', 'csquotes', 'microtype', 'rotating', 'pdflscape', 'placeins', 'authblk', 'url', 'todonotes', 'listings', 'tabularx', 'array', 'bm', 'dsfont', 'mathrsfs', 'article', 'report', 'book', 'beamer', 'memoir', 'amsart']);
      return { title: `The package ${base} cannot be found`, why: near ? `It is probably a typo for ${near}.` : 'It is not in TeX Live, or the name is misspelt. If it is your own .sty file, upload it to the project.', fixes: near ? [{ label: `Change ${base} to ${near}`, edit: { file, line, find: new RegExp(`\\b${reEsc(base)}\\b`), replace: near } }] : [] };
    }
    const stem = f.replace(/^.*\//, '').replace(/\.\w+$/, ''), cands = env.files.filter(x => !/\.(tex|bib|sty|cls|bst)$/i.test(x) || /\.tex$/i.test(f)), near = nearest(stem, cands.map(x => x.replace(/^.*\//, '').replace(/\.\w+$/, '')), 3);
    const match = near ? cands.find(x => x.replace(/^.*\//, '').replace(/\.\w+$/, '') === near) : null;
    return { title: `The file ${f} is not in the project`, why: match ? `There is a file with a similar name: ${match}. Names are case-sensitive.` : 'Upload it, or check the name and folder (paths are relative to the main file, and case-sensitive).', fixes: match ? [{ label: `Use ${match}`, edit: { file, line, find: f.replace(/\.\w+$/, '') + (/\.\w+$/.test(src.match(new RegExp(reEsc(f.replace(/\.\w+$/, '')) + '(\\.\\w+)?'))?.[0] || '') ? f.slice(f.replace(/\.\w+$/, '').length) : ''), replace: match.replace(/\.(tex)$/i, '') } }] : [] };
  }
  if (/^Unknown graphics extension/.test(msg)) return { title: 'This image format cannot be included', why: 'pdfLaTeX includes .pdf, .png and .jpg images. Convert .eps, .svg, .tif or .gif files first.', fixes: [] };
  if (/^Missing \\begin\{document\}/.test(msg)) return { title: 'Text before \\begin{document}', why: 'The preamble may only hold settings. Something there prints text: a stray character, a misspelt command, or a missing \\begin{document}.', fixes: [{ label: 'Look at this line', goto: { file, line } }] };
  if ((m = /^Can be used only in preamble/.exec(msg))) {
    const cmd = (/\\(usepackage|documentclass|RequirePackage)\b[^\n]*/.exec(src) || [])[0];
    return { title: 'This belongs in the preamble', why: '\\usepackage and similar settings must come before \\begin{document}.', fixes: cmd ? [{ label: 'Move it into the preamble', edit: { file, line, find: cmd, replace: '', move: { file: env.main, preamble: cmd.trim() } } }] : [] };
  }
  if ((m = /^Option clash for package (\S+)/.exec(msg))) return { title: `${m[1]} is loaded twice with different options`, why: `Load ${m[1]} once, with all the options together. A class or another package may already load it; then use \\PassOptionsToPackage{…}{${m[1]}} before \\documentclass.`, fixes: [] };
  if ((m = /^Command (\\\S+) already defined/.exec(msg))) return { title: `${m[1]} already exists`, why: '\\newcommand cannot replace an existing command. Use \\renewcommand to change it, or pick another name.', fixes: /\\newcommand/.test(src) ? [{ label: 'Use \\renewcommand instead', edit: { file, line, find: '\\newcommand', replace: '\\renewcommand' } }] : [] };
  if (/^Paragraph ended before .* was complete|^Runaway argument|^File ended while scanning/.test(msg)) return { title: 'An argument is not closed', why: 'A { … } argument runs into a blank line or the end of the file. A closing } is missing, usually just before this line.', fixes: braceFix(src, file, line) };
  if (/^Illegal parameter number in definition/.test(msg)) return { title: 'A # in the wrong place', why: '# is only for arguments in \\newcommand definitions (#1, #2…). In text, write \\#.', fixes: /(?<!\\)#/.test(src) && !/newcommand|def\\/.test(src) ? [{ label: 'Write \\# instead', edit: { file, line, find: /(?<!\\)#/g, replace: '\\#' } }] : [] };
  if (/^You can't use .* in (vertical|horizontal|math) mode|^Bad space factor|^Illegal unit of measure/.test(msg)) {
    if (/Illegal unit/.test(msg)) return { title: 'A length without a unit', why: 'Lengths need a unit: 1em, 2pt, 0.5cm, 0.8\\linewidth.', fixes: [] };
    return { title: 'A command used where it is not allowed', why: (/\\\\ /.test(msg) || /\\par/.test(msg) ? 'A line break or new paragraph is in a place that cannot hold one.' : 'This command only works in text, in maths, or between paragraphs; it is in the wrong one of these.') + ' A common cause is a blank line inside an equation.', fixes: [] };
  }
  if (/^Missing number, treated as zero/.test(msg)) return { title: 'A number was expected', why: 'A length or count is empty or not a number. A frequent cause: \\\\ followed by a line that starts with [ — write \\\\{} [ or \\\\\\relax instead.', fixes: [] };
  if (/^Something's wrong--perhaps a missing \\item/.test(msg)) return { title: 'A list without \\item', why: 'Text inside itemize, enumerate or description must start with \\item. This also happens with \\\\ at the start of a paragraph.', fixes: /\\begin\{(itemize|enumerate|description)\}/.test(src) ? [{ label: 'Add an \\item after this line', edit: { file, line, insertAfter: '  \\item ' } }] : [] };
  if (/^Lonely \\item--perhaps a missing list environment/.test(msg)) return { title: '\\item outside a list', why: '\\item only works inside itemize, enumerate or description.', fixes: [] };
  if (/^Not in outer par mode/.test(msg)) return { title: 'A float inside a box or another float', why: 'figure and table cannot go inside minipage, a table cell, a footnote or another float. Use \\captionof{figure}{…} from the caption package inside the box instead.', fixes: [] };
  if (/^Too many unprocessed floats/.test(msg)) return { title: 'Too many figures and tables waiting', why: 'LaTeX could not place them all. Add \\clearpage after a few, use [htbp] placement, or load placeins and use \\FloatBarrier.', fixes: [] };
  if (/^\\verb illegal in command argument|^\\verb ended by end of line/.test(msg)) return { title: '\\verb cannot go here', why: '\\verb does not work inside the argument of another command (such as \\footnote or \\section). Use \\texttt{…} there.', fixes: [] };
  if (/^Unicode character (.) \(U\+([0-9A-F]+)\)/.test(msg)) { const ch = /^Unicode character (.)/.exec(msg)[1]; return { title: `The character ${ch} cannot be typeset`, why: 'The font has no glyph for it. Use the LaTeX command for it (for example $\\alpha$, \\textendash), or compile with XeLaTeX or LuaLaTeX.', fixes: [] }; }
  if (/^TeX capacity exceeded/.test(msg)) return { title: 'LaTeX ran out of memory', why: 'Almost always an endless loop: a command that calls itself (\\renewcommand{\\x}{\\x…}), or an unclosed group. Look at definitions you changed last.', fixes: [] };
  if (/^Dimension too large|^Arithmetic overflow/.test(msg)) return { title: 'A number or size is too large', why: 'TeX lengths stop at about 5.7 metres. In pgfplots, very large or tiny data values cause this; rescale the data or use scaled ticks.', fixes: [] };
  if (/^Emergency stop|^==> Fatal error|^Fatal error occurred/.test(msg)) return { title: 'LaTeX stopped', why: 'This follows an earlier error; fix the first error in the list and this one goes away.', fixes: [] };
  if (/^No pages of output/.test(msg)) return { title: 'The document is empty', why: 'Nothing was written between \\begin{document} and \\end{document}, or an error stopped LaTeX before the first page.', fixes: [] };
  if (/^I was expecting a [`'],' or a [`']\}'|^I was expecting|^Illegal, another \\bib|^You're missing a field name|^Repeated entry/.test(msg)) return { title: 'A problem in the .bib file', why: /Repeated entry/.test(msg) ? 'Two entries use the same key; rename or delete one.' : 'An entry is malformed: often a missing comma between fields, an unclosed brace, or a key with a space in it.', fixes: [{ label: 'Go to the entry', goto: { file, line } }] };
  if (/^BibTeX failed|BibTeX did not produce/.test(msg)) return { title: 'The bibliography could not be built', why: 'BibTeX stopped on an error in a .bib file or a missing .bst style. The log shows the line.', fixes: [] };
  if (/^Bibliography not compatible with author-year citations/.test(msg)) return { title: 'natbib needs author–year data', why: 'The bibliography style gives numbers, but natbib expects author–year. Use a style such as plainnat, or load natbib with the numbers option.', fixes: loaded(all, 'natbib') ? [{ label: 'Load natbib with [numbers]', edit: { file: env.main, line: (all.split('\n').findIndex(l => /\\usepackage\s*(\[[^\]]*\])?\s*\{natbib\}/.test(l)) + 1) || null, find: /\\usepackage\s*(\[[^\]]*\])?\s*\{natbib\}/, replace: '\\usepackage[numbers]{natbib}' } }] : [] };
  // ---------- warnings
  if ((m = /Citation [`'](.+?)' (?:on page \d+ )?undefined/.exec(msg)) || (m = /database entry for "(.+?)"/.exec(msg))) {
    const key = m[1], keys = env.bibKeys(), near = nearest(key, keys, 3);
    return { title: `No reference with the key “${key}”`, why: keys.length ? (near ? `Your .bib has ${near}; the key may be misspelt.` : 'It is not in any .bib file in the project.') : 'The project has no .bib entries yet: add a .bib file and a \\bibliography{…} command.', fixes: near && line ? [{ label: `Change it to ${near}`, edit: { file, line, find: new RegExp(`(?<=[{,\\s])${reEsc(key)}(?=[},\\s])`), replace: near } }] : [] };
  }
  if ((m = /Reference [`'](.+?)' on page \d+ undefined/.exec(msg))) {
    const key = m[1], labels = env.labels(), near = nearest(key, labels, 3);
    return { title: `No \\label{${key}} to refer to`, why: near ? `There is a \\label{${near}}; the name may be misspelt.` : 'No \\label with this name exists in the project.', fixes: near && line ? [{ label: `Change it to ${near}`, edit: { file, line, find: `{${key}}`, replace: `{${near}}` } }] : [] };
  }
  if ((m = /Label [`'](.+?)' multiply defined/.exec(msg))) return { title: `\\label{${m[1]}} is used twice`, why: 'Each label must be unique, or references point to the wrong place. Rename one of them.', fixes: [] };
  if (/^Overfull \\hbox/.test(msg)) { const pt = (/\(([\d.]+)pt too wide\)/.exec(msg) || [])[1]; return { title: `A line sticks into the margin${pt ? ` by ${(+pt).toFixed(1)}pt` : ''}`, why: 'LaTeX could not break it: usually a long word, URL, inline equation or wide table. Rephrase slightly, use \\url{…} for links, or load microtype.', fixes: loaded(all, 'microtype') ? [] : [addPkg(env.main, 'microtype')] }; }
  if (/Float too large for page/.test(msg)) return { title: 'A figure or table is taller than the page', why: 'Reduce its height (for example width=0.8\\linewidth, or \\resizebox for a table) or split it.', fixes: [] };
  if (/Font shape .* undefined|Some font shapes were not available/.test(msg)) return { title: 'A font style was substituted', why: 'The font has no shape for this combination (for example bold small caps); a close one was used. Usually harmless; \\usepackage{lmodern} often removes it.', fixes: [] };
  if (/h' float specifier changed to `ht'|float specifier changed/.test(msg)) return { title: 'A figure could not go exactly “here”', why: '[h] is a request, not a command. Use [htbp] to let LaTeX place it near here, or [H] from the float package to force it.', fixes: [] };
  if (/Empty [`']thebibliography' environment/.test(msg)) return { title: 'The reference list is empty', why: 'Nothing is cited yet, or the bibliography has not been built. Cite something with \\cite{…}.', fixes: [] };
  if (/Marginpar on page \d+ moved/.test(msg)) return { title: 'A margin note was moved down', why: 'Two notes would overlap, so one was shifted. Harmless.', fixes: [] };
  return null;
}
// environments still open just before a line: [{ name, line }], innermost last
function openEnvs(text, line) {
  const lines = text.split('\n').slice(0, Math.max(0, (line || 1) - 1)), st = [];
  lines.forEach((l, i) => { for (const x of l.replace(/(^|[^\\])%.*$/, '$1').matchAll(/\\(begin|end)\{([^}]+)\}/g)) { if (x[1] === 'begin') st.push({ name: x[2], line: i + 1 }); else { const k = st.map(e => e.name).lastIndexOf(x[2]); if (k >= 0) st.length = k; } } });
  return st.filter(e => e.name !== 'document');
}
// show where braces stop balancing on a line
function braceFix(src, file, line) {
  if (!src) return [];
  let d = 0; for (let i = 0; i < src.length; i++) { const c = src[i]; if (c === '\\') { i++; continue; } if (c === '%') break; if (c === '{') d++; else if (c === '}') d--; }
  if (d > 0) return [{ label: `Add the missing } at the end of line ${line}`, edit: { file, line, find: /\s*$/, replace: '}'.repeat(d) } }];
  if (d < 0) return [{ label: `Line ${line} has ${-d} more } than {`, goto: { file, line } }];
  return [{ label: 'Check the lines just above for an unclosed {', goto: { file, line: Math.max(1, line - 1) } }];
}
