// The PDF in its own browser tab. It talks to the editor tab that opened it over a BroadcastChannel:
//   editor -> tab:  pdf {bytes, title, name}, show {page, rect}, close, ping
//   tab -> editor:  hello, bye, click {page, x, y}, dock
import { createPdfView } from './pdfview.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('ch') || '';
const ch = new BroadcastChannel('texbench-pdf-' + id);
let name = 'document.pdf', lastSeen = Date.now();

const pdf = createPdfView($('pdf'), {
  onDblClick(page, x, y) { ch.postMessage({ type: 'click', page, x, y }); },
  onPageInfo(cur, n, zoom) { $('pageInfo').textContent = `${cur} / ${n}`; $('zoomInfo').textContent = zoom + '%'; },
});
ch.onmessage = async (e) => {
  const m = e.data || {}; lastSeen = Date.now(); $('gone').hidden = true;
  if (m.type === 'pdf') { name = m.name || name; document.title = (m.title || 'PDF') + ' — PDF'; await pdf.load(m.bytes); $('empty').hidden = true; $('stamp').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  else if (m.type === 'show') pdf.reveal(m.page, m.rect);
  else if (m.type === 'ping') ch.postMessage({ type: 'hello' });
  else if (m.type === 'close') window.close();
};
ch.postMessage({ type: 'hello' });
addEventListener('pagehide', () => ch.postMessage({ type: 'bye' }));
// if the editor tab was closed, say so (it answers pings while it is open)
setInterval(() => { ch.postMessage({ type: 'alive?' }); if (Date.now() - lastSeen > 8000) $('gone').hidden = false; }, 3000);

$('zoomOut').onclick = () => pdf.setZoom(pdf.zoom / 1.15);
$('zoomIn').onclick = () => pdf.setZoom(pdf.zoom * 1.15);
$('zoomFit').onclick = () => pdf.setZoom(1);
$('download').onclick = () => {
  if (!pdf.bytes) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pdf.bytes], { type: 'application/pdf' })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
};
$('dock').onclick = () => { ch.postMessage({ type: 'dock' }); window.close(); };
addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); pdf.setZoom(pdf.zoom * 1.15); }
  else if (mod && e.key === '-') { e.preventDefault(); pdf.setZoom(pdf.zoom / 1.15); }
  else if (mod && e.key === '0') { e.preventDefault(); pdf.setZoom(1); }
});
