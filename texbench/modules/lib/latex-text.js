// The prose of a LaTeX file, for proofreading. Returns a string of exactly the same length as the
// source in which everything that is not running text (commands, maths, comments, the preamble,
// tables, figures' options …) is blanked out, so positions in the result are positions in the source.
const DROP_ENVS = 'equation|align|gather|multline|eqnarray|flalign|alignat|displaymath|math|tikzpicture|verbatim|lstlisting|minted|tabular|tabularx|longtable|array|thebibliography|filecontents|axis|groupplot';
const DROP_ARG = /^(label|ref|eqref|cref|Cref|autoref|pageref|nameref|cite[a-zA-Z]*|parencite|textcite|autocite|footcite|nocite|input|include|includegraphics|bibliography|bibliographystyle|addbibresource|usepackage|documentclass|begin|end|vspace|hspace|setlength|setcounter|addtocounter|newcommand|renewcommand|providecommand|DeclareMathOperator|color|textcolor|definecolor|url|href|hyperref|pagestyle|thispagestyle|input|rule|includepdf|lstinputlisting|texttt|verb|path|si|SI|qty|num|unit|newtheorem|theoremstyle|geometry|hypersetup|graphicspath|captionsetup|multicolumn|multirow|cmidrule|resizebox|scalebox|fontsize|selectfont|pgfplotsset|usetikzlibrary|usepgfplotslibrary|ensuremath|mathrm|mathbf|mathit)$/;
const NOUN = /^(ref|eqref|cref|Cref|autoref|pageref|nameref|cite|citet|citealt|citeauthor|textcite|citeyear|url|href|si|SI|qty|num|texttt|verb|path)$/;   // stands for a word in the sentence

export function proseOf(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  const noun = (a, b) => { blank(a, b); if (b > a) out[a] = 'X'; };            // keeps the sentence grammatical
  const n = src.length;
  const close = (open, o = '{', c = '}') => { let d = 0; for (let i = open; i < n; i++) { const ch = src[i]; if (ch === '\\') { i++; continue; } if (ch === o) d++; else if (ch === c && --d === 0) return i; } return -1; };
  // comments
  for (const m of src.matchAll(/(^|[^\\])(%.*)$/gm)) blank(m.index + m[1].length, m.index + m[0].length);
  const s0 = out.join('');
  // preamble and everything after \end{document}
  const bd = s0.indexOf('\\begin{document}'); if (bd >= 0) blank(0, bd + 16);
  const ed = s0.indexOf('\\end{document}'); if (ed >= 0) blank(ed, n);
  // whole environments that hold no prose
  for (const m of s0.matchAll(new RegExp(`\\\\begin\\{(${DROP_ENVS})(\\*?)\\}[\\s\\S]*?\\\\end\\{\\1\\2\\}`, 'g'))) blank(m.index, m.index + m[0].length);
  for (const m of s0.matchAll(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g)) blank(m.index, m.index + m[0].length);
  for (const m of s0.matchAll(/\\\([\s\S]*?\\\)/g)) noun(m.index, m.index + m[0].length);
  // inline maths $…$
  let s = out.join('');
  for (let i = 0, open = -1; i < n; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '\n' && s[i + 1] === '\n') { open = -1; continue; }
    if (c !== '$') continue;
    if (open < 0) open = i; else { noun(open, i + 1); open = -1; }
  }
  // commands
  s = out.join('');
  for (const m of s.matchAll(/\\([A-Za-z@]+)\*?/g)) {
    const i = m.index, name = m[1]; if (out[i] !== '\\') continue;
    let j = i + m[0].length, argStart = -1, argEnd = -1;
    // optional arguments are never prose
    for (;;) { let k = j; while (s[k] === ' ') k++; if (s[k] !== '[') break; const e = close(k, '[', ']'); if (e < 0 || e - k > 300) break; j = e + 1; }
    if (DROP_ARG.test(name)) {
      let k = j, count = 0;
      while (s[k] === '{' && count < 3) { const e = close(k); if (e < 0) break; if (argStart < 0) argStart = k; argEnd = e + 1; k = e + 1; count++; if (!/^(newcommand|renewcommand|providecommand|setlength|setcounter|addtocounter|definecolor|textcolor|href|multicolumn|multirow|resizebox|scalebox|fontsize|newtheorem|DeclareMathOperator|SI|qty)$/.test(name)) break; }
      const to = argEnd > 0 ? argEnd : j;
      // \textcolor{red}{text}, \href{url}{text}, \multicolumn{2}{c}{text}: the last argument is text
      if (/^(textcolor|href|multicolumn|multirow|resizebox|scalebox)$/.test(name) && count > 1) { const last = s.lastIndexOf('{', to - 1); let d = 0, st = -1; for (let q = argStart; q < to; q++) { if (s[q] === '{') { if (d === 0) st = q; d++; } else if (s[q] === '}') d--; } blank(i, (st > 0 ? st : last) + 1); out[to - 1] = ' '; continue; }
      if (NOUN.test(name)) noun(i, to); else blank(i, to);
      continue;
    }
    blank(i, j);                           // the command itself; its {argument} stays as text
    if (name === 'item') continue;
  }
  s = out.join('');
  // leftovers: braces, ties, line breaks, quotes, escaped characters
  for (let i = 0; i < n; i++) {
    const c = s[i];
    if (c === '\\') { const nx = s[i + 1]; out[i] = ' '; if (nx === '\\' || nx === ',' || nx === ';' || nx === '!' || nx === '/' || nx === '-') out[i + 1] = ' '; i++; continue; }
    if (c === '{' || c === '}' || c === '~' || c === '&') out[i] = ' ';
    else if (c === '`' && s[i + 1] === '`') { out[i] = ' '; out[i + 1] = '"'; i++; }
    else if (c === "'" && s[i + 1] === "'") { out[i] = '"'; out[i + 1] = ' '; i++; }
    else if (c === '`') out[i] = "'";
    else if (c === '-' && s[i + 1] === '-' && s[i + 2] === '-') { out[i] = ' '; out[i + 1] = '—'; out[i + 2] = ' '; i += 2; }
    else if (c === '-' && s[i + 1] === '-') { out[i] = '–'; out[i + 1] = '⁠'; i++; }
  }
  return out.join('');
}
