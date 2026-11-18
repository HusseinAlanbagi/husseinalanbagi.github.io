// A LaTeX tabular as rows and cells, and back: what the visual table editor works on.
// parseTable(spec, body) -> { cols, rows, trail, indent }   serializeTable(t) -> { spec, body }
// cols: [{ tok, align }]  where tok is the column's own spec text (l, c, r, p{3cm}, S …)
// rows: [{ pre, cells: [{ tex, span, malign }], after }]   pre = rules before the row (\toprule, \hline …), after = [2pt] after \\
// trail: rules after the last row (\bottomrule …). Pure functions, no DOM: tested in tools/test.mjs.

const RULE = /^\s*(\\(?:toprule|midrule|bottomrule|hline|specialrule\s*\{[^}]*\}\s*\{[^}]*\}\s*\{[^}]*\}|cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}|cline\s*\{[^}]*\}|addlinespace\s*(?:\[[^\]]*\])?|rowcolor\s*(?:\[[^\]]*\])?\s*\{[^}]*\}))\s*/;

function closeBrace(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return k; } return -1; }

// the column tokens of a spec: l c r X S D p{…} m{…} b{…}, with | @{…} >{…} <{…} kept as separators
export function specTokens(spec) {
  let s = spec;
  for (let guard = 0; guard < 20 && /\*\{\d+\}\{/.test(s); guard++) s = s.replace(/\*\{(\d+)\}\{([^{}]*)\}/, (m, n, x) => x.repeat(+n));
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('@!><'.includes(c) && s[i + 1] === '{') { const e = closeBrace(s, i + 1); out.push({ sep: true, text: s.slice(i, e + 1) }); i = e + 1; continue; }
    if (c === '|') { out.push({ sep: true, text: '|' }); i++; continue; }
    if ('pmbwd'.includes(c) && s[i + 1] === '{') { let e = closeBrace(s, i + 1); if (c === 'w' && s[e + 1] === '{') e = closeBrace(s, e + 1); out.push({ col: true, text: s.slice(i, e + 1) }); i = e + 1; continue; }
    if (/[A-Za-z]/.test(c)) { let e = i + 1; if ((c === 'S' || c === 'D') && s[e] === '[') e = s.indexOf(']', e) + 1; if (c === 'D' && s[e] === '{') { for (let k = 0; k < 3 && s[e] === '{'; k++) e = closeBrace(s, e) + 1; } out.push({ col: true, text: s.slice(i, e) }); i = e; continue; }
    out.push({ sep: true, text: c }); i++;
  }
  return out;
}
const alignOf = (tok) => /^[rSD]/.test(tok) ? 'r' : /^c/.test(tok) ? 'c' : /^[pmbX]/.test(tok) ? 'j' : 'l';

// split on a top-level separator (\\ for rows, & for cells), ignoring braces and \&
function splitTop(s, sep) {
  const out = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { if (sep === '\\\\' && s[i + 1] === '\\' && d === 0) { out.push(s.slice(last, i)); i++; last = i + 1; continue; } i++; continue; }
    if (c === '{') d++; else if (c === '}') d--;
    else if (sep === '&' && c === '&' && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last)); return out;
}

export function parseTable(spec, body) {
  const toks = specTokens(spec);
  const cols = []; let sepBefore = '';
  for (const t of toks) { if (t.sep) sepBefore += t.text; else { cols.push({ tok: t.text, align: alignOf(t.text), sepBefore }); sepBefore = ''; } }
  const sepAfter = sepBefore;
  const indent = (/\n([ \t]+)\S/.exec(body) || [, '  '])[1];
  const endIndent = (/\n([ \t]*)$/.exec(body) || [, ''])[1];
  const chunks = splitTop(body.replace(/(^|[^\\])%[^\n]*/g, '$1'), '\\\\');
  const rows = []; let trail = '';
  chunks.forEach((chunk, k) => {
    let raw = chunk, after = '';
    if (k > 0) { const m = /^\s*(\[[^\]]*\])/.exec(raw); if (m) { after = m[1]; raw = raw.slice(m[0].length); } if (rows.length) rows[rows.length - 1].after = after; }
    let pre = [];
    for (let m; (m = RULE.exec(raw)); ) { pre.push(m[1].trim()); raw = raw.slice(m[0].length); }
    if (!raw.trim()) { if (k === chunks.length - 1) trail = pre.join(' '); else if (pre.length) { if (rows.length) rows[rows.length - 1].postRules = (rows[rows.length - 1].postRules ? rows[rows.length - 1].postRules + ' ' : '') + pre.join(' '); } return; }
    const cells = splitTop(raw, '&').map(c => {
      const mc = /^\s*\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/.exec(c);
      return mc ? { tex: mc[3].trim(), span: +mc[1], malign: mc[2] } : { tex: c.trim(), span: 1 };
    });
    rows.push({ pre: pre.join(' '), cells, after: '' });
  });
  // rules written after a row's \\ belong before the next row
  for (let i = 0; i < rows.length; i++) if (rows[i].postRules) { if (rows[i + 1]) rows[i + 1].pre = (rows[i].postRules + (rows[i + 1].pre ? ' ' + rows[i + 1].pre : '')).trim(); else trail = (rows[i].postRules + (trail ? ' ' + trail : '')).trim(); delete rows[i].postRules; }
  const t = { cols, sepAfter, rows, trail, indent, endIndent };
  normalize(t); return t;
}

