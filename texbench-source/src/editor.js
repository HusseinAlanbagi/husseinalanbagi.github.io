// The source editor (CodeMirror 6).
import { EditorState, Compartment, EditorSelection, StateEffect, StateField, Prec, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, highlightSpecialChars, rectangularSelection, Decoration, ViewPlugin, WidgetType, hoverTooltip, showTooltip } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, snippet, snippetCompletion, startCompletion, acceptCompletion } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from '@codemirror/search';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { tags as t } from '@lezer/highlight';

// Everything modules may need from CodeMirror, so they never have to bundle their own copy.
export const cm = { EditorState, Compartment, EditorSelection, StateEffect, StateField, Prec, RangeSetBuilder, EditorView, keymap, Decoration, ViewPlugin, WidgetType, hoverTooltip, showTooltip, snippet, snippetCompletion, startCompletion, setDiagnostics, openSearchPanel };

const light = HighlightStyle.define([
  { tag: [t.keyword, t.tagName], color: 'var(--syn-cmd)' }, { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.string, t.atom], color: 'var(--syn-arg)' }, { tag: [t.number, t.variableName], color: 'var(--syn-math)' },
  { tag: [t.bracket, t.brace], color: 'var(--syn-brace)' }, { tag: t.meta, color: 'var(--syn-math)' }, { tag: t.invalid, color: 'var(--err)' },
]);
const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--ed-size, 14px)', color: 'var(--ink)', backgroundColor: 'var(--paper)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--paper)', color: 'var(--faint)', border: 'none', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' }, '.cm-activeLineGutter': { backgroundColor: 'var(--active-line)', color: 'var(--ink)' },
  // The selection is drawn above the text and blended, so it shows on the current line, on the page sheet and over drawn equations.
  '.cm-selectionLayer': { zIndex: '3 !important', mixBlendMode: 'var(--sel-blend, multiply)', pointerEvents: 'none' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': { backgroundColor: 'var(--sel) !important', borderRadius: '2px' },
  '.cm-selectionMatch': { backgroundColor: 'transparent', boxShadow: 'inset 0 -2px 0 color-mix(in srgb, var(--accent) 55%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-tooltip': { backgroundColor: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '6px', boxShadow: '0 6px 24px rgba(0,0,0,.18)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--ink)', borderColor: 'var(--line)' },
  '.cm-textfield, .cm-button': { backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)', backgroundImage: 'none', borderRadius: '4px' },
  '.cm-flash': { backgroundColor: 'var(--flash)' },
});

