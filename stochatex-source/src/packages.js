// Packages loaded more than once, and known clashes.
//   findPackages(text) -> [{ name, opts, start, end, line, list, names }]   (\usepackage in the preamble)
//   duplicates(text)   -> [{ name, uses: [...], merged, conflict, keep }]
//   tidy(text, only?)  -> { text, notes: [...] }   removes extra copies (keeps options, merges them when they fit)

const LAST = new Set(['hyperref', 'cleveref']);         // these stay where the last copy is (they should be loaded last)
const CLASHES = [['natbib', 'biblatex'], ['subfig', 'subcaption'], ['times', 'newtxtext'], ['mathptmx', 'newtxmath'], ['caption2', 'caption'], ['epsfig', 'graphicx']];
const EXCLUSIVE = [['numbers', 'authoryear'], ['round', 'square'], ['round', 'curly'], ['round', 'angle'], ['draft', 'final'], ['oneside', 'twoside']];

function preambleEnd(text) { const i = text.search(/\\begin\s*\{document\}/); return i < 0 ? text.length : i; }
const blankComments = (t) => t.replace(/(^|[^\\])%.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));

export function findPackages(text) {
  const end = preambleEnd(text), clean = blankComments(text.slice(0, end)), out = [];
  for (const m of clean.matchAll(/\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) {
    const names = m[2].split(',').map(s => s.trim()).filter(Boolean);
    out.push({ start: m.index, end: m.index + m[0].length, opts: (m[1] || '').split(',').map(s => s.trim()).filter(Boolean), names, list: names.length > 1, line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

const key = (o) => o.split('=')[0].trim();
function merge(optLists) {
  const all = [], seen = new Map();
  for (const list of optLists) for (const o of list) {
    const k = key(o);
    if (seen.has(k) && seen.get(k) !== o) return { conflict: `${seen.get(k)} and ${o}` };
    if (!seen.has(k)) { seen.set(k, o); all.push(o); }
  }
  for (const [a, b] of EXCLUSIVE) if (seen.has(a) && seen.has(b)) return { conflict: `${a} and ${b}` };
  return { opts: all };
}

export function duplicates(text) {
  const uses = new Map();
  for (const p of findPackages(text)) for (const n of p.names) { if (!uses.has(n)) uses.set(n, []); uses.get(n).push(p); }
  const out = [];
  for (const [name, list] of uses) {
    if (list.length < 2) continue;
    const m = merge(list.map(u => u.opts));
    const keep = LAST.has(name) ? list[list.length - 1] : list[0];
    out.push({ name, uses: list, merged: m.opts || null, conflict: m.conflict || null, keep });
  }
  return out;
}

export function clashes(text) {
  const have = new Map(); for (const p of findPackages(text)) for (const n of p.names) if (!have.has(n)) have.set(n, p.line);
  return CLASHES.filter(([a, b]) => have.has(a) && have.has(b)).map(([a, b]) => ({ a, b, lineA: have.get(a), lineB: have.get(b) }));
}

// remove the extra copies of `only` (or of every duplicate without a conflict)
export function tidy(text, only = null) {
  const notes = [], edits = [];
  for (const d of duplicates(text)) {
    if (only && d.name !== only) continue;
    if (d.conflict) { notes.push(`${d.name}: options ${d.conflict} disagree — choose one by hand`); continue; }
    const optsChanged = d.merged.join(',') !== d.keep.opts.join(',');
    for (const u of d.uses) {
      if (u === d.keep) {
        if (optsChanged) {
          if (u.list) { // split the package out of a list so it can carry the merged options
            edits.push({ from: u.start, to: u.end, insert: `\\usepackage${u.opts.length ? '[' + u.opts.join(',') + ']' : ''}{${u.names.filter(n => n !== d.name).join(',')}}\n\\usepackage[${d.merged.join(',')}]{${d.name}}`, u });
          } else edits.push({ from: u.start, to: u.end, insert: `\\usepackage[${d.merged.join(',')}]{${d.name}}`, u });
          notes.push(`${d.name}: options combined as [${d.merged.join(',')}]`);
        }
        continue;
      }
      if (u.list) edits.push({ from: u.start, to: u.end, insert: `\\usepackage${u.opts.length ? '[' + u.opts.join(',') + ']' : ''}{${u.names.filter(n => n !== d.name).join(',')}}`, u, drop: d.name });
      else {
        // the whole line, when it holds only this \usepackage (and maybe a comment)
        const ls = text.lastIndexOf('\n', u.start - 1) + 1, le = text.indexOf('\n', u.end), lineEnd = le < 0 ? text.length : le;
        const rest = (text.slice(ls, u.start) + text.slice(u.end, lineEnd)).replace(/%.*$/, '').trim();
        edits.push(rest ? { from: u.start, to: u.end, insert: '' } : { from: ls, to: Math.min(text.length, lineEnd + 1), insert: '' });
      }
    }
    notes.unshift(`${d.name}: kept the copy on line ${d.keep.line}, removed ${d.uses.length - 1} more`);
  }
  // several edits can touch one list (two names duplicated in it): apply each list once with all its drops
  const byStart = new Map();
  for (const e of edits) { const k = e.from; if (byStart.has(k) && e.u && e.drop) { const prev = byStart.get(k); const drops = (prev.drops || [prev.drop]).concat(e.drop); prev.drops = drops; prev.insert = `\\usepackage${e.u.opts.length ? '[' + e.u.opts.join(',') + ']' : ''}{${e.u.names.filter(n => !drops.includes(n)).join(',')}}`; } else byStart.set(k, e); }
  const list = [...byStart.values()].sort((a, b) => b.from - a.from);
  let out = text;
  for (const e of list) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  out = out.replace(/\\usepackage(\[[^\]]*\])?\{\s*\}\s*\n?/g, '');
  return { text: out, notes };
}
