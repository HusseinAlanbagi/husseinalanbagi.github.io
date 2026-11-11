// Build: bundle the core, copy static files, modules, the TeX runtime wiring and vendor libraries into dist/.
import { build } from 'esbuild'; import fs from 'node:fs'; import path from 'node:path';
const out = process.argv[2] || 'dist';
fs.mkdirSync(out + '/vendor', { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', outfile: out + '/core.js', minify: !process.argv.includes('--dev'), sourcemap: false, target: 'es2022',
  alias: { 'blake3-wasm/browser.js': './src/blake3-disabled.js' }, define: { global: 'globalThis' }, legalComments: 'none', logLevel: 'warning' });
await build({ entryPoints: ['src/pdfwin.js'], bundle: true, format: 'esm', outfile: out + '/pdfwin.js', minify: !process.argv.includes('--dev'), target: 'es2022', legalComments: 'none', logLevel: 'warning' });
fs.cpSync('static', out, { recursive: true });
fs.copyFileSync('node_modules/@siglum/engine/src/worker.js', out + '/engine-worker.js');
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync('node_modules/pdfjs-dist/build/' + f, out + '/vendor/' + f);
const mods = fs.readdirSync('static/modules').filter(f => f.endsWith('.js')).sort();
fs.writeFileSync(out + '/modules/index.json', JSON.stringify(mods, null, 1));
console.log('built', out, '-', (fs.statSync(out + '/core.js').size / 1024).toFixed(0) + ' KB core,', mods.length, 'modules');