export function createEditor(parent, { onChange, onCursor }) {
  const moduleComp = new Compartment(), langComp = new Compartment(), wrapComp = new Compartment();
  const sources = new Set();           // completion sources registered by modules
  let moduleExts = [], view, suppress = false;
  const states = new Map();            // path -> EditorState
  let current = null;

  const complete = async (ctx) => {
    const results = (await Promise.all([...sources].map(async s => { try { return await s(ctx); } catch { return null; } }))).filter(Boolean);
    if (!results.length) return null;
    const from = Math.min(...results.map(r => r.from));
    const first = results.filter(r => r.from === from);
    return { from, options: first.flatMap(r => r.options), validFor: first[0].validFor };
  };
  const flashEffect = StateEffect.define();
  const flashField = StateField.define({
    create: () => Decoration.none,
    update(v, tr) { v = v.map(tr.changes); for (const e of tr.effects) if (e.is(flashEffect)) v = e.value == null ? Decoration.none : Decoration.set([Decoration.line({ class: 'cm-flash' }).range(e.value)]); return v; },
    provide: f => EditorView.decorations.from(f),
  });
  const base = (path) => [
    lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(), dropCursor(),
    EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(), rectangularSelection(),
    highlightActiveLine(), highlightSelectionMatches(), search({ top: true }), lintGutter(), flashField,
    indentUnit.of('  '), syntaxHighlighting(light), baseTheme,
    autocompletion({ override: [complete], activateOnTyping: true, maxRenderedOptions: 60 }),
    keymap.of([{ key: 'Tab', run: acceptCompletion }, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab]),
    wrapComp.of(EditorView.lineWrapping),
    langComp.of(/\.(tex|sty|cls|ltx|tikz|bbl|def|clo)$/i.test(path) ? StreamLanguage.define(stex) : []),
    EditorState.languageData.of(() => [{ commentTokens: { line: '%' } }]),
    moduleComp.of(moduleExts),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !suppress) onChange && onChange(current, u.state.doc.toString(), u);
      if (u.selectionSet || u.docChanged) onCursor && onCursor(u.state);
    }),
  ];
  view = new EditorView({ parent, state: EditorState.create({ doc: '', extensions: base('x.tex') }) });
  new ResizeObserver(() => view.requestMeasure()).observe(parent);

  const api = {
    view, cm,
    get path() { return current; },
    open(path, text) {
      if (current) states.set(current, view.state);
      let st = states.get(path);
      if (!st || st.doc.toString() !== text) st = EditorState.create({ doc: text, extensions: base(path) });
      current = path;
      suppress = true; view.setState(st); view.dispatch({ effects: moduleComp.reconfigure(moduleExts) }); suppress = false;
      onCursor && onCursor(view.state); view.requestMeasure();
    },
    forget(path) { states.delete(path); if (current === path) current = null; },
    rename(from, to) { if (states.has(from)) { states.set(to, states.get(from)); states.delete(from); } if (current === from) current = to; },
    getText: () => view.state.doc.toString(),
    setText(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    getSelection() { const r = view.state.selection.main; return { from: r.from, to: r.to, text: view.state.sliceDoc(r.from, r.to) }; },
    getCursor() { const pos = view.state.selection.main.head, ln = view.state.doc.lineAt(pos); return { pos, line: ln.number, column: pos - ln.from }; },
    replaceRange(from, to, text, select) { view.dispatch({ changes: { from, to, insert: text }, selection: select ? EditorSelection.range(from, from + text.length) : EditorSelection.cursor(from + text.length), scrollIntoView: true, userEvent: 'input' }); view.focus(); },
    insert(text) { const r = view.state.selection.main; api.replaceRange(r.from, r.to, text); },
    insertSnippet(template) { const r = view.state.selection.main; snippet(template)(view, null, r.from, r.to); view.focus(); },
    gotoLine(line, flash = true) {
      const n = Math.max(1, Math.min(line, view.state.doc.lines)), ln = view.state.doc.line(n);
      view.dispatch({ selection: EditorSelection.cursor(ln.from), effects: [EditorView.scrollIntoView(ln.from, { y: 'center' }), ...(flash ? [flashEffect.of(ln.from)] : [])] });
      view.focus();
      if (flash) setTimeout(() => { try { view.dispatch({ effects: flashEffect.of(null) }); } catch {} }, 1200);
    },
    setPos(pos) { view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); view.focus(); },
    focus: () => view.focus(),
    setDiagnostics(list) {
      const doc = view.state.doc;
      const diags = list.filter(p => p.line && p.line <= doc.lines).map(p => { const ln = doc.line(p.line); return { from: ln.from + (ln.text.length - ln.text.trimStart().length), to: ln.to, severity: p.severity, message: p.message, source: p.source, renderMessage: p.renderMessage }; });
      view.dispatch(setDiagnostics(view.state, diags));
    },
    addCompletionSource(fn) { sources.add(fn); return () => sources.delete(fn); },
    addExtension(ext) {
      moduleExts = [...moduleExts, ext];
      view.dispatch({ effects: moduleComp.reconfigure(moduleExts) });
      return () => { moduleExts = moduleExts.filter(e => e !== ext); view.dispatch({ effects: moduleComp.reconfigure(moduleExts) }); };
    },
    addKeymap(bindings) { return api.addExtension(Prec.high(keymap.of(bindings))); },
    setWrap(on) { view.dispatch({ effects: wrapComp.reconfigure(on ? EditorView.lineWrapping : []) }); },
    toggleComment: () => toggleComment(view),
    openSearch: () => openSearchPanel(view),
  };
  return api;
}
