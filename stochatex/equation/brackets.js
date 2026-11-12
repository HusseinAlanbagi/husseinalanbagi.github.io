// Shared by the equation editor and the visual view: auto-sized brackets and flipping fractions.
// Plain script (no modules), so both the stand-alone page and the app can load it.
(function () {
  const glue = (rep, src, after) => (/\\[a-zA-Z]+$/.test(rep) && /[a-zA-Z]/.test(src[after] || '')) ? rep + ' ' : rep;
  const BIG = /\\(frac|dfrac|cfrac|sum|prod|coprod|int|iint|iiint|oint|bigcup|bigcap|bigoplus|bigotimes|binom|dbinom|begin|over|matrix|pmatrix|bmatrix|displaystyle|overbrace|underbrace|overset|underset|stackrel|lim|limsup|liminf|max|min|sup|inf)(?![a-zA-Z])/;
  const DOPEN = { '(': '(', '[': '[', '\\{': '\\{', '\\lbrace': '\\{', '\\lbrack': '[', '\\langle': '\\langle', '\\lvert': '|', '\\lVert': '\\|' };
  const DCLOSE = { ')': ')', ']': ']', '\\}': '\\}', '\\rbrace': '\\}', '\\rbrack': ']', '\\rangle': '\\rangle', '\\rvert': '|', '\\rVert': '\\|' };
  function autoSizeBrackets(src) {
    // tokens: delimiters (plain or \left/\right), braces; pair within the same {…} group
    const toks = [], re = /\\(left|right)\s*(\\[{}|]|\\[a-zA-Z]+|[()[\]|.])|\\(?:big|Big|bigg|Bigg)[lrm]?\s*(?:\\[{}|]|\\[a-zA-Z]+|[()[\]|.])|\\(sqrt|\\)\s*\[|\\[a-zA-Z]+|\\[{}|]|\\.|[{}()[\]|]/g;
    let m;
    while ((m = re.exec(src))) {
      const t = m[0];
      if (m[1]) toks.push({ a: m.index, b: m.index + t.length, kind: m[1], d: m[2] });
      else if (/^\\(?:big|Big|bigg|Bigg)/.test(t) || m[3]) { if (m[3]) skipOpt(m.index + t.length); }
      else if (t === '{' || t === '}') toks.push({ a: m.index, b: m.index + 1, kind: t });
      else if (DOPEN[t] || DCLOSE[t] || t === '|' || t === '\\|') toks.push({ a: m.index, b: m.index + t.length, kind: 'plain', d: t });
    }
    function skipOpt(from) { // \sqrt[3] or \\[2pt]: jump past the optional argument
      let depth = 1, i = from;
      for (; i < src.length && depth; i++) { if (src[i] === '[') depth++; else if (src[i] === ']') depth--; }
      re.lastIndex = i;
    }
    const pairs = [], stack = [];
    for (const k of toks) {
      if (k.kind === '{') { stack.push(k); continue; }
      if (k.kind === '}') { while (stack.length && stack[stack.length - 1].kind !== '{') stack.pop(); stack.pop(); continue; }
      const bar = k.d === '|' || k.d === '\\|';
      const isOpen = k.kind === 'left' || (k.kind === 'plain' && (DOPEN[k.d] || (bar && !(stack.length && stack[stack.length - 1].d === k.d && stack[stack.length - 1].kind === 'plain'))));
      if (isOpen) { stack.push(k); continue; }
      // a closer: find its opener inside the current group (unmatched bars in between are left alone)
      let j = stack.length - 1;
      while (j >= 0 && stack[j].kind !== '{' && !(k.kind === 'right' ? stack[j].kind === 'left' : stack[j].kind === 'plain' && (bar ? stack[j].d === k.d : !/\|/.test(stack[j].d)))) j--;
      if (j < 0 || stack[j].kind === '{') continue;
      pairs.push([stack[j], k]); stack.length = j;
    }
    const edits = [];
    for (const [o, c] of pairs) {
      const inner = src.slice(o.b, c.a);
      if (o.kind === 'plain') {
        if (!BIG.test(inner)) continue;
        const od = DOPEN[o.d] || (o.d === '|' ? '|' : o.d), cd = DCLOSE[c.d] || (c.d === '|' ? '|' : c.d);
        edits.push([o.a, o.b, '\\left' + od], [c.a, c.b, '\\right' + cd]);
      } else {
        if (o.d === '.' || c.d === '.' || BIG.test(inner) || /\\middle/.test(inner)) continue;
        const od = o.d === '\\{' ? '\\{' : o.d, cd = c.d;
        edits.push([o.a, o.b, glue(od, src, o.b)], [c.a, c.b, glue(cd, src, c.b)]);
      }
    }
    edits.sort((x, y) => y[0] - x[0]);
    let out = src;
    for (const [a, b, r] of edits) out = out.slice(0, a) + r + out.slice(b);
    return out;
  }
  function fracAt(src, i) { // the fraction starting at i -> {end, cmd, n:[a,b], d:[a,b]}
    const m = src.slice(i).match(/^\\([dtc]?frac)\s*/); if (!m) return null;
    const arg = (p) => {
      while (src[p] === ' ') p++;
      if (src[p] === '{') { let d = 0, q = p; for (; q < src.length; q++) { if (src[q] === '\\') { q++; continue; } if (src[q] === '{') d++; else if (src[q] === '}' && --d === 0) break; } return q < src.length ? [p, q + 1] : null; }
      const t = src.slice(p).match(/^(\\[a-zA-Z]+|\\.|[^\s{}])/); return t ? [p, p + t[0].length] : null;
    };
    const n = arg(i + m[0].length); if (!n) return null;
    const d = arg(n[1]); if (!d) return null;
    return { start: i, end: d[1], cmd: m[1], n, d };
  }
  function flipText(src, f) {
    const g = (r) => { const t = src.slice(r[0], r[1]); return t[0] === '{' ? t : '{' + t + '}'; };
    return '\\' + f.cmd + g(f.d) + g(f.n);
  }
  function flipInText(src, a, b) { // smallest fraction containing [a,b]; returns new text + span or null
    let best = null;
    for (const m of src.matchAll(/\\[dtc]?frac(?![a-zA-Z])/g)) {
      const f = fracAt(src, m.index);
      if (f && f.start <= a && f.end >= b && (!best || f.end - f.start < best.end - best.start)) best = f;
    }
    if (!best) return null;
    const t = flipText(src, best);
    return { text: src.slice(0, best.start) + t + src.slice(best.end), start: best.start, end: best.start + t.length };
  }
  const singleFrac = (s) => { s = s.trim(); const f = /^\\[dtc]?frac/.test(s) && fracAt(s, 0); return f && f.end === s.length ? f : null; };
  // flip the smallest fraction around the selection of a MathLive field; returns false if there is none
  function flipInField(mf) {
    const sel = (mf.selection && mf.selection.ranges && mf.selection.ranges[0]) || [mf.position, mf.position];
    const a = Math.min(...sel), b = Math.max(...sel), n = mf.lastOffset;
    if (!/frac/.test(mf.getValue('latex'))) return false;
    let hit = null;
    if (b > a && singleFrac(mf.getValue(a, b, 'latex'))) hit = [a, b];
    for (let len = Math.max(1, b - a); !hit && len <= n; len++)
      for (let k = Math.min(a, n - len); k >= 0 && k + len >= b; k--) { if (singleFrac(mf.getValue(k, k + len, 'latex'))) { hit = [k, k + len]; break; } }
    if (!hit) return false;
    const s = mf.getValue(hit[0], hit[1], 'latex').trim(), f = singleFrac(s);
    mf.focus();
    mf.selection = { ranges: [hit], direction: 'forward' };
    mf.insert(flipText(s, f), { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'item' });
    return true;
  }
  window.StochaBrackets = { autoSize: autoSizeBrackets, flipInText, flipInField, BIG };
})();
