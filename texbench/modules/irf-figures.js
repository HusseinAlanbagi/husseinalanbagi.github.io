// Impulse-response figures. Opens the IRF plotter on your Dynare results (.mat or .csv), and puts the
// finished figure into the document as pgfplots code, so the fonts match the paper.
import { ensurePackages } from './dynare.js';

export default {
  id: 'irf-figures',
  name: 'IRF figures',
  description: 'Build impulse-response figures from Dynare results (.mat or .csv) and insert them as pgfplots code that matches the fonts of the paper.',
  category: 'DSGE',
  activate(ctx) {
    const open = () => {
      const at = ctx.editor.getCursor().pos, file = ctx.project.activeFile;
      let frame, done = false;
      const data = ctx.project.files().filter(p => /\.(mat|csv)$/i.test(p));
      const m = ctx.ui.modal({
        title: 'IRF figure', wide: 'full',
        body(el) { frame = ctx.h('iframe', { src: new URL('./irf/index.html?embed', document.baseURI).href, title: 'IRF plotter', style: { border: '0', width: '100%', height: '100%', flex: '1' } }); el.append(frame); },
        onClose() { removeEventListener('message', onMsg); ctx.editor.focus(); },
      });
      const post = (msg) => frame.contentWindow.postMessage({ target: 'irf-plotter', ...msg }, location.origin);
      const onMsg = (e) => {
        if (e.origin !== location.origin || e.source !== frame.contentWindow || e.data?.source !== 'irf-plotter') return;
        if (e.data.type === 'ready') {
          post({ type: 'theme', theme: document.documentElement.dataset.theme });
          // data files already in the project are loaded straight away
          if (data.length) post({ type: 'files', files: data.map(p => { const c = ctx.project.read(p); return { name: p.split('/').pop(), bytes: typeof c === 'string' ? new TextEncoder().encode(c) : c }; }) });
        } else if (e.data.type === 'cancel') m.close();
        else if (e.data.type === 'apply' && !done) {
          done = true; m.close();
          const { code, csv } = e.data;
          if (csv && csv.text) ctx.project.write(csv.name, csv.text);
          if (!/\.tex$/i.test(file || '')) ctx.project.open(ctx.project.mainFile);
          ctx.editor.replaceRange(at, at, '\n' + code.trim() + '\n');
          const src = ctx.project.read(ctx.project.mainFile) || '';
          const added = ensurePackages(ctx, ['pgfplots'], [/\\begin\{groupplot\}/.test(code) ? '\\usepgfplotslibrary{groupplots}' : null, /\\pgfplotsset\{[^}]*compat/.test(src) ? null : '\\pgfplotsset{compat=1.18}'].filter(Boolean));
          ctx.ui.toast('Figure inserted.' + (csv && csv.text ? ` Data saved as ${csv.name}.` : '') + (added.length ? ' pgfplots was added to the preamble.' : ''));
        }
      };
      addEventListener('message', onMsg);
    };
    ctx.ui.addToolbarButton({ label: 'IRF figure', icon: '∿', title: 'Build an impulse-response figure from Dynare results and insert it', onClick: open });
    ctx.ui.addCommand({ id: 'irf.figure', name: 'Insert an IRF figure', run: open });
  },
};
