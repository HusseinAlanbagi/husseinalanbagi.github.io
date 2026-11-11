// Wrapper around the in-browser TeX engine (Siglum engine, MIT; pdfTeX/XeTeX from TeX Live compiled to WebAssembly).
import { SiglumCompiler } from '@siglum/engine';
const R = new URL('./runtime', document.baseURI).href;
let compiler = null, ready = null, bstIndex = null;
const listeners = new Set();
export const onEngineLog = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export let engineLog = [];

export function initEngine(onProgress) {
  if (ready) return ready;
  compiler = new SiglumCompiler({
    workerUrl: new URL('./engine-worker.js', document.baseURI).href,
    wasmUrl: R + '/wasm/busytex.wasm', bundlesUrl: R + '/bundles', ctanProxyUrl: R, xzwasmUrl: R + '/xzwasm.js',
    onLog: (m) => { engineLog.push(m); if (engineLog.length > 4000) engineLog = engineLog.slice(-3000); listeners.forEach(f => f(m)); },
    onProgress: (stage, detail) => onProgress && onProgress(stage, detail),
  });
  ready = compiler.init().then(async () => {
    try { bstIndex = new Set(await (await fetch(R + '/bst/index.json')).json()); } catch { bstIndex = new Set(); }
  });
  return ready;
}

// files: Map path -> string | Uint8Array.  Returns { success, pdf, log, error, syncTexData, ms }.
export async function compileProject(files, mainFile, engine = 'pdflatex') {
  await initEngine();
  const t0 = performance.now();
  const additionalFiles = {};
  for (const [p, c] of files) if (p !== mainFile) additionalFiles[p] = c;
  // BibTeX styles that are not built into the engine are fetched and added to the project.
  const texts = [...files].filter(([p, c]) => typeof c === 'string' && /\.(tex|ltx|sty|cls)$/i.test(p)).map(([, c]) => c).join('\n');
  for (const m of texts.matchAll(/\\bibliographystyle\s*\{([^}]+)\}/g)) {
    const name = m[1].trim(), dir = mainFile.includes('/') ? mainFile.slice(0, mainFile.lastIndexOf('/') + 1) : '';
    if (!files.has(dir + name + '.bst') && bstIndex && bstIndex.has(name)) {
      try { additionalFiles[dir + name + '.bst'] = await bstCache(name); } catch {}
    }
  }
  const opts = { mainFile, engine };
  if (Object.keys(additionalFiles).length) opts.additionalFiles = additionalFiles;
  let r = await compiler.compile(files.get(mainFile), opts);
  // T1-encoded Computer Modern lives in a large optional font bundle (cm-super). Fetch it the first time it is needed.
  if (!r.success && /Font (ec|tc)[a-z]+\d+ at \d+ not found|\(file (ec|tc)[a-z]+\d+\)/.test((r.error || '') + (r.log || '')) && !compiler.__cmsuper) {
    compiler.__cmsuper = true;
    listeners.forEach(f => f('Downloading the cm-super fonts (about 60 MB, one time only)…'));
    compiler.eagerBundles = ['cm-super'];
    try { await compiler.preloadBundles(['cm-super']); } catch {}
    r = await compiler.compile(files.get(mainFile), opts);
  }
  return { ...r, ms: Math.round(performance.now() - t0) };
}
const bsts = new Map();
async function bstCache(name) {
  if (!bsts.has(name)) bsts.set(name, await (await fetch(`${R}/bst/${name}.bst`)).text());
  return bsts.get(name);
}
export const clearEngineCache = async () => { if (compiler) await compiler.clearCache(); };
