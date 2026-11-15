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

import * as VP from './lib/viewplace.js';

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
.nv-back .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nv-back .x { margin-left: 2px; color: var(--muted); padding: 0 2px; }
@media (prefers-reduced-motion: reduce) { .nv-tip { transition: none; } }`);
    document.head.append(css);

    const panes = [];
    let lastPane = null;
    const pid = () => ctx.project.id || 'default';
    // one pane: a scroller and an adapter { capture(), restore(place), distance(place) -> px, describe(place), here() }
    // "work" is where you were working: where you last typed or clicked, or stayed for a few seconds.
    // After a long scroll or jump away from it, the Back button takes you there (and then forth again).
    function pane(name, getScroller, A, ticks, visible = () => true) {
      const tip = h('div', { class: 'nv-tip', 'aria-hidden': 'true' });
      const tickBox = h('div', { class: 'nv-ticks' });
      const back = h('button', { class: 'nv-back', hidden: true });
      document.body.append(tip, tickBox, back);
      const P = { name, el: null, work: null, target: null, label: '', history: [], idle: 0, rest: 0, tipT: 0, jumping: false };
      const shown = () => { if (!P.el || !visible()) return false; const r = P.el.getBoundingClientRect(); return r.width > 160 && r.height > 80 && P.el.offsetParent !== null; };
      function place() {
        const ok = shown();
        tickBox.hidden = !ok; if (!ok) { back.hidden = true; tip.classList.remove('on'); return; }
        const r = P.el.getBoundingClientRect();
        Object.assign(tickBox.style, { top: r.top + 'px', height: r.height + 'px', left: r.right - 9 + 'px' });
        Object.assign(back.style, { top: r.top + 8 + 'px', right: Math.max(8, innerWidth - r.right + 18) + 'px', maxWidth: Math.max(140, r.width - 40) + 'px' });
        back.hidden = !P.target;
      }
      function drawTicks() {
        if (!P.el) return;
        place(); if (tickBox.hidden) return;
        const r = P.el.getBoundingClientRect(), list = ticks() || [];
        tickBox.replaceChildren(...list.map(t => { const d = h('div', { class: 'nv-tick l' + t.level, title: t.text }); d.style.top = Math.min(r.height - 3, Math.max(0, t.frac * r.height)) + 'px'; d.onclick = () => { P.setWork(); t.go(); }; return d; }));
      }
      function showTip() {
        if (!shown()) return;
        const r = P.el.getBoundingClientRect(), el = P.el, frac = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
        tip.textContent = A.describe(A.capture());
        tip.style.top = Math.min(r.bottom - 26, Math.max(r.top + 4, r.top + frac * (r.height - 24))) + 'px';
        tip.style.right = innerWidth - r.right + 16 + 'px'; tip.style.left = 'auto';
        tip.classList.add('on'); clearTimeout(P.tipT); P.tipT = setTimeout(() => tip.classList.remove('on'), 900);
      }
      // the Back button: "↩ Back to <label>"
      P.offer = (target, label) => {
        P.target = target;
        if (!target) { back.hidden = true; return; }
        P.label = label || 'Back to ' + A.describe(target);
        back.replaceChildren('↩ ', h('span', { class: 't' }, P.label), h('span', { class: 'x', title: 'Dismiss', onClick: (e) => { e.stopPropagation(); P.offer(null); } }, '×'));
        back.title = `${P.label} (${backKey}). Click again to come back here.`;
        place();
      };
      P.setWork = (pl) => { P.work = pl || A.capture(); A.save?.(P.work); };
      P.goBack = () => {
        let to = P.target;
        if (!to && P.history.length) to = P.history.pop();
        if (!to || !P.el) return false;
        const here = A.capture();
        P.jumping = true; A.restore(to); P.work = to; A.save?.(to);
        P.offer(here); setTimeout(() => { P.jumping = false; }, 1000);
        lastPane = P;
        return true;
      };
      back.onclick = () => P.goBack();
      const onScroll = () => {
        lastPane = P; showTip();
        clearTimeout(P.idle); clearTimeout(P.rest);
        P.idle = setTimeout(() => {
          if (P.jumping) return;
          if (!P.work) { P.setWork(); return; }
          const far = P.el.clientHeight * 1.5, d = A.distance(P.work);
          if (d > far && P.target !== P.work) P.offer(P.work);
          else if (d < P.el.clientHeight * 0.5 && P.target) P.offer(null);
        }, 600);
        // stayed here a while (and not just passing by after a jump with the Back button shown): this is the new place
        P.rest = setTimeout(() => { if (!P.target && !P.jumping) P.setWork(); }, 3000);
      };
      P.attach = () => {
        const el = getScroller(); if (el === P.el) return;
        if (P.el) P.el.removeEventListener('scroll', onScroll);
        P.el = el; if (el) { el.addEventListener('scroll', onScroll, { passive: true }); ro.observe(el); }
        drawTicks();
      };
      P.refresh = () => { P.attach(); drawTicks(); };
      P.worked = () => { // typed or clicked here: this is now where you are working
        const old = P.work, now = A.capture();
        if (old && A.distance(old) > (P.el?.clientHeight || 600) * 1.5) { P.history.push(old); if (P.history.length > 20) P.history.shift(); }
        P.work = now; A.save?.(now);
        if (P.target && !P.jumping) P.offer(null);
      };
      P.dispose = () => { if (P.el) P.el.removeEventListener('scroll', onScroll); tip.remove(); tickBox.remove(); back.remove(); };
      panes.push(P);
      return P;
    }
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => panes.forEach(p => p.refresh())); };
    const ro = new ResizeObserver(later);

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
    const describeLine = (line) => {
      const sec = sectionAt(curHeads(), line), pg = pageOfLine(ctx.editor.path, line);
      return [label(sec), pg ? 'p. ' + pg : null, 'line ' + line].filter(Boolean).join(' · ');
    };
    const lastKey = (path) => `last:${pid()}:${path}`;
    const EA = {
      capture: () => ({ ...VP.capture(view()), file: ctx.editor.path }),
      restore: (pl) => { if (pl.file && pl.file !== ctx.editor.path) ctx.goto(pl.file); VP.restore(view(), pl, { scrollIntoView: ctx.cm.EditorView.scrollIntoView }); },
      distance: (pl) => {
        if (pl.file && pl.file !== ctx.editor.path) return Infinity;
        const v = view(), r = VP.relocate(v.state.doc, pl), top = v.scrollDOM.getBoundingClientRect().top - v.documentTop;
        return Math.abs(v.lineBlockAt(Math.min(r.pos, v.state.doc.length)).top - top);
      },
      describe: (pl) => { const v = view(); const pos = VP.relocate(v.state.doc, pl).pos; return describeLine(v.state.doc.lineAt(Math.min(pos, v.state.doc.length)).number); },
      save: (pl) => { if (ctx.editor.path) ctx.settings.set(lastKey(ctx.editor.path), { ...pl, at: Date.now() }); },
    };
    const ed = pane('editor', () => view().scrollDOM, EA, () => {
      const v = view(), H = Math.max(1, v.contentHeight);
      return curHeads().map(x => {
        const pos = v.state.doc.line(Math.min(x.line, v.state.doc.lines)).from;
        return { frac: v.lineBlockAt(pos).top / H, level: x.level, text: label(x), go: () => { v.dispatch({ selection: { anchor: pos }, effects: ctx.cm.EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) }); v.focus(); } };
      });
    });
    // reopening a file: offer the place where you left off (or go there, if that is set)
    function offerLeftOff() {
      const path = ctx.editor.path; if (!path) return;
      const saved = ctx.settings.get(lastKey(path), null);
      ed.work = null; ed.history = []; ed.offer(null);
      if (!saved || (saved.line || 1) <= 3) { ed.setWork(); return; }
      if (ctx.settings.get('autoReturn', false)) { EA.restore(saved); ed.work = saved; return; }
      ed.setWork(); ed.work = { ...ed.work }; ctx.settings.set(lastKey(path), saved); // keep the old place until you work somewhere
      ed.offer(saved, 'Back to where you left off · ' + EA.describe(saved));
    }
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
    const pdfSecAt = (n) => sectionAt(pdfSecs.map(s => ({ ...s, line: s.page + 1 })), n) || pdfSecs.find(s => s.page === n) || null;
    const PA = {
      capture: () => {
        const el = pdfEl(), ps = pages(); if (!el || !ps.length) return { page: 1, frac: 0 };
        let pg = ps[0]; for (const p of ps) if (p.offsetTop <= el.scrollTop + 1) pg = p;
        return { page: +pg.dataset.page || 1, frac: (el.scrollTop - pg.offsetTop) / Math.max(1, pg.offsetHeight) };
      },
      restore: (pl) => {
        const go = () => { const el = pdfEl(), pg = pages().find(p => +p.dataset.page === pl.page); if (el && pg) el.scrollTop = pg.offsetTop + pl.frac * pg.offsetHeight; };
        go(); setTimeout(go, 150); setTimeout(go, 500);
      },
      distance: (pl) => { const el = pdfEl(), pg = pages().find(p => +p.dataset.page === pl.page); return el && pg ? Math.abs(pg.offsetTop + pl.frac * pg.offsetHeight - el.scrollTop) : 0; },
      describe: (pl) => { const sec = pdfSecAt(pl.page); return [`p. ${pl.page} of ${pages().length}`, sec ? label(sec) : null].filter(Boolean).join(' · '); },
      save: (pl) => ctx.settings.set(`lastpdf:${pid()}`, pl),
    };
    const pdf = pane('pdf', pdfEl, PA, () => {
      const el = pdfEl(), ps = pages(); if (!el || !ps.length) return [];
      return pdfSecs.map(s => { const pg = ps[s.page - 1]; return pg ? { frac: pg.offsetTop / el.scrollHeight, level: s.level, text: `${label(s)} · p. ${s.page}`, go: () => el.scrollTo({ top: pg.offsetTop - 8 }) } : null; }).filter(Boolean);
    }, () => { const w = document.getElementById('pdfwrap'); return !!w && w.offsetParent !== null && !document.body.classList.contains('pdf-off'); });
    let pdfOffered = false;
    function offerPdfLeftOff() {
      if (pdfOffered || !pages().length) return; pdfOffered = true;
      const saved = ctx.settings.get(`lastpdf:${pid()}`, null);
      if (!saved || saved.page <= 1 || saved.page > pages().length) return;
      if (ctx.settings.get('autoReturn', false)) { PA.restore(saved); pdf.work = saved; return; }
      pdf.offer(saved, 'Back to where you left off · ' + PA.describe(saved));
    }

    // keep everything in place
    ctx.editor.addExtension(ctx.cm.EditorView.updateListener.of((u) => {
      if (u.docChanged || u.geometryChanged || u.viewportChanged) later();
      // typing or clicking: this is where you are working now
      if (u.docChanged && u.transactions.some(t => t.isUserEvent('input') || t.isUserEvent('delete'))) { clearTimeout(typed); typed = setTimeout(() => ed.worked(), 300); }
      else if (u.selectionSet && u.transactions.some(t => t.isUserEvent('select.pointer'))) ed.worked();
    }));
    let typed = 0;
    document.getElementById('pdf')?.addEventListener('pointerdown', () => setTimeout(() => pdf.worked(), 50));
    ctx.on('compile', () => { pdfSecs = pdfSections(); later(); setTimeout(offerPdfLeftOff, 300); });
    ctx.on('leave', (path) => { try { if (path && ed.work) ctx.settings.set(lastKey(path), { ...EA.capture(), file: path, at: Date.now() }); } catch {} });
    ctx.on('open', () => { ed.attach(); later(); setTimeout(offerLeftOff, 60); });
    ['files', 'project'].forEach(n => ctx.on(n, later));
    ctx.on('project', () => { pdfOffered = false; });
    ro.observe(document.body);
    const mo = new MutationObserver(later); mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', later);
    const saveNow = () => { try { if (ctx.editor.path) EA.save(EA.capture()); if (pages().length) PA.save(PA.capture()); } catch {} };
    addEventListener('pagehide', saveNow);
    const onKey = (e) => {
      const hit = mac ? (e.metaKey && e.key === '[') : (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft');
      if (!hit) return;
      const p = lastPane || ed;
      if (p.goBack()) { e.preventDefault(); e.stopPropagation(); }
    };
    addEventListener('keydown', onKey, true);
    ctx.ui.addCommand({ id: 'nav.back', name: `Back to where you were (${backKey})`, run: () => (lastPane || ed).goBack() });
    ctx.ui.addCommand({ id: 'nav.autoReturn', get name() { return ctx.settings.get('autoReturn', false) ? 'Reopen files at the top (offer “where you left off”)' : 'Reopen files where I left off (jump there by itself)'; }, run: () => { const v = !ctx.settings.get('autoReturn', false); ctx.settings.set('autoReturn', v); ctx.ui.toast(v ? 'Files will reopen where you left off.' : 'Files reopen at the top, with a button to go where you left off.'); } });
    setTimeout(() => { ed.attach(); pdf.attach(); pdfSecs = pdfSections(); later(); offerLeftOff(); offerPdfLeftOff(); }, 0);
    ctx.onDispose(() => { saveNow(); panes.forEach(p => p.dispose()); css.remove(); ro.disconnect(); mo.disconnect(); removeEventListener('pagehide', saveNow); removeEventListener('resize', later); removeEventListener('keydown', onKey, true); });
  },
};
