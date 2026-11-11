// A small SyncTeX reader: maps between source lines and places on PDF pages.
// Coordinates in the file are scaled points measured from the top-left corner of the page.
const SP_PER_BP = 65781.76;
export function parseSyncTeX(text) {
  const inputs = new Map(), pages = [];
  let page = null;
  const hboxes = [];
  for (const line of text.split('\n')) {
    const c = line[0];
    if (c === 'I' && line.startsWith('Input:')) {
      const m = /^Input:(\d+):(.*)$/.exec(line);
      if (m) inputs.set(+m[1], m[2].replace(/^\.?\//, ''));
    } else if (c === '{') { page = { n: +line.slice(1), boxes: [], pts: [] }; pages.push(page); hboxes.length = 0; }
    else if (!page) continue;
    else if (c === '(' || c === '[') {
      const m = /^.(\d+),(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+),(-?\d+)/.exec(line);
      if (!m) continue;
      const b = { tag: +m[1], line: +m[2], x: +m[3] / SP_PER_BP, y: +m[4] / SP_PER_BP, w: +m[5] / SP_PER_BP, h: +m[6] / SP_PER_BP, d: +m[7] / SP_PER_BP, hbox: c === '(' };
      if (c === '(') { page.boxes.push(b); hboxes.push(b); }
    } else if (c === ')') hboxes.pop();
    else if (c === 'x' || c === 'k' || c === 'g' || c === '$' || c === 'h' || c === 'v') {
      const m = /^.(\d+),(\d+):(-?\d+),(-?\d+)/.exec(line);
      if (m) { const box = hboxes[hboxes.length - 1]; page.pts.push({ tag: +m[1], line: +m[2], x: +m[3] / SP_PER_BP, y: +m[4] / SP_PER_BP, h: box ? box.h : 8 }); }
    }
  }
  return { inputs, pages };
}
// Source -> PDF. Returns { page, x, y, w, h } in PDF points from the top-left, or null.
export function forward(data, file, line) {
  let tag = null;
  for (const [t, name] of data.inputs) if (name === file) { tag = t; break; }
  if (tag == null) return null;
  let best = null;
  for (const pg of data.pages) {
    for (const p of pg.pts) {
      if (p.tag !== tag || p.line < line) continue;
      const score = p.line - line;
      if (!best || score < best.score) best = { score, page: pg.n, x: p.x, y: p.y - p.h, w: 0, h: p.h + 2, line: p.line };
    }
    for (const b of pg.boxes) {
      if (b.tag !== tag || b.line < line) continue;
      const score = b.line - line + 0.5;
      if (!best || score < best.score) best = { score, page: pg.n, x: b.x, y: b.y - b.h, w: b.w, h: b.h + b.d, line: b.line };
    }
  }
  if (!best) return null;
  // highlight the whole text line that holds the point
  const pg = data.pages.find(p => p.n === best.page);
  const row = pg.boxes.filter(b => b.tag === tag && b.line === best.line && Math.abs(b.y - (best.y + best.h)) < 14).sort((a, b) => b.w - a.w)[0];
  if (row) return { page: best.page, x: row.x, y: row.y - row.h, w: row.w, h: row.h + row.d };
  return best;
}
// PDF -> source. x, y in PDF points from the top-left of the page. Returns { file, line } or null.
export function inverse(data, pageNo, x, y) {
  const pg = data.pages.find(p => p.n === pageNo);
  if (!pg) return null;
  let best = null;
  for (const p of pg.pts) {
    const name = data.inputs.get(p.tag);
    if (!name || name.startsWith('texlive/')) continue;
    const dy = y < p.y - p.h ? p.y - p.h - y : y > p.y ? y - p.y : 0;
    const dist = dy * 4 + Math.abs(x - p.x);
    if (!best || dist < best.dist) best = { dist, file: name, line: p.line };
  }
  for (const b of pg.boxes) {
    const name = data.inputs.get(b.tag);
    if (!name || name.startsWith('texlive/') || b.w <= 0) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y - b.h && y <= b.y + b.d) {
      const dist = b.w / 1000 + 20;        // a containing box beats a far-away point, loses to a near one
      if (!best || dist < best.dist) best = { dist, file: name, line: b.line };
    }
  }
  return best && { file: best.file, line: best.line };
}
