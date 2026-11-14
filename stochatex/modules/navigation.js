// Where am I? For the source (and the visual view, the same editor) and the PDF preview:
//   - while scrolling, a small label beside the scroll bar: section, page, line ("3.2 Firms · p. 4 · line 210")
//   - section ticks along the scroll bar (hover for the name, click to go there)
//   - "Back to where you were": after a long scroll or a jump, a button takes you back to the place you left
//     (and then forth again). Alt+← (⌘[ on a Mac) does the same in the pane you used last.
// Pages in the source come from the last compile (SyncTeX).

const HEAD = /^[ \t]*\\(section|subsection|subsubsection)(\*?)\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/gm;
const plain = (t) => t.replace(/\\[a-zA-Z]+\*?\s*/g, '').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();

// headings of a .tex text: [{ line, level, num, title }]; numbers only when numbered=true (the main file)
export function headings(text, numbered = true) {
  const out = [], cnt = [0, 0, 0], lvl = { section: 0, subsection: 1, subsubsection: 2 };
  const clean = text.replace(/(^|[^\\])%.*$/gm, (m, a) => a + ' '.repeat(m.length - a.length));
  const body = clean.indexOf('\\begin{document}');
  const appendixAt = clean.search(/\\appendix\b/);
  for (const m of clean.matchAll(HEAD)) {
    if (body >= 0 && m.index < body) continue;
    const level = lvl[m[1]], star = !!m[2];
    let num = '';
    if (!star) {
      cnt[level]++; for (let k = level + 1; k < 3; k++) cnt[k] = 0;
      if (numbered) num = cnt.slice(0, level + 1).map((n, i) => (i === 0 && appendixAt >= 0 && m.index > appendixAt ? String.fromCharCode(64 + n) : n)).join('.');
    }
    out.push({ line: text.slice(0, m.index).split('\n').length, level, num, title: plain(text.slice(m.index, m.index + m[0].length).replace(/^[^{]*\{/, '').replace(/\}$/, '')) || m[3] });
  }
  return out;
}
// page starts from SyncTeX: [{ page, line }] (line = first line of this file on that page)
const pageFor = (starts, line) => { let pg = null; for (const s of starts) { if (s.line <= line) pg = s.page; } return pg || (starts.length ? Math.max(1, starts[0].page - 1) : null); };
const sectionAt = (heads, line) => { let h = null; for (const x of heads) { if (x.line <= line) h = x; else break; } return h; };
const label = (h) => h ? (h.num ? h.num + ' ' : '') + h.title : 'Start';

export default {
  id: 'navigation',
  name: 'Where am I',
  description: 'While you scroll the source or the PDF: a label with the section and page, section marks along the scroll bar, and a “Back to where you were” button after a long scroll or a jump (Alt+←).',
  category: 'Editing',
  defaultEnabled: true,
  activate(ctx) {
    const h = ctx.h, mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const backKey = mac ? '⌘[' : 'Alt+←';
    const css = h('style', {}, `
.nv-tip { position: fixed; z-index: 40; pointer-events: none; background: var(--ink); color: var(--paper); font: 500 12px var(--ui); padding: 3px 9px; border-radius: 6px; white-space: nowrap; opacity: 0; transition: opacity .25s; box-shadow: var(--shadow); max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
.nv-tip.on { opacity: .92; transition: opacity .08s; }
.nv-ticks { position: fixed; z-index: 30; width: 8px; pointer-events: none; }
.nv-tick { position: absolute; right: 0; height: 2px; background: var(--accent); opacity: .55; pointer-events: auto; cursor: pointer; border-radius: 1px; }
.nv-tick.l0 { width: 8px; } .nv-tick.l1 { width: 5px; } .nv-tick.l2 { width: 3px; opacity: .4; }
.nv-tick:hover { opacity: 1; height: 3px; }
.nv-back { position: fixed; z-index: 41; display: inline-flex; gap: 6px; align-items: center; font: 500 12px var(--ui); padding: 4px 10px 4px 8px; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--accent) 50%, var(--line-2)); background: var(--panel); color: var(--ink); box-shadow: var(--shadow); cursor: pointer; }
.nv-back:hover { border-color: var(--accent); }
.nv-back .x { margin-left: 2px; color: var(--muted); padding: 0 2px; }
@media (prefers-reduced-motion: reduce) { .nv-tip { transition: none; } }`);
    document.head.append(css);

    const panes = [];
    let lastPane = null;
    // one pane: a scroller with describe(top) -> text, ticks() -> [{ frac, level, text, go }]
    function pane(name, getScroller, describe, ticks, visible = () => true) {
      const tip = h('div', { class: 'nv-tip', 'aria-hidden': 'true' });
      const tickBox = h('div', { class: 'nv-ticks' });
      const back = h('button', { class: 'nv-back', hidden: true });
      document.body.append(tip, tickBox, back);
      const P = { name, rest: null, anchor: null, moving: false, idle: 0, tipT: 0, el: null };
      const rect = () => P.el.getBoundingClientRect();
      function place() {
        if (!P.el || !visible()) { tickBox.hidden = true; back.hidden = true; tip.classList.remove('on'); return; }
        const r = rect(); tickBox.hidden = !r.height;
        Object.assign(tickBox.style, { top: r.top + 'px', height: r.height + 'px', left: r.right - 9 + 'px' });
        Object.assign(back.style, { top: r.top + 8 + 'px', right: Math.max(8, innerWidth - r.right + 18) + 'px' });
      }
      function drawTicks() {
        if (!P.el) return;
        place();
        const r = rect(), list = ticks() || [];
        tickBox.replaceChildren(...list.map(t => { const d = h('div', { class: 'nv-tick l' + t.level, title: t.text }); d.style.top = Math.min(r.height - 3, Math.max(0, t.frac * r.height)) + 'px'; d.onclick = () => t.go(); return d; }));
      }
      function showTip() {
        const r = rect(), el = P.el, frac = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
        tip.textContent = describe(el.scrollTop);
        tip.style.top = Math.min(r.bottom - 26, Math.max(r.top + 4, r.top + frac * (r.height - 24))) + 'px';
        tip.style.right = innerWidth - r.right + 16 + 'px'; tip.style.left = 'auto';
        tip.classList.add('on'); clearTimeout(P.tipT); P.tipT = setTimeout(() => tip.classList.remove('on'), 900);
      }
      function showBack() {
        if (P.anchor == null) { back.hidden = true; return; }
        back.replaceChildren('↩ ', h('span', {}, 'Back to ' + describe(P.anchor)), h('span', { class: 'x', title: 'Dismiss', onClick: (e) => { e.stopPropagation(); P.anchor = null; showBack(); } }, '×'));
        back.title = `Return to where you were (${backKey}). Click again to come back here.`;
        place(); back.hidden = !visible();
      }
      P.goBack = () => {
        if (P.anchor == null || !P.el) return false;
        const here = P.el.scrollTop, to = P.anchor;
        P.jumping = true; P.el.scrollTo({ top: to }); P.rest = to; P.anchor = here; showBack();
        setTimeout(() => { P.jumping = false; }, 300);
        return true;
      };
      back.onclick = () => { P.goBack(); lastPane = P; };
      const onScroll = () => {
        lastPane = P;
        if (P.rest == null) P.rest = P.el.scrollTop;
        showTip();
        clearTimeout(P.idle);
        P.idle = setTimeout(() => {
          const now = P.el.scrollTop, far = P.el.clientHeight * 1.5;
          if (!P.jumping && Math.abs(now - P.rest) > far) { P.anchor = P.rest; showBack(); }
          else if (P.anchor != null && Math.abs(now - P.anchor) < P.el.clientHeight * 0.5) { P.anchor = null; showBack(); }
          P.rest = now;
        }, 700);
      };
      P.attach = () => {
        const el = getScroller(); if (el === P.el) return;
        if (P.el) P.el.removeEventListener('scroll', onScroll);
        P.el = el; P.rest = el ? el.scrollTop : null; P.anchor = null; showBack();
        if (el) el.addEventListener('scroll', onScroll, { passive: true });
        drawTicks();
      };
      P.refresh = () => { P.attach(); drawTicks(); if (P.anchor != null) showBack(); };
      P.forget = () => { P.anchor = null; showBack(); };
      P.dispose = () => { if (P.el) P.el.removeEventListener('scroll', onScroll); tip.remove(); tickBox.remove(); back.remove(); };
      panes.push(P);
      return P;
    }

    // ---- the source editor
    const view = () => ctx.editor.view;
    let heads = [], headsFor = '';
    const curHeads = () => {
      const t = ctx.editor.getText(), path = ctx.editor.path, main = ctx.project.mainFile;
      const key = path + ':' + t.length + ':' + (t.match(/\\(sub)*section/g) || []).length;
      if (key !== headsFor) { headsFor = key; heads = /\.tex$/i.test(path || '') ? headings(t, !main || path === main) : []; }
      return heads;
    };
    const pageOfLine = (file, line) => {
      const ps = ctx.compile.pageStarts(file); if (!ps || !ps.lines || !ps.lines.length) return null;
      return pageFor(ps.lines, line);
    };
    const ed = pane('editor', () => view().scrollDOM, (top) => {
      const v = view(), line = v.state.doc.lineAt(v.lineBlockAtHeight(Math.max(0, top) + 6).from).number;
      const sec = sectionAt(curHeads(), line), pg = pageOfLine(ctx.editor.path, line);
      return [label(sec), pg ? 'p. ' + pg : null, 'line ' + line].filter(Boolean).join(' · ');
    }, () => {
      const v = view(), H = Math.max(1, v.contentHeight);
      return curHeads().map(x => {
        const pos = v.state.doc.line(Math.min(x.line, v.state.doc.lines)).from;
        return { frac: v.lineBlockAt(pos).top / H, level: x.level, text: label(x), go: () => { v.dispatch({ selection: { anchor: pos }, effects: ctx.cm.EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) }); v.focus(); } };
      });
    });

    // ---- the PDF preview
    const pdfEl = () => document.getElementById('pdf');
    const pages = () => [...(pdfEl()?.querySelectorAll('.pdfpage') || [])];
    const pageAt = (top) => { let n = 1; const mid = top + (pdfEl()?.clientHeight || 0) / 3; for (const p of pages()) if (p.offsetTop <= mid) n = +p.dataset.page; return n; };
    // sections per page, from SyncTeX: the last heading that starts on or before each page
    function pdfSections() {
      const out = [], main = ctx.project.mainFile;
      for (const f of ctx.project.files().filter(f => /\.tex$/i.test(f))) {
        const ps = ctx.compile.pageStarts(f); if (!ps || !ps.lines || !ps.lines.length) continue;
        const text = ctx.project.read(f); if (text == null) continue;
        for (const x of headings(text, f === main)) {
          const pg = pageFor(ps.lines, x.line);
          if (pg) out.push({ ...x, page: pg, file: f });
        }
      }
      return out.sort((a, b) => a.page - b.page);
    }
    let pdfSecs = [];
    const pdf = pane('pdf', pdfEl, (top) => {
      const n = pageAt(top), total = pages().length;
      // the section running at the top of the page: the last one that started on an earlier page
      const sec = sectionAt(pdfSecs.map(s => ({ ...s, line: s.page + 1 })), n) || pdfSecs.find(s => s.page === n) || null;
      return [`p. ${n} of ${total}`, sec ? label(sec) : null].filter(Boolean).join(' · ');
    }, () => {
      const el = pdfEl(), ps = pages(); if (!el || !ps.length) return [];
      return pdfSecs.map(s => { const pg = ps[s.page - 1]; return pg ? { frac: pg.offsetTop / el.scrollHeight, level: s.level, text: `${label(s)} · p. ${s.page}`, go: () => el.scrollTo({ top: pg.offsetTop - 8 }) } : null; }).filter(Boolean);
    }, () => { const w = document.getElementById('pdfwrap'); return !!w && w.offsetParent !== null && !document.body.classList.contains('pdf-off'); });

    // keep everything in place
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => panes.forEach(p => p.refresh())); };
    ctx.editor.addExtension(ctx.cm.EditorView.updateListener.of((u) => { if (u.docChanged || u.geometryChanged || u.viewportChanged) later(); if (u.docChanged) ed.forget(); }));
    ctx.on('compile', () => { pdfSecs = pdfSections(); later(); });
    ctx.on('open', () => { ed.attach(); ed.forget(); later(); });
    ['files', 'project'].forEach(n => ctx.on(n, later));
    const ro = new ResizeObserver(later); ro.observe(document.body);
    addEventListener('resize', later);
    const onKey = (e) => {
      const hit = mac ? (e.metaKey && e.key === '[') : (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft');
      if (!hit) return;
      const p = lastPane || ed;
      if (p.goBack()) { e.preventDefault(); e.stopPropagation(); }
    };
    addEventListener('keydown', onKey, true);
    ctx.ui.addCommand({ id: 'nav.back', name: `Back to where you were (${backKey})`, run: () => (lastPane || ed).goBack() });
    setTimeout(() => { ed.attach(); pdf.attach(); pdfSecs = pdfSections(); later(); }, 0);
    ctx.onDispose(() => { panes.forEach(p => p.dispose()); css.remove(); ro.disconnect(); removeEventListener('resize', later); removeEventListener('keydown', onKey, true); });
  },
};