// every row covers every column (pad with empty cells), spans never run past the last column
export function normalize(t) {
  const n = Math.max(t.cols.length, ...t.rows.map(r => r.cells.reduce((a, c) => a + c.span, 0)));
  while (t.cols.length < n) t.cols.push({ tok: 'c', align: 'c', sepBefore: '' });
  for (const r of t.rows) { let w = r.cells.reduce((a, c) => a + c.span, 0); while (w < n) { r.cells.push({ tex: '', span: 1 }); w++; } }
  return t;
}

const tokFor = (align, old) => {
  if (align === 'j') return /^[pmb]\{/.test(old) ? old : 'p{3cm}';
  if (/^[SD]/.test(old) && align === 'r') return old;
  return align;
};
export function serializeTable(t) {
  const spec = t.cols.map(c => (c.sepBefore || '') + c.tok).join('') + (t.sepAfter || '');
  const I = t.indent || '  ';
  const lines = [];
  for (const r of t.rows) {
    if (r.pre) lines.push(I + r.pre);
    lines.push(I + r.cells.map(c => c.span > 1 || c.malign ? `\\multicolumn{${c.span}}{${c.malign || 'c'}}{${c.tex}}` : c.tex).join(' & ') + ' \\\\' + (r.after || ''));
  }
  if (t.trail) lines.push(I + t.trail);
  return { spec, body: '\n' + lines.join('\n') + '\n' + (t.endIndent || '') };
}

// ---- operations (r, c are the row and the visual column)
export const cellAt = (row, c) => { let x = 0; for (let i = 0; i < row.cells.length; i++) { if (c < x + row.cells[i].span) return i; x += row.cells[i].span; } return row.cells.length - 1; };
export const colOf = (row, i) => row.cells.slice(0, i).reduce((a, c) => a + c.span, 0);
export function addRow(t, r, below = true) {
  const at = below ? r + 1 : r, row = { pre: '', cells: t.cols.map(() => ({ tex: '', span: 1 })), after: '' };
  // keep book-style rules where they were: a new first row takes the \toprule
  if (at === 0 && t.rows[0]?.pre) { row.pre = t.rows[0].pre; t.rows[0].pre = ''; }
  else if (/\\hline/.test(t.rows[Math.min(at, t.rows.length - 1)]?.pre || '') && isGrid(t)) row.pre = '\\hline';
  t.rows.splice(at, 0, row); return at;
}
export function deleteRow(t, r) {
  if (t.rows.length <= 1) return 0;
  const [gone] = t.rows.splice(r, 1);
  if (gone.pre && r < t.rows.length && !t.rows[r].pre) t.rows[r].pre = gone.pre;
  return Math.min(r, t.rows.length - 1);
}
export function addCol(t, c, right = true) {
  const at = right ? c + 1 : c, src = t.cols[Math.min(c, t.cols.length - 1)];
  t.cols.splice(at, 0, { tok: /^[pmb]\{/.test(src.tok) ? src.tok : 'c', align: /^[pmb]\{/.test(src.tok) ? 'j' : 'c', sepBefore: isGrid(t) ? '|' : '' });
  if (isGrid(t) && at === 0) t.cols[1].sepBefore = '|';
  for (const r of t.rows) {
    const i = cellAt(r, Math.min(at, t.cols.length - 2)), x = colOf(r, i), cell = r.cells[i];
    if (cell.span > 1 && at > x && at < x + cell.span) cell.span++;              // inside a merged cell: it grows
    else r.cells.splice(at <= x ? i : i + 1, 0, { tex: '', span: 1 });
  }
  return at;
}
export function deleteCol(t, c) {
  if (t.cols.length <= 1) return 0;
  const [gone] = t.cols.splice(c, 1);
  if (c === 0 && t.cols[0]) t.cols[0].sepBefore = gone.sepBefore || t.cols[0].sepBefore;
  for (const r of t.rows) { const i = cellAt(r, c), cell = r.cells[i]; if (cell.span > 1) { cell.span--; if (cell.span === 1) delete cell.malign; } else r.cells.splice(i, 1); }
  return Math.min(c, t.cols.length - 1);
}
export function setAlign(t, c, align) { t.cols[c].tok = tokFor(align, t.cols[c].tok); t.cols[c].align = align; }
// merge cells c0..c1 of row r into one \multicolumn; split it back into single cells
export function merge(t, r, c0, c1) {
  const row = t.rows[r], i0 = cellAt(row, c0), i1 = cellAt(row, c1);
  if (i1 <= i0) return;
  const parts = row.cells.slice(i0, i1 + 1), span = parts.reduce((a, c) => a + c.span, 0);
  row.cells.splice(i0, i1 - i0 + 1, { tex: parts.map(p => p.tex).filter(Boolean).join(' '), span, malign: 'c' });
}
export function split(t, r, c) {
  const row = t.rows[r], i = cellAt(row, c), cell = row.cells[i];
  if (cell.span <= 1 && !cell.malign) return;
  row.cells.splice(i, 1, { tex: cell.tex, span: 1 }, ...Array.from({ length: cell.span - 1 }, () => ({ tex: '', span: 1 })));
}
// the lines of the table: book style (\toprule, \midrule under the first row, \bottomrule), grid (\hline and |), none
export const isGrid = (t) => t.cols.some(c => /\|/.test(c.sepBefore)) || /\|/.test(t.sepAfter || '');
export function ruleStyle(t) {
  const all = t.rows.map(r => r.pre).join(' ') + ' ' + t.trail;
  if (/\\(top|mid|bottom)rule/.test(all)) return 'book';
  if (/\\hline/.test(all) || isGrid(t)) return 'grid';
  return 'none';
}
export function setRules(t, style) {
  const strip = (s) => (s || '').replace(/\\(?:toprule|midrule|bottomrule|hline)\b\s*/g, '').trim();
  t.rows.forEach(r => { r.pre = strip(r.pre); }); t.trail = strip(t.trail);
  t.cols.forEach(c => { c.sepBefore = (c.sepBefore || '').replace(/\|/g, ''); }); t.sepAfter = (t.sepAfter || '').replace(/\|/g, '');
  if (style === 'book' && t.rows.length) { t.rows[0].pre = ('\\toprule ' + t.rows[0].pre).trim(); if (t.rows[1]) t.rows[1].pre = ('\\midrule ' + t.rows[1].pre).trim(); t.trail = ('\\bottomrule ' + t.trail).trim(); }
  if (style === 'grid') { t.rows.forEach(r => { r.pre = ('\\hline ' + r.pre).trim(); }); t.trail = ('\\hline ' + t.trail).trim(); t.cols.forEach(c => { c.sepBefore = '|' + (c.sepBefore || ''); }); t.sepAfter = '|' + (t.sepAfter || ''); }
}
// a new table: rows × cols, header row in bold, book style
export function newTable(rows, cols) {
  const t = { cols: Array.from({ length: cols }, (_, i) => ({ tok: i ? 'c' : 'l', align: i ? 'c' : 'l', sepBefore: '' })), sepAfter: '', rows: [], trail: '', indent: '    ', endIndent: '  ' };
  for (let r = 0; r < rows; r++) t.rows.push({ pre: '', cells: Array.from({ length: cols }, () => ({ tex: '', span: 1 })), after: '' });
  setRules(t, 'book'); return t;
}
// wrap / unwrap a cell's text: bold, italic, maths
export function toggleWrap(tex, kind) {
  const t = tex.trim();
  const re = kind === 'bold' ? /^\\textbf\{([\s\S]*)\}$/ : kind === 'italic' ? /^\\(?:textit|emph)\{([\s\S]*)\}$/ : /^\$([\s\S]*)\$$/;
  const m = re.exec(t);
  if (m) return m[1];
  return kind === 'bold' ? `\\textbf{${t}}` : kind === 'italic' ? `\\textit{${t}}` : `$${t}$`;
}

// ---- a cell as editable parts, and back: text (bold / italic), maths, and anything else kept as it is
// cellParts('\\textbf{GDP} growth $g_t$ \\cite{x}') ->
//   [{t:'text', s:'GDP', b:true}, {t:'text', s:' growth '}, {t:'math', tex:'g_t'}, {t:'text', s:' '}, {t:'raw', tex:'\\cite{x}'}]
const SPECIAL = { '&': '\\&', '%': '\\%', '#': '\\#', '_': '\\_', '$': '\\$', '{': '\\{', '}': '\\}' };
export function escapeText(s) {
  return s.replace(/\\/g, '\u0000').replace(/[&%#_${}]/g, c => SPECIAL[c]).replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}')
    .replace(/\u0000/g, '\\textbackslash{}').replace(/ /g, '~');
}
function braceEnd(s, i) { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return k; } return -1; }
export function cellParts(tex, style = {}) {
  const out = []; let txt = '';
  const flush = () => { if (txt) { out.push({ t: 'text', s: txt, ...(style.b ? { b: true } : {}), ...(style.i ? { i: true } : {}) }); txt = ''; } };
  for (let i = 0; i < tex.length; ) {
    const c = tex[i];
    if (c === '$' && tex[i + 1] !== '$') { let j = i + 1; while (j < tex.length && !(tex[j] === '$' && tex[j - 1] !== '\\')) j++; if (j >= tex.length) return null; flush(); out.push({ t: 'math', tex: tex.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === '$') return null;                                                 // $$ … $$ in a cell: leave it to the LaTeX view
    if (c === '\\') {
      const two = tex.slice(i, i + 2);
      if (two === '\\(') { const j = tex.indexOf('\\)', i); if (j < 0) return null; flush(); out.push({ t: 'math', tex: tex.slice(i + 2, j) }); i = j + 2; continue; }
      if (/^\\[&%#_${}]$/.test(two)) { txt += two[1]; i += 2; continue; }
      const m = /^\\([A-Za-z]+)\s*/.exec(tex.slice(i));
      if (!m) { flush(); out.push({ t: 'raw', tex: two }); i += 2; continue; }   // \, \; \\ and the like
      const name = m[1];
      if (name === 'textbackslash' || name === 'textasciitilde' || name === 'textasciicircum') { let j = i + m[0].length; if (tex.slice(j, j + 2) === '{}') j += 2; txt += name === 'textbackslash' ? '\\' : name === 'textasciitilde' ? '~' : '^'; i = j; continue; }
      if ((name === 'textbf' || name === 'textit' || name === 'emph') && tex[i + m[0].length] === '{') {
        const a = i + m[0].length, e = braceEnd(tex, a); if (e < 0) return null;
        const inner = cellParts(tex.slice(a + 1, e), { ...style, ...(name === 'textbf' ? { b: true } : { i: true }) }); if (!inner) return null;
        flush(); out.push(...inner); i = e + 1; continue;
      }
      // any other command: kept whole (with its [..] and {..} arguments) as a locked chip
      let j = i + 1 + name.length;
      for (;;) { let k = j; while (tex[k] === ' ') k++; if (tex[k] === '{') { const e = braceEnd(tex, k); if (e < 0) return null; j = e + 1; } else if (tex[k] === '[') { const e = tex.indexOf(']', k); if (e < 0) return null; j = e + 1; } else break; }
      flush(); out.push({ t: 'raw', tex: tex.slice(i, j) }); i = j; continue;
    }
    if (c === '~') { txt += ' '; i++; continue; }
    if (c === '{' || c === '}') return null;                                       // loose braces: the LaTeX view is safer
    txt += c; i++;
  }
  flush(); return out;
}
export function partsTex(parts) {
  // merge neighbouring text of the same style, then wrap bold and italic runs
  const runs = [];
  for (const p of parts) { const last = runs[runs.length - 1]; if (p.t === 'text' && last?.t === 'text' && !!last.b === !!p.b && !!last.i === !!p.i) last.s += p.s; else runs.push({ ...p }); }
  return runs.map(p => {
    if (p.t === 'math') return '$' + p.tex + '$';
    if (p.t === 'raw') return p.tex;
    let s = escapeText(p.s); if (!s.trim()) return s;
    const lead = /^\s*/.exec(s)[0], tail = /\s*$/.exec(s)[0]; s = s.trim();
    if (p.i) s = `\\textit{${s}}`; if (p.b) s = `\\textbf{${s}}`;
    return lead + s + tail;
  }).join('');
}
// the cell can be edited visually without changing what it means
export const visualOk = (tex) => { const p = cellParts(tex); return !!p && partsTex(p).replace(/\s+/g, ' ').trim() === tex.replace(/\s+/g, ' ').trim(); };
