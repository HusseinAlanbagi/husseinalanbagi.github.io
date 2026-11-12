// MathJax 3 (shipped with the equation editor), loaded once for every module that draws maths.
let mj = null;
export function loadMathJax() {
  if (mj) return mj;
  mj = new Promise((resolve, reject) => {
    if (window.MathJax && window.MathJax.tex2svg) return resolve(window.MathJax);
    window.MathJax = { tex: { tags: 'ams' }, svg: { fontCache: 'local' }, startup: { typeset: false, ready() { window.MathJax.startup.defaultReady(); window.MathJax.startup.promise.then(() => { try { document.head.append(window.MathJax.svgStylesheet()); } catch {} resolve(window.MathJax); }); } }, options: { enableMenu: false } };
    const s = document.createElement('script');
    s.src = new URL('./equation/mathjax/tex-svg-full.js', document.baseURI).href; s.async = true;
    s.onerror = () => { mj = null; reject(new Error('MathJax could not be loaded')); };
    document.head.append(s);
  });
  return mj;
}
// inline SVG markup for a piece of maths ('' if MathJax is not ready)
export function mathSvg(tex, macros = '') {
  try { const n = window.MathJax.tex2svg(macros + tex, { display: false }); n.querySelectorAll('mjx-assistive-mml').forEach(x => x.remove()); return n.outerHTML; } catch { return ''; }
}
