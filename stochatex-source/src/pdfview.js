// PDF preview built on PDF.js (Apache-2.0). Pages are drawn to canvases and only when they are near the viewport.
let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    const base = new URL('./vendor/', document.baseURI).href;
    pdfjs = await import(/* @vite-ignore */ base + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  }
  return pdfjs;
}
export function createPdfView(scroller, { onDblClick, onPageInfo }) {
  let doc = null, zoom = 1, pages = [], gen = 0, bytes = null;
  const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) draw(e.target.__pg); }, { root: scroller, rootMargin: '600px 0px' });

  async function draw(pg) {
    if (!pg || pg.drawn === pg.wantScale + ':' + gen || pg.busy) return;
    pg.busy = true;
    const myGen = gen, scale = pg.wantScale;
    try {
      const page = await doc.getPage(pg.n);
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp }).promise;
      if (myGen !== gen) return;
      pg.el.querySelector('canvas')?.remove();
      pg.el.prepend(canvas);
      pg.drawn = scale + ':' + gen;
    } catch (e) { /* a newer document replaced this one */ } finally { pg.busy = false; if (pg.wantScale !== scale && myGen === gen) draw(pg); }
  }
  async function layout() {
    if (!doc) return;
    const avail = Math.max(200, scroller.clientWidth - 28);
    for (const pg of pages) {
      const scale = (avail / pg.w) * zoom;
      pg.scale = pg.wantScale = scale;
      pg.el.style.width = Math.floor(pg.w * scale) + 'px'; pg.el.style.height = Math.floor(pg.h * scale) + 'px';
    }
    for (const pg of pages) { const r = pg.el.getBoundingClientRect(), s = scroller.getBoundingClientRect(); if (r.bottom > s.top - 600 && r.top < s.bottom + 600) draw(pg); }
  }
  async function load(data) {
    bytes = data;
    const { getDocument } = await lib();
    const next = await getDocument({ data: data.slice(0), isEvalSupported: false }).promise;
    const old = doc, keepTop = scroller.scrollTop;
    doc = next; gen++;
    const n = doc.numPages;
    while (pages.length > n) { const pg = pages.pop(); io.unobserve(pg.el); pg.el.remove(); }
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 });
      let pg = pages[i - 1];
      if (!pg) {
        pg = { n: i, el: document.createElement('div') };
        pg.el.className = 'pdfpage'; pg.el.__pg = pg; pg.el.dataset.page = i;
        pg.el.addEventListener('dblclick', (e) => {
          const r = pg.el.getBoundingClientRect();
          onDblClick && onDblClick(pg.n, (e.clientX - r.left) / pg.scale, (e.clientY - r.top) / pg.scale);
        });
        scroller.appendChild(pg.el); pages.push(pg); io.observe(pg.el);
      }
      pg.w = vp.width; pg.h = vp.height;
    }
    await layout();
    scroller.scrollTop = keepTop;
    if (old) { try { await (old.loadingTask ? old.loadingTask.destroy() : old.destroy?.()); } catch {} }
    info();
  }
  function info() {
    if (!onPageInfo || !pages.length) return;
    const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
    let cur = 1;
    for (const pg of pages) if (pg.el.getBoundingClientRect().top <= mid) cur = pg.n;
    onPageInfo(cur, pages.length, Math.round(zoom * 100));
  }
  scroller.addEventListener('scroll', info, { passive: true });
  let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(layout, 120); }).observe(scroller);
  return {
    load, get bytes() { return bytes; }, get pageCount() { return pages.length; },
    setZoom(z) { zoom = Math.max(0.3, Math.min(4, z)); layout().then(info); }, get zoom() { return zoom; },
    // rect in PDF points from the top-left of the page
    reveal(pageNo, rect) {
      const pg = pages[pageNo - 1]; if (!pg) return;
      const top = pg.el.offsetTop + rect.y * pg.scale;
      scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 3), behavior: 'smooth' });
      const mark = document.createElement('div'); mark.className = 'pdfmark';
      Object.assign(mark.style, { left: Math.max(0, rect.x * pg.scale - 4) + 'px', top: (rect.y * pg.scale - 2) + 'px', width: Math.max(24, (rect.w || 0) * pg.scale + 8) + 'px', height: Math.max(10, rect.h * pg.scale + 4) + 'px' });
      pg.el.appendChild(mark); setTimeout(() => mark.remove(), 1600);
    },
    clear() { pages.forEach(pg => { io.unobserve(pg.el); pg.el.remove(); }); pages = []; doc = null; bytes = null; },
  };
}
