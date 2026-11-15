// A place in the editor, kept as text rather than pixels, so it survives the visual view drawing equations,
// joining paragraphs or page breaks (which change heights) and edits above it.
//   capture(view) -> { pos, dy, anchor, head, line, snippet }
//   restore(view, place, { cursor }) scrolls so the same text is at the same height (and corrects itself once
//   the layout has settled); relocate(doc, place) finds the position again after the text changed.

function topHeight(view) { return view.scrollDOM.getBoundingClientRect().top - view.documentTop; }

export function capture(view) {
  const st = view.state, h = Math.max(0, topHeight(view));
  const blk = view.lineBlockAtHeight(h);
  const pos = blk.from, line = st.doc.lineAt(pos);
  const sel = st.selection.main;
  return { pos, dy: blk.top - h, anchor: sel.anchor, head: sel.head, line: line.number, snippet: st.doc.sliceString(pos, Math.min(st.doc.length, pos + 60)), len: st.doc.length };
}

// the position again in a document that may have changed: same text near the old place, else same line
export function relocate(doc, place) {
  const text = doc.toString();
  if (place.len === text.length && text.slice(place.pos, place.pos + place.snippet.length) === place.snippet) return { pos: place.pos, shift: 0 };
  if (place.snippet && place.snippet.trim().length > 8) {
    let best = -1, bd = Infinity, i = text.indexOf(place.snippet);
    while (i >= 0) { const d = Math.abs(i - place.pos); if (d < bd) { bd = d; best = i; } i = text.indexOf(place.snippet, i + 1); }
    if (best >= 0) return { pos: best, shift: best - place.pos };
  }
  const ln = Math.min(Math.max(1, place.line || 1), doc.lines);
  const pos = doc.line(ln).from;
  return { pos, shift: pos - place.pos };
}

export function restore(view, place, { cursor = true, scrollIntoView, smooth = false } = {}) {
  if (!place) return;
  const doc = view.state.doc, r = relocate(doc, place), clamp = (p) => Math.max(0, Math.min(doc.length, p + r.shift));
  const spec = { effects: scrollIntoView(r.pos, { y: 'start', yMargin: Math.max(0, place.dy || 0) }) };
  if (cursor && place.anchor != null) spec.selection = { anchor: clamp(place.anchor), head: clamp(place.head) };
  view.dispatch(spec);
  // heights settle after drawing (equations, measured lines): correct a few times
  let stop = false; const cancel = () => { stop = true; };
  for (const ev of ['wheel', 'pointerdown', 'keydown', 'touchstart']) view.scrollDOM.addEventListener(ev, cancel, { once: true, passive: true });
  setTimeout(() => { for (const ev of ['wheel', 'pointerdown', 'keydown', 'touchstart']) view.scrollDOM.removeEventListener(ev, cancel); }, 1000);
  const fix = () => {
    if (stop) return;
    try {
      const want = place.dy || 0, now = view.lineBlockAt(Math.min(r.pos, view.state.doc.length)).top - topHeight(view);
      if (Math.abs(now - want) > 1) view.scrollDOM.scrollTop += now - want;
    } catch {}
  };
  requestAnimationFrame(() => { fix(); requestAnimationFrame(fix); });
  setTimeout(fix, 120); setTimeout(fix, 400); setTimeout(fix, 900);
  return r.pos;
}
