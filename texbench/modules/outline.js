// Document outline: every \section, \subsection … in the project, as a clickable list.
export default {
  id: 'outline',
  name: 'Outline',
  description: 'A clickable list of the sections of your document in the side bar.',
  category: 'Navigation',
  activate(ctx) {
    const LEVEL = { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4 };
    let box, timer;
    const draw = () => {
      if (!box) return;
      const files = ctx.project.files().filter(p => /\.tex$/i.test(p) && ctx.project.isText(p)), main = ctx.project.mainFile;
      files.sort((a, b) => (b === main) - (a === main));
      const rows = [];
      for (const file of files) {
        const text = ctx.project.read(file), lines = text.split('\n');
        lines.forEach((ln, i) => {
          const m = /^[^%]*?\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{(.*)/.exec(ln);
          if (!m) return;
          let title = m[2], depth = 1, end = 0;
          for (; end < title.length; end++) { if (title[end] === '{') depth++; else if (title[end] === '}' && --depth === 0) break; }
          title = title.slice(0, end).replace(/\\label\{[^}]*\}/g, '').replace(/\\[a-zA-Z]+\*?\s*\{([^{}]*)\}/g, '$1').replace(/[{}]/g, '').trim() || '(untitled)';
          rows.push(ctx.h('button', { style: { paddingLeft: 10 + (LEVEL[m[1]] - 1) * 12 + 'px' }, title: `${file}:${i + 1}`, onClick: () => ctx.goto(file, i + 1) }, title));
        });
      }
      box.replaceChildren(...(rows.length ? rows : [ctx.h('p', { class: 'muted', style: { padding: '0 10px' } }, 'No sections yet.')]));
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(draw, 300); };
    ctx.ui.addPanel({ id: 'outline', title: 'Outline', render(el) { el.classList.add('side-list'); box = el; draw(); } });
    ctx.on('change', later); ctx.on('files', later); ctx.on('project', later);
    ctx.onDispose(() => clearTimeout(timer));
  },
};
