// Stamp the built app with content versions, so a browser never mixes old and new files after an update.
//   node tools/stamp.mjs <app folder>      (the folder that is published, e.g. ../stochatex)
// - index.html: app.css?v=… and core.js?v=…, an import map that gives every module (and its lib/ files) its own
//   ?v=…, and <meta name="stx-version"> with the version of the whole app
// - pdf.html and equation/index.html: their own scripts and styles
// - version.json: { v } — the app compares it with its own version and offers "Reload to update"
// A file's version is a hash of its content, so only files that changed are downloaded again.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const dir = path.resolve(process.argv[2] || 'dist');
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 10);
const stampAttr = (html, attr, file, v) => html.replace(new RegExp(`${attr}="${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?v=[0-9a-f]+)?"`, 'g'), `${attr}="${file}?v=${v}"`);
const all = [];
const walk = (d) => { for (const n of fs.readdirSync(path.join(dir, d))) { const r = path.posix.join(d, n); if (fs.statSync(path.join(dir, r)).isDirectory()) walk(r); else if (/\.js$/.test(n)) all.push(r); } };
walk('modules');
const files = { 'app.css': hash('app.css'), 'core.js': hash('core.js'), 'pdfwin.js': hash('pdfwin.js'), 'engine-worker.js': hash('engine-worker.js'), 'equation/brackets.js': hash('equation/brackets.js'), 'equation/index.html': hash('equation/index.html') };
for (const f of all) files[f] = hash(f);
const appV = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 10);
// index.html
let ix = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ix = stampAttr(stampAttr(ix, 'href', 'app.css', files['app.css']), 'src', 'core.js', files['core.js']);
const map = { imports: Object.fromEntries(all.map(f => ['./' + f, './' + f + '?v=' + files[f]])) };
const block = `<script type="importmap">${JSON.stringify(map)}</script>`;
ix = ix.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '');
ix = ix.replace(/<meta name="stx-version"[^>]*>\n?/, '');
ix = ix.replace('</head>', `<meta name="stx-version" content="${appV}">\n${block}\n</head>`);
fs.writeFileSync(path.join(dir, 'index.html'), ix);
// pdf.html
let pdf = fs.readFileSync(path.join(dir, 'pdf.html'), 'utf8');
fs.writeFileSync(path.join(dir, 'pdf.html'), stampAttr(stampAttr(pdf, 'href', 'app.css', files['app.css']), 'src', 'pdfwin.js', files['pdfwin.js']));
// equation editor page
let eq = fs.readFileSync(path.join(dir, 'equation/index.html'), 'utf8');
fs.writeFileSync(path.join(dir, 'equation/index.html'), stampAttr(eq, 'src', 'brackets.js', files['equation/brackets.js']));
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ v: appV, files }, null, 1) + '\n');
console.log('stamped', dir, 'version', appV, '-', all.length, 'module files');
