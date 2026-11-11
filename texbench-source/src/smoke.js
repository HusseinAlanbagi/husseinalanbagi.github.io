import { SiglumCompiler } from '@siglum/engine';
const R = new URL('./runtime', location.href).href;
window.mk = async (opts={}) => { const c = new SiglumCompiler({ workerUrl: new URL('./engine-worker.js', location.href).href, wasmUrl: R + '/wasm/busytex.wasm', bundlesUrl: R + '/bundles', ctanProxyUrl: R, xzwasmUrl: R + '/xzwasm.js', onLog: m => (window.logs ||= []).push(m), ...opts }); await c.init(); window.c = c; return true; };
