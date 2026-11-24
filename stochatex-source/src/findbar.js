// StochaTeX's find bar (replaces CodeMirror's stock search panel).
//   "3 of 12", ↑ ↓ (Shift+Enter / Enter, F3), Aa match case, ab whole word, .* regular expression,
//   "ignore LaTeX" (Central Bank also finds \textbf{Central} Bank or text split over two lines),
//   Replace / Replace all ("Replaced 7", one Undo), and "All files" with a list of results per file.
import { SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious, replaceNext, replaceAll, closeSearchPanel, openSearchPanel, search } from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';
import { h } from './ui.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "Central Bank" -> Central, then any mix of spaces, line breaks, braces, ~ and \commands, then Bank
export function latexLoose(text, wholeWord) {
  const words = text.trim().split(/\s+/).filter(Boolean).map(esc);
  const gap = '(?:\\s|[{}~]|\\\\[a-zA-Z]+\\*?)+';
  const body = words.join(gap);
  // word edges that also respect accented letters (\b alone counts é as an edge)
  return wholeWord ? `(?<![\\w\\u00C0-\\u024F])${body}(?![\\w\\u00C0-\\u024F])` : body;
}

export function findBar(app) {
  // app: { files(), read(path), goto(path, line), activePath(), onOpenFile(path, from, to) }
  let opts = { caseSensitive: false, wholeWord: false, regexp: false, loose: false };
  let replaceOpen = false;
  function makeQuery(view, text) {
    // Whole word stays the editor's own option unless Ignore LaTeX really turned the text into a pattern; then the
    // pattern carries its own word edges (a single word with Ignore LaTeX is searched as it is)
    const st = { search: text, caseSensitive: opts.caseSensitive, wholeWord: opts.wholeWord, regexp: opts.regexp, replace: view?.__fb?.replace?.value || '' };
    if (opts.loose && !opts.regexp && text.trim().includes(' ')) { st.search = latexLoose(text, opts.wholeWord); st.regexp = true; st.wholeWord = false; }
    return new SearchQuery(st);
  }
  function createPanel(view) {
    const input = h('input', { class: 'fb-in', type: 'text', placeholder: 'Find', 'aria-label': 'Find', spellcheck: false, 'main-field': 'true' });
    const replace = h('input', { class: 'fb-in', type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with', spellcheck: false });
    const count = h('span', { class: 'fb-count', 'aria-live': 'polite' });
    const tog = (k, label, title) => { const b = h('button', { class: 'fb-tog', title, 'aria-pressed': String(!!opts[k]), onClick: () => { opts[k] = !opts[k]; b.setAttribute('aria-pressed', String(opts[k])); b.classList.toggle('on', opts[k]); commit(); input.focus(); } }, label); b.classList.toggle('on', !!opts[k]); return b; };
    const btn = (label, title, fn, cls = '') => h('button', { class: 'fb-btn ' + cls, title, 'aria-label': title, onClick: () => { fn(); } }, label);
    const results = h('div', { class: 'fb-results', hidden: true });
    const replRow = h('div', { class: 'fb-row fb-repl', hidden: !replaceOpen },
      replace,
      btn('Replace', 'Replace this match (Enter in this box)', () => { replaceNext(view); update(); }, 'txt'),
      btn('Replace all', 'Replace every match in this file (one Ctrl+Z undoes it)', () => { const n = countMatches(view).total; if (!n) return; replaceAll(view); update(); flash(`Replaced ${n}`); }, 'txt'));
    const toggleRepl = h('button', { class: 'fb-btn fb-expand', title: 'Show or hide Replace (Ctrl+H)', 'aria-label': 'Replace', 'aria-expanded': String(replaceOpen), onClick: () => setRepl(!replaceOpen) }, '⇄');
    const allBtn = h('button', { class: 'fb-tog', title: 'Find in every file of the project', 'aria-pressed': 'false', onClick: () => { allFiles = !allFiles; allBtn.classList.toggle('on', allFiles); allBtn.setAttribute('aria-pressed', String(allFiles)); listAll(); } }, 'All files');
    let allFiles = false, listT = 0;
    const allFilesOn = () => allFiles;
    const dom = h('div', { class: 'fb' },
      h('div', { class: 'fb-row' }, toggleRepl, input, count,
        btn('↑', 'Previous match (Shift+Enter)', () => { findPrevious(view); update(); }),
        btn('↓', 'Next match (Enter)', () => { findNext(view); update(); }),
        h('span', { class: 'fb-sep' }),
        tog('caseSensitive', 'Aa', 'Match case'), tog('wholeWord', 'ab', 'Whole word'), tog('regexp', '.*', 'Regular expression ($1 in Replace)'), tog('loose', 'TeX', 'Ignore LaTeX: “Central Bank” also finds \\textbf{Central} Bank and text split over lines'),
        allBtn,
        h('span', { class: 'spacer' }),
        btn('×', 'Close (Esc)', () => { closeSearchPanel(view); view.focus(); }, 'fb-x')),
      replRow, results);
    const flash = (msg) => { count.textContent = msg; count.classList.add('ok'); setTimeout(() => { count.classList.remove('ok'); update(); }, 1600); };
    function setRepl(v) { replaceOpen = v; replRow.hidden = !v; toggleRepl.setAttribute('aria-expanded', String(v)); if (v) replace.focus(); }
    function commit() { view.dispatch({ effects: setSearchQuery.of(makeQuery(view, input.value)) }); update(); if (allFiles) listAll(); }
    function countMatches(v) {
      const q = getSearchQuery(v.state); if (!q.valid || !input.value) return { total: 0, at: 0 };
      const sel = v.state.selection.main; let total = 0, at = 0;
      const cur = q.getCursor(v.state);
      for (let r = cur.next(); !r.done && total < 10000; r = cur.next()) { total++; if (r.value.from === sel.from && r.value.to === sel.to) at = total; else if (!at && r.value.from >= sel.to) at = -total; }
      return { total, at };
    }
    function update() {
      // replacing a match found while ignoring LaTeX would also replace the commands and braces inside it
      const noRepl = opts.loose; replRow.querySelectorAll('button').forEach(b => { b.disabled = noRepl; b.title = noRepl ? 'Turn off “Ignore LaTeX” (TeX) to replace' : b.getAttribute('aria-label'); });
      const q = getSearchQuery(view.state);
      if (!input.value) { count.textContent = ''; input.classList.remove('bad'); return; }
      if (!q.valid) { count.textContent = 'Not a valid pattern'; input.classList.add('bad'); return; }
      const { total, at } = countMatches(view);
      input.classList.toggle('bad', !total);
      count.textContent = (!total ? 'No matches' : at > 0 ? `${at} of ${total}` : `${total} match${total === 1 ? '' : 'es'}`) + (allFiles ? ' in this file' : '');
    }
    function listAll() {
      results.hidden = !allFiles || !input.value;
      if (results.hidden) return;
      const q = makeQuery(view, input.value);
      if (!q.valid) { results.replaceChildren(h('div', { class: 'fb-file' }, 'Not a valid pattern')); return; }
      // the same options as in this file: case, whole word, regular expression (Ignore LaTeX is already in the pattern)
      const body = q.regexp ? q.search : esc(q.search);
      let re; try { re = new RegExp(q.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])` : body, (q.caseSensitive ? 'g' : 'gi') + (q.wholeWord ? 'u' : '')); }
      catch { results.replaceChildren(h('div', { class: 'fb-file' }, 'Not a valid pattern')); return; }
      const out = [];
      let n = 0;
      for (const path of app.files().filter(p => /\.(tex|bib|ltx|sty|cls|mod|txt|md)$/i.test(p))) {
        const t = path === app.activePath() ? view.state.doc.toString() : app.read(path); if (t == null) continue;
        const hits = [];
        for (const m of t.matchAll(re)) { if (!m[0]) break; hits.push(m); if (++n > 500) break; }
        if (!hits.length) continue;
        out.push(h('div', { class: 'fb-file' }, `${path} · ${hits.length}`));
        for (const m of hits.slice(0, 50)) {
          const line = t.slice(0, m.index).split('\n').length, ls = t.lastIndexOf('\n', m.index - 1) + 1, le = t.indexOf('\n', m.index);
          const text = t.slice(ls, le < 0 ? t.length : le), col = m.index - ls;
          out.push(h('button', { class: 'fb-hit', onClick: () => goHit(path, m, re) },
            h('span', { class: 'ln' }, String(line)), h('span', {}, text.slice(Math.max(0, col - 30), col)), h('mark', {}, text.slice(col, col + m[0].length)), h('span', {}, text.slice(col + m[0].length, col + m[0].length + 60))));
        }
      }
      results.replaceChildren(...(out.length ? out : [h('div', { class: 'fb-file' }, 'No matches in the project')]));
    }
    // a result is checked against the file as it is now: if the text moved, the nearest match of the same text is used
    function goHit(path, m, re) {
      const now = path === app.activePath() ? view.state.doc.toString() : app.read(path);
      let at = m.index, len = m[0].length;
      if (now != null && now.slice(at, at + len) !== m[0]) {
        let best = null;
        re.lastIndex = 0;
        for (const x of now.matchAll(re)) { if (!x[0]) break; if (!best || Math.abs(x.index - m.index) < Math.abs(best.index - m.index)) best = x; }
        if (best) { at = best.index; len = best[0].length; }
      }
      app.onOpenFile(path, at, at + len);
      if (allFiles) setTimeout(listAll, 0);
    }
    let t = 0;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(commit, 80); });
    replace.addEventListener('input', () => view.dispatch({ effects: setSearchQuery.of(makeQuery(view, input.value)) }));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'F3') { e.preventDefault(); (e.shiftKey ? findPrevious : findNext)(view); update(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); view.focus(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); setRepl(!replaceOpen); }
    });
    replace.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && opts.loose) { e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey || e.metaKey) { const n = countMatches(view).total; replaceAll(view); flash(`Replaced ${n}`); } else { replaceNext(view); update(); } }
      else if (e.key === 'Escape') { e.preventDefault(); closeSearchPanel(view); view.focus(); }
    });
    view.__fb = { replace, setRepl, input, update };
    return {
      dom, top: true,
      mount() {
        const q = getSearchQuery(view.state), sel = view.state.selection.main;
        const pick = !sel.empty && sel.to - sel.from < 200 ? view.state.sliceDoc(sel.from, sel.to) : '';
        input.value = pick && !pick.includes('\n') ? pick : (q.search && !opts.loose ? q.search : input.value);
        if (pick) commit(); else update();
        input.focus(); input.select();
      },
      update(u) {
        if (u.docChanged || u.selectionSet || u.transactions.some(tr => tr.effects.some(e => e.is(setSearchQuery)))) update();
        // the project list follows edits (shortly after typing stops), so its counts and places match the text
        if (u.docChanged && allFilesOn()) { clearTimeout(listT); listT = setTimeout(listAll, 250); }
      },
      destroy() { delete view.__fb; },
    };
  }
  return {
    extension: search({ top: true, createPanel }),
    keys: [
      { key: 'Mod-f', run: (v) => { openSearchPanel(v); v.__fb?.input.focus(); v.__fb?.input.select(); return true; }, scope: 'editor search-panel', preventDefault: true },
      { key: 'Mod-h', run: (v) => { openSearchPanel(v); setTimeout(() => v.__fb?.setRepl(true)); return true; }, preventDefault: true },
      { key: 'F3', run: (v) => { findNext(v); v.__fb?.update(); return true; }, shift: (v) => { findPrevious(v); v.__fb?.update(); return true; } },
    ],
  };
}
