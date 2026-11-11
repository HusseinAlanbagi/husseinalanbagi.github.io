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
export function modal({ title, body, buttons = [], wide = false, onClose }) {
  const back = h('div', { class: 'modal-back' });
  const content = h('div', { class: 'modal-body' });
  const foot = h('div', { class: 'modal-foot' });
  const box = h('div', { class: 'modal' + (wide === 'full' ? ' full' : wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon', title: 'Close (Esc)', onClick: () => api.close() }, '✕')), content, foot);
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
export function toast(msg, kind = '') {
  toastBox ||= document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t); setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3500);
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
