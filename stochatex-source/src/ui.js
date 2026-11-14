// Small DOM toolkit: element builder, dialogs, toasts, menus, splitters.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } } else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
// Line icons, drawn for this app. icon('name') returns an <svg>; unknown names give a text glyph.
const ICONS = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  files: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  outline: 'M4 6h16 M9 12h11 M9 18h11 M4 12h1 M4 18h1',
  scale: 'M12 4v16 M7 20h10 M5 8h14 M5 8l-2.500 6a2.700 2.700 0 0 0 5 0z M19 8l-2.500 6a2.700 2.700 0 0 0 5 0z',
  sigma: 'M17 5H7l6 7-6 7h10',
  braces: 'M9 4c-2 0-3 1-3 3v2c0 1.500-1 3-2 3 1 0 2 1.500 2 3v2c0 2 1 3 3 3 M15 4c2 0 3 1 3 3v2c0 1.500 1 3 2 3-1 0-2 1.500-2 3v2c0 2-1 3-3 3',
  swap: 'M4 8h14l-3-3 M20 16H6l3 3',
  wave: 'M3 17c3 0 3-10 6-10s3 8 6 8 3-3 6-3',
  moon: 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.500 1.500 M17.500 17.500L19 19 M5 19l1.500-1.500 M17.500 6.500L19 5',
  sliders: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
  command: 'M5 8l4 4-4 4 M12 16h7',
  play: 'M8 5.500v13l10.500-6.500z',
  eye: 'M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  proof: 'M4 6h12 M4 11h8 M4 16h5 M13 17l3 3 5-6',
  plus: 'M12 5v14 M5 12h14', upload: 'M12 16V5 M7 9l5-5 5 5 M5 19h14', close: 'M6 6l12 12 M18 6L6 18',
  external: 'M14 5h5v5 M19 5l-8 8 M11 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5',
  locate: 'M4 12h13 M12 7l5 5-5 5 M20 5v14', more: 'M5 12h.010 M12 12h.010 M19 12h.010', chevron: 'M6 9l6 6 6-6',
};
export function icon(name, size = 16) {
  const d = ICONS[name];
  if (!d) return h('span', { class: 'ic' }, name || '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d);
  if (name === 'play') { path.setAttribute('fill', 'currentColor'); path.setAttribute('stroke', 'none'); }
  svg.append(path); return svg;
}
export function modal({ title, body, buttons = [], wide = false, onClose }) {
  const back = h('div', { class: 'modal-back' });
  const content = h('div', { class: 'modal-body' });
  const foot = h('div', { class: 'modal-foot' });
  const box = h('div', { class: 'modal' + (wide === 'full' ? ' full' : wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'ghost icon-only', title: 'Close (Esc)', 'aria-label': 'Close', onClick: () => api.close() }, icon('close'))), content, foot);
  const api = { el: box, content, close() { back.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(); },
    setButtons(list) { foot.replaceChildren(...list.map(b => h('button', { class: b.primary ? 'primary' : b.danger ? 'danger' : '', onClick: () => b.onClick ? b.onClick(api) : api.close() }, b.label))); foot.style.display = list.length ? '' : 'none'; } };
  const key = (e) => { if (e.key === 'Escape' && document.querySelector('.modal-back:last-of-type') === back) { e.stopPropagation(); api.close(); } };
  document.addEventListener('keydown', key, true);
  back.addEventListener('mousedown', (e) => { if (e.target === back) api.close(); });
  if (typeof body === 'function') body(content, api); else if (body) content.append(body);
  api.setButtons(buttons);
  back.append(box); document.body.append(back);
  setTimeout(() => (content.querySelector('[autofocus]') || content.querySelector('input,textarea,select,button'))?.focus(), 30);
  return api;
}
export const confirmBox = (title, text, okLabel = 'OK', danger = false) => new Promise((res) => {
  let done = false;
  modal({ title, body: h('p', {}, text), onClose: () => { if (!done) res(false); },
    buttons: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, onClick: (m) => { done = true; res(true); m.close(); } }] });
});
export const promptBox = (title, label, value = '') => new Promise((res) => {
  let done = false;
  const input = h('input', { type: 'text', value, autofocus: true, class: 'grow' });
  const ok = (m) => { done = true; res(input.value.trim()); m.close(); };
  const m = modal({ title, body: h('label', { class: 'field' }, label, input), onClose: () => { if (!done) res(null); }, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: ok }] });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(m); });
  setTimeout(() => input.select(), 40);
});
let toastBox;
export function toast(msg, kind = '', ms = 0) {
  toastBox ||= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t); setTimeout(() => t.remove(), ms || (kind === 'err' ? 7000 : 3500));
}
export function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const m = h('div', { class: 'menu', role: 'menu' }, items.map(it => it === '-' ? h('hr') : it.heading ? h('div', { class: 'menu-head' }, it.heading)
    : h('button', { role: 'menuitem', disabled: it.disabled, title: it.title || '', onClick: () => { m.remove(); it.onClick(); } }, it.label, it.hint ? h('span', { class: 'hint' }, it.hint) : null)));
  document.body.append(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, top: anchor.y };
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 8) + 'px';
  m.style.top = (r.bottom + m.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - m.offsetHeight) : r.bottom + 2) + 'px';
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  return m;
}
// Drag handle that resizes `target` (px, stored in a CSS variable on the root).
export function splitter(handle, { varName, min, max, invert = false, axis = 'x', onEnd }) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
    const start = axis === 'x' ? e.clientX : e.clientY, v0 = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName));
    const move = (ev) => { const d = (axis === 'x' ? ev.clientX : ev.clientY) - start; const v = Math.max(min, Math.min(max(), v0 + (invert ? -d : d))); document.documentElement.style.setProperty(varName, v + 'px'); };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); onEnd && onEnd(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName))); };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
  });
}
export const download = (data, name, type = 'application/octet-stream') => {
  const a = h('a', { href: URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
};
export const pickFiles = (accept = '', multiple = true) => new Promise((res) => {
  const i = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
  i.addEventListener('change', () => { res([...i.files]); i.remove(); });
  i.addEventListener('cancel', () => { res([]); i.remove(); });
  document.body.append(i); i.click();
});
