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
  // ---- stacked accents (\hat{\tilde{p}}): MathLive 0.111 draws the outer accent beside the letter, not above it.
  // While editing, \hat{\tilde{p}} is shown as \overset{\hat{}}{\tilde{p}}, which it draws correctly; when the field is
  // read, it is written back as \hat{\tilde{p}}, so the paper's source never changes.
  const ACC = 'hat|widehat|tilde|widetilde|bar|overline|check|breve|acute|grave|dot|ddot|vec|mathring';
  const groupEnd = (s, i) => { let d = 0; for (let k = i; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return k; } return -1; };
  function stackAccents(tex) {
    if (!tex || !/\\(hat|widehat|tilde|widetilde|bar|overline|check|breve|acute|grave|dot|ddot|vec|mathring)\s*\{\s*\\(hat|widehat|tilde|widetilde|bar|overline|check|breve|acute|grave|dot|ddot|vec|mathring)\b/.test(tex)) return tex;
    const re = new RegExp(`\\\\(${ACC})\\s*\\{(?=\\s*\\\\(?:${ACC})\\b)`, 'g');
    let out = tex;
    for (let guard = 0; guard < 20; guard++) {
      re.lastIndex = 0; const m = re.exec(out); if (!m) break;
      const open = m.index + m[0].length - 1, close = groupEnd(out, open); if (close < 0) break;
      out = out.slice(0, m.index) + `\\overset{\\${m[1]}{}}{` + out.slice(open + 1, close) + '}' + out.slice(close + 1);
    }
    return out;
  }
  function unstackAccents(tex) {
    if (!tex || tex.indexOf('\\overset') < 0) return tex;
    const re = new RegExp(`\\\\overset\\s*\\{\\s*\\\\(${ACC})\\s*\\{\\s*\\}\\s*\\}\\s*\\{`, 'g');
    let out = tex;
    for (let guard = 0; guard < 40; guard++) {
      re.lastIndex = 0; const m = re.exec(out); if (!m) break;
      const open = m.index + m[0].length - 1, close = groupEnd(out, open); if (close < 0) break;
      out = out.slice(0, m.index) + `\\${m[1]}{` + out.slice(open + 1, close) + '}' + out.slice(close + 1);
    }
    return out;
  }
  function setupField(mf, opts = {}) {
    mf.addEventListener('input', () => {
      try {
        const v = mf.getValue('latex'), st = stackAccents(v);
        if (st !== v) { const pos = mf.position, n = mf.lastOffset; mf.setValue(st, { silenceNotifications: true }); mf.position = Math.min(mf.lastOffset, pos + (mf.lastOffset - n)); }
      } catch (e) {}
    });
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
  // leftover signs after a move: "+ -" -> "-", "- -" -> "+", no "+" at the start of a side, none dangling before "=" or at the end
  function tidySigns(t) {
    let o = t, prev;
    do {
      prev = o;
      o = o.replace(/\+\s*-/g, '-').replace(/-\s*\+/g, '-').replace(/-\s*-(?![>-])/g, '+').replace(/\+\s*\+/g, '+')
        .replace(/(^|=|&|\\left\(|\\left\[|\(|\[|\\\\)\s*\+\s*/g, '$1')
        .replace(/\s*[+-]\s*(?==|&=|\\\\|\\right[)\]|]|$)/g, '')
        .replace(/=\s*(?=&|\\\\|$)/g, (m) => m);
    } while (o !== prev);
    return o.replace(/\s{2,}/g, ' ').trim();
  }
  function enableDrag(mf, opts) {
    let drag = null;
    const line = document.createElement('div');
    line.style.cssText = 'position:fixed;width:2px;background:var(--accent,#0e6168);pointer-events:none;z-index:2000;display:none;border-radius:1px;box-shadow:0 0 0 2px color-mix(in srgb, var(--accent,#0e6168) 25%, transparent)';
    // a ghost of what is dragged, next to the pointer, with what will happen (Move / Copy / Move, sign flips)
    const ghost = document.createElement('div');
    ghost.style.cssText = 'position:fixed;z-index:2001;pointer-events:none;display:none;padding:3px 8px;border-radius:8px;background:var(--card,#fff);border:1px solid var(--line,#ccd);box-shadow:0 6px 18px rgba(0,0,0,.18);font:12px system-ui,sans-serif;color:var(--ink,#222);max-width:320px;white-space:nowrap;overflow:hidden';
    document.body.append(line, ghost);
    const sel = () => { const r = mf.selection?.ranges?.[0]; return r && r[0] !== r[1] ? [Math.min(...r), Math.max(...r)] : null; };
    const pointAt = (k) => { try { const info = mf.getElementInfo?.(k); return info && info.bounds ? info.bounds : null; } catch (e) { return null; } };
    const overSel = (s, x, y) => { for (let k = s[0] + 1; k <= s[1]; k++) { const bx = pointAt(k); if (bx && x >= bx.left - 2 && x <= bx.right + 2 && y >= bx.top - 4 && y <= bx.bottom + 4) return true; } return false; };
    const eqCount = (k) => (mf.getValue(0, k, 'latex').match(/=|\\le(?![a-z])|\\ge(?![a-z])|\\leq|\\geq/g) || []).length;
    const stop = () => { drag = null; line.style.display = 'none'; ghost.style.display = 'none'; mf.style.cursor = ''; removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); stop(); opts.note?.('Drag cancelled'); } };
    const label = (e, d) => { const copy = e.ctrlKey || e.metaKey; const flip = !copy && e.altKey && d.off != null && eqCount(d.s[0]) !== eqCount(d.off); return copy ? 'Copy' : flip ? 'Move · sign flips' : 'Move'; };
    const drawGhost = (e, d) => {
      let pic = '';
      try { pic = window.MathLive?.convertLatexToMarkup ? window.MathLive.convertLatexToMarkup(d.latex) : ''; } catch (err) {}
      ghost.innerHTML = '';
      const t = document.createElement('span'); t.style.cssText = 'color:var(--muted,#667);margin-right:6px'; t.textContent = label(e, d); ghost.append(t);
      const m = document.createElement('span'); if (pic) m.innerHTML = pic; else m.textContent = d.latex.slice(0, 40); ghost.append(m);
      ghost.style.display = 'block'; ghost.style.left = (e.clientX + 14) + 'px'; ghost.style.top = (e.clientY + 16) + 'px';
    };
    mf.addEventListener('pointerdown', (e) => {
      const s = sel(); if (!s || e.button !== 0 || !overSel(s, e.clientX, e.clientY)) return;
      e.preventDefault(); e.stopPropagation();
      drag = { s, x: e.clientX, y: e.clientY, moved: false, latex: mf.getValue(s[0], s[1], 'latex') };
      mf.setPointerCapture?.(e.pointerId);
      addEventListener('keydown', onKey, true);
    }, true);
    mf.addEventListener('pointermove', (e) => {
      if (!drag) { const s = sel(); mf.style.cursor = s && overSel(s, e.clientX, e.clientY) ? 'grab' : ''; return; }
      e.preventDefault(); e.stopPropagation();
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      drag.moved = true; mf.style.cursor = e.ctrlKey || e.metaKey ? 'copy' : 'grabbing';
      const off = mf.getOffsetFromPoint(e.clientX, e.clientY); drag.off = off;
      const own = off >= drag.s[0] && off <= drag.s[1];
      const b = pointAt(Math.max(0, off - 1)) || pointAt(off), r = mf.getBoundingClientRect();
      if (b && !own) { line.style.display = 'block'; line.style.left = (off > 0 ? b.right : b.left) + 'px'; line.style.top = Math.max(r.top + 2, b.top - 2) + 'px'; line.style.height = Math.max(16, b.height + 4) + 'px'; }
      else line.style.display = 'none';
      drawGhost(e, drag);
    }, true);
    const end = (e) => {
      if (!drag) return;
      const d = drag; stop();
      e.preventDefault(); e.stopPropagation();
      if (!d.moved || d.off == null || (d.off >= d.s[0] && d.off <= d.s[1])) { if (!d.moved) mf.position = mf.getOffsetFromPoint(e.clientX, e.clientY); return; }
      const copy = e.ctrlKey || e.metaKey;
      let latex = d.latex;
      // Alt: moving a term across "=" changes its sign
      if (e.altKey && !copy && eqCount(d.s[0]) !== eqCount(d.off)) {
        const t = latex.trim();
        latex = /^-/.test(t) ? '+' + t.slice(1) : /^\+/.test(t) ? '-' + t.slice(1) : '-' + t;
        opts.note?.('Moved across “=”: its sign changed');
      }
      // one step, so one Ctrl+Z undoes it: rebuild the whole equation when the pieces add up to it (top level), else two steps
      const L = mf.lastOffset, all = mf.getValue('latex'), squash = (x) => x.replace(/\s+/g, '');
      const [a, b] = d.s, to = d.off;
      const parts = to < a ? [mf.getValue(0, to, 'latex'), mf.getValue(to, a, 'latex'), mf.getValue(b, L, 'latex')] : [mf.getValue(0, a, 'latex'), mf.getValue(b, to, 'latex'), mf.getValue(to, L, 'latex')];
      const whole = to < a ? parts[0] + parts[1] + d.latex + parts[2] : parts[0] + d.latex + parts[1] + parts[2];
      let before, next;
      if (squash(whole) === squash(all)) {
        if (copy) { before = mf.getValue(0, to, 'latex'); next = before + ' ' + latex + ' ' + mf.getValue(to, L, 'latex'); }
        else if (to < a) { before = parts[0]; next = parts[0] + ' ' + latex + ' ' + parts[1] + ' ' + parts[2]; }
        else { before = parts[0] + ' ' + parts[1]; next = parts[0] + ' ' + parts[1] + ' ' + latex + ' ' + parts[2]; }
        const tidy = tidySigns(next);
        mf.selection = { ranges: [[0, L]] };
        mf.insert(tidy, { format: 'latex', insertionMode: 'replaceSelection', selectionMode: 'after' });
        // select the moved piece: count where it starts in the new equation
        try {
          const probe = document.createElement('math-field'); probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.append(probe);
          const tb = tidySigns(before + ' ' + latex + ' \\placeholder{}').replace(/\\placeholder\{\}$/, '').trim(), start0 = tidySigns(before + ' \\placeholder{}').replace(/\\placeholder\{\}$/, '').trim();
          probe.value = start0; const s0 = probe.lastOffset; probe.value = tb; const s1 = probe.lastOffset; probe.remove();
          if (s1 > s0) mf.selection = { ranges: [[s0, s1]] };
        } catch (err) {}
      } else {
        let at = to;
        if (!copy) { mf.selection = { ranges: [d.s] }; mf.insert('', { insertionMode: 'replaceSelection' }); if (at > d.s[1]) at -= d.s[1] - d.s[0]; }
        mf.position = Math.max(0, Math.min(at, mf.lastOffset));
        mf.insert(latex, { format: 'latex', selectionMode: 'item' });
      }
      mf.dispatchEvent(new Event('input', { bubbles: true }));
    };
    mf.addEventListener('pointerup', end, true);
    mf.addEventListener('pointercancel', () => stop(), true);
    // drop symbols from the Symbols panel (they carry their LaTeX as text)
    mf.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('text/x-latex')) { e.preventDefault(); const off = mf.getOffsetFromPoint(e.clientX, e.clientY); const b = pointAt(Math.max(0, off - 1)); if (b) { line.style.display = 'block'; line.style.left = b.right + 'px'; line.style.top = b.top - 2 + 'px'; line.style.height = Math.max(16, b.height + 4) + 'px'; } } });
    mf.addEventListener('dragleave', () => { line.style.display = 'none'; });
    mf.addEventListener('drop', (e) => {
      const t = e.dataTransfer?.getData('text/x-latex'); line.style.display = 'none'; if (!t) return;
      e.preventDefault(); mf.focus(); mf.position = mf.getOffsetFromPoint(e.clientX, e.clientY);
      mf.insert(t, { format: 'latex', selectionMode: 'placeholder' }); mf.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  // ---- taking the numbers off an equation that has labels (unnumbered labels break: amsmath "Multiple \label"
  // in align*, and every \ref/\eqref to them shows ??). Shared by the in-place editor and the full editor.
  function splitTopRows(s) {
    const out = []; let d = 0, a = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { if (s[i + 1] === '\\' && d === 0) { out.push(s.slice(a, i)); a = i + 2; i++; continue; } i++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
    }
    out.push(s.slice(a)); return out;
  }
  const LAB = /\\label\s*\{([^}]*)\}/g, NONUM = /\\(?:nonumber|notag)(?![A-Za-z])/g, TAG = /\\tag\*?\s*\{/;
  const ROWENVS = /^(align|gather|flalign|alignat|eqnarray)$/;
  // src: the whole environment. Returns null when there is nothing to ask (no label, or not numbered).
  function unnumberPlan(src) {
    const m = /^(\s*)\\begin\{([A-Za-z]+)(\*?)\}(\{[^}]*\})?/.exec(src); if (!m || m[3]) return null;
    const env = m[2], endRe = new RegExp('\\\\end\\{' + env + '\\}(\\s*)$'), e = endRe.exec(src); if (!e) return null;
    const head = m[0], inner = src.slice(head.length, e.index), tail = src.slice(e.index);
    const labels = [...inner.matchAll(LAB)].map(x => x[1]); if (!labels.length) return null;
    const star = (t) => t.replace('\\begin{' + env + '}', '\\begin{' + env + '*}').replace(endRe, '\\end{' + env + '*}$1');
    const rows = splitTopRows(inner);
    const plan = {
      env, labels, rows: rows.length,
      // no numbers at all: the labels go (and \nonumber, which a starred environment does not need); \tag stays
      remove: () => star(head) + inner.replace(/[ \t]*\\label\s*\{[^}]*\}/g, '').replace(/[ \t]*\\(?:nonumber|notag)(?![A-Za-z])/g, '') + star(tail),
      // several rows: only the labelled (or tagged) rows keep a number
      keepLabelled: null,
    };
    if (ROWENVS.test(env) && rows.length > 1 && rows.some(r => !r.match(LAB) && !TAG.test(r) && r.trim())) {
      plan.keepLabelled = () => head + rows.map((r, i) => {
        const has = /\\label\s*\{/.test(r) || TAG.test(r);
        if (has) return r.replace(/[ \t]*\\(?:nonumber|notag)(?![A-Za-z])/g, '');
        if (!r.trim() || NONUM.test(r)) { NONUM.lastIndex = 0; return r; }
        return r.replace(/(\s*)$/, ' \\nonumber$1');
      }).join('\\\\') + tail;
    }
    return plan;
  }
  // how often each label is referred to (\ref, \eqref, \cref, \autoref, \pageref …) in the given texts
  function refCounts(labels, texts) {
    const n = {}; labels.forEach(l => { n[l] = 0; });
    for (const t of texts) for (const x of (t || '').matchAll(/\\(?:[a-zA-Z]*ref)\*?\s*\{([^}]*)\}/g)) for (const k of x[1].split(',')) { const kk = k.trim(); if (kk in n) n[kk]++; }
    return n;
  }
  window.StochaBrackets = { unnumberPlan, refCounts, stackAccents, unstackAccents, tidySigns, autoSize: autoSizeBrackets, flipInText, flipInField, BIG, setupField, removeStructure, structureAt, wholeStructure, balancedGroup };
})();
