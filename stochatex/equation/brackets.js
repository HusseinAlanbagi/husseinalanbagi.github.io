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
  // ---- shared set-up for every MathLive field (in-place editor, strip, full editor) ----
  // * types an asterisk (** gives a multiplication dot); deleting a \left( … \right) keeps what is inside;
  // deleting a brace, box or accent first selects all of it; drag a selection to move it (Ctrl: copy; Alt across =: change sign).
  const STRUCT = /^\\(underbrace|overbrace|boxed|cancel|bcancel|xcancel|overset|underset|stackrel|hat|widehat|bar|overline|tilde|widetilde|vec|dot|ddot|check|breve|underline|overrightarrow|overleftarrow|Aboxed)(?![A-Za-z])/;
  function balancedGroup(s) { // s is exactly one \left … \right group
    const m = /^\\left\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.])([\s\S]*)\\right\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.])$/.exec(s.trim());
    if (!m) return null;
    let d = 0; for (const t of m[2].matchAll(/\\left(?![A-Za-z])|\\right(?![A-Za-z])/g)) { d += t[0] === '\\left' ? 1 : -1; if (d < 0) return null; }
    return d === 0 ? { open: m[1], inner: m[2], close: m[3] } : null;
  }
  function wholeStructure(s) { // one \cmd{…}… structure from start to end
    s = s.trim(); if (!STRUCT.test(s)) return false;
    let i = s.indexOf('{'); if (i < 0) return false;
    const groups = () => { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return j + 1; } return -1; };
    let e = groups(); if (e < 0) return false;
    // optional _{…} / ^{…} label, or a second argument (\overset{a}{b})
    let rest = s.slice(e).trim();
    while (rest) { const m = /^[_^]?\s*\{/.exec(rest); if (!m) return false; i = s.length - rest.length + m[0].length - 1; e = groups(); if (e < 0) return false; rest = s.slice(e).trim(); }
    return true;
  }
  function firstArg(s) { const i = s.indexOf('{'); let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return s.slice(i + 1, j); } return ''; }
  function findSpan(mf, a, b, test, maxLen = 200) { // smallest [k, e] around [a, b] whose latex passes test
    const n = mf.lastOffset;
    for (let len = Math.max(1, b - a); len <= Math.min(n, maxLen); len++)
      for (let k = Math.min(a, n - len); k >= 0 && k + len >= b; k--) { const v = mf.getValue(k, k + len, 'latex'); if (v && test(v)) return [k, k + len, v]; }
    return null;
  }
  function structureAt(mf) { const r = (mf.selection && mf.selection.ranges && mf.selection.ranges[0]) || [mf.position, mf.position]; return findSpan(mf, Math.min(...r), Math.max(...r), wholeStructure); }
  function removeStructure(mf, keepContent) {
    const hit = structureAt(mf); if (!hit) return false;
    mf.selection = { ranges: [[hit[0], hit[1]]] };
    mf.insert(keepContent ? firstArg(hit[2].trim().replace(/^\\(overset|underset|stackrel)\{[^{}]*\}/, '\\x')) : '', { format: 'latex', insertionMode: 'replaceSelection' });
    return true;
  }
  function setupField(mf, opts = {}) {
    try { const sc = { ...mf.inlineShortcuts }; delete sc['*']; sc['**'] = '\\cdot'; if (opts.star !== 'dot') mf.inlineShortcuts = sc; } catch (e) {}
    // deleting one bracket of a \left … \right removes the pair and keeps what is inside
    // (MathLive would leave an invisible \left. or select the whole group, so the next key deletes it all)
    const unwrapAround = (a, b) => {
      const hit = findSpan(mf, a, b, (v) => !!balancedGroup(v), 400); if (!hit) return false;
      mf.selection = { ranges: [[hit[0], hit[1]]] };
      mf.insert(balancedGroup(hit[2]).inner, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after' });
      return true;
    };
    // the \left … \right pair one of whose delimiters is at (or touches) index i of src, with both delimiters removed
    function unwrapAt(src, i) {
      const toks = [...src.matchAll(/\\(left|right)\s*(\\[{}|]|\\[A-Za-z]+|[()[\]|.<>/])/g)].map(m => ({ kind: m[1], from: m.index, to: m.index + m[0].length }));
      const st = [], pairs = [];
      for (const t of toks) { if (t.kind === 'left') st.push(t); else { const o = st.pop(); if (o) pairs.push([o, t]); } }
      const hit = pairs.find(([o, c]) => (i >= o.from && i <= o.to) || (i >= c.from && i <= c.to));
      if (!hit) return null;
      const [o, c] = hit;
      return src.slice(0, o.from) + src.slice(o.to, c.from) + src.slice(c.to);
    }
    const dots = (t) => (t.match(/\\(left|right)\s*\./g) || []).length;
    let pending = null;
    mf.addEventListener('keydown', (e) => {
      // (MathLive also sends key events of its own: only real Backspace/Delete presses count)
      if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (pending && pending.at === e.timeStamp) return;
      const r = mf.selection?.ranges?.[0] || [mf.position, mf.position];
      if (r[0] !== r[1]) { pending = null; return; }
      if (pending && performance.now() - pending.t < 50) return; // the same key press seen twice
      pending = { before: mf.getValue('latex'), pos: mf.position, key: e.key, t: performance.now() };
      const p0 = pending;
      setTimeout(() => { // MathLive selected the whole group instead of deleting: unwrap it
        if (pending !== p0) return;
        const s2 = mf.selection?.ranges?.[0]; if (!s2 || s2[0] === s2[1] || mf.getValue('latex') !== p0.before) return;
        pending = null;
        const v = mf.getValue(Math.min(...s2), Math.max(...s2), 'latex'), g = balancedGroup(v);
        if (g) mf.insert(g.inner, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after' });
      }, 60);
    }, true);
    mf.addEventListener('input', () => {
      const p = pending; pending = null; if (!p) return;
      const after = mf.getValue('latex');
      if (dots(after) <= dots(p.before)) return;          // not a bracket turned invisible
      // where did a delimiter turn into "."? remove that \left … \right pair (both delimiters) from the original
      let i = 0; while (i < after.length && p.before[i] === after[i]) i++;
      const next = unwrapAt(p.before, i); if (next == null) return;
      mf.executeCommand('undo');
      if (mf.getValue('latex') !== p.before) return;
      mf.executeCommand('selectAll');
      mf.insert(next, { format: 'latex', insertionMode: 'replaceSelection' });
      try { mf.position = Math.max(0, Math.min(mf.lastOffset, p.pos - (p.key === 'Backspace' ? 2 : 1))); } catch (e) {}
    });
    // drag a selection to move it
    enableDrag(mf, opts);
  }
  function enableDrag(mf, opts) {
    let drag = null;
    const line = document.createElement('div');
    line.style.cssText = 'position:fixed;width:2px;background:var(--accent,#0e6168);pointer-events:none;z-index:2000;display:none;border-radius:1px';
    document.body.append(line);
    const sel = () => { const r = mf.selection?.ranges?.[0]; return r && r[0] !== r[1] ? [Math.min(...r), Math.max(...r)] : null; };
    const pointAt = (k) => { try { const info = mf.getElementInfo?.(k); return info && info.bounds ? info.bounds : null; } catch (e) { return null; } };
    mf.addEventListener('pointerdown', (e) => {
      const s = sel(); if (!s || e.button !== 0) return;
      // on the selected part? (its atoms' boxes; a click elsewhere is MathLive's)
      let on = false;
      for (let k = s[0] + 1; k <= s[1] && !on; k++) { const bx = pointAt(k); if (bx && e.clientX >= bx.left - 2 && e.clientX <= bx.right + 2 && e.clientY >= bx.top - 4 && e.clientY <= bx.bottom + 4) on = true; }
      if (!on) return;
      e.preventDefault(); e.stopPropagation();
      drag = { s, x: e.clientX, y: e.clientY, moved: false, latex: mf.getValue(s[0], s[1], 'latex') };
      mf.setPointerCapture?.(e.pointerId);
    }, true);
    mf.addEventListener('pointermove', (e) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true; mf.style.cursor = e.ctrlKey || e.metaKey ? 'copy' : 'grabbing';
      const off = mf.getOffsetFromPoint(e.clientX, e.clientY); drag.off = off;
      const b = pointAt(Math.max(0, off - 1)) || pointAt(off), r = mf.getBoundingClientRect();
      if (b) { line.style.display = 'block'; line.style.left = (off > 0 ? b.right : b.left) + 'px'; line.style.top = Math.max(r.top + 2, b.top - 2) + 'px'; line.style.height = Math.max(16, b.height + 4) + 'px'; }
    }, true);
    const end = (e) => {
      if (!drag) return;
      const d = drag; drag = null; line.style.display = 'none'; mf.style.cursor = '';
      e.preventDefault(); e.stopPropagation();
      if (!d.moved || d.off == null || (d.off > d.s[0] && d.off < d.s[1])) { mf.position = mf.getOffsetFromPoint(e.clientX, e.clientY); return; }
      const copy = e.ctrlKey || e.metaKey;
      let latex = d.latex;
      // Alt: moving a term across "=" changes its sign
      if (e.altKey && !copy) {
        const eqBefore = (k) => (mf.getValue(0, k, 'latex').match(/=|\\le(?![a-z])|\\ge(?![a-z])/g) || []).length;
        if (eqBefore(d.s[0]) !== eqBefore(d.off)) {
          const t = latex.trim();
          latex = /^-/.test(t) ? '+' + t.slice(1) : /^\+/.test(t) ? '-' + t.slice(1) : '-' + t;
          opts.note?.('Moved across “=”: its sign changed');
        }
      }
      let to = d.off;
      if (!copy) { mf.selection = { ranges: [d.s] }; mf.insert('', { insertionMode: 'replaceSelection' }); if (to > d.s[1]) to -= d.s[1] - d.s[0]; }
      mf.position = Math.max(0, Math.min(to, mf.lastOffset));
      mf.insert(latex, { format: 'latex', selectionMode: 'item' });
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    };
    mf.addEventListener('pointerup', end, true);
    mf.addEventListener('pointercancel', () => { drag = null; line.style.display = 'none'; mf.style.cursor = ''; }, true);
    // drop symbols from the Symbols panel (they carry their LaTeX as text)
    mf.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('text/x-latex')) { e.preventDefault(); const off = mf.getOffsetFromPoint(e.clientX, e.clientY); const b = pointAt(Math.max(0, off - 1)); if (b) { line.style.display = 'block'; line.style.left = b.right + 'px'; line.style.top = b.top - 2 + 'px'; line.style.height = Math.max(16, b.height + 4) + 'px'; } } });
    mf.addEventListener('dragleave', () => { line.style.display = 'none'; });
    mf.addEventListener('drop', (e) => {
      const t = e.dataTransfer?.getData('text/x-latex'); line.style.display = 'none'; if (!t) return;
      e.preventDefault(); mf.focus(); mf.position = mf.getOffsetFromPoint(e.clientX, e.clientY);
      mf.insert(t, { format: 'latex', selectionMode: 'placeholder' }); mf.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  window.StochaBrackets = { autoSize: autoSizeBrackets, flipInText, flipInField, BIG, setupField, removeStructure, structureAt, wholeStructure, balancedGroup };
})();
