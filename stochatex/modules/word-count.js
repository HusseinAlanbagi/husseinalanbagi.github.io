// Word count in the status area: the open file, and the whole document.
export default {
  id: 'word-count',
  name: 'Word count',
  description: 'Shows the number of words in the open file and in the whole project (text only; commands, maths and comments are left out).',
  category: 'Writing',
  activate(ctx) {
    const count = (tex) => {
      let t = tex.replace(/(^|[^\\])%.*$/gm, '$1');
      const doc = t.indexOf('\\begin{document}'); if (doc >= 0) t = t.slice(doc + 16);
      t = t.replace(/\\begin\{(equation|align|gather|multline|eqnarray|displaymath|tikzpicture|figure|table|thebibliography|verbatim|lstlisting)\*?\}[\s\S]*?\\end\{\1\*?\}/g, ' ')
        .replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([\s\S]*?\\\)/g, ' ')
        .replace(/\\(?:label|ref|eqref|cref|cite[a-z]*|input|include|includegraphics|bibliography|bibliographystyle|usepackage|documentclass|begin|end|vspace|hspace)\*?(?:\[[^\]]*\])*\{[^{}]*\}/g, ' ')
        .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}~\\]/g, ' ');
      return (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    };
    let el, timer;
    const draw = () => {
      if (!el) return;
      const a = ctx.project.activeFile;
      const here = a && /\.tex$/i.test(a) && ctx.project.isText(a) ? count(ctx.project.read(a)) : null;
      const all = ctx.project.files().filter(p => /\.tex$/i.test(p) && ctx.project.isText(p)).reduce((n, p) => n + count(ctx.project.read(p)), 0);
      el.textContent = here == null ? `${all.toLocaleString()} words in project` : here === all ? `${all.toLocaleString()} words` : `${here.toLocaleString()} words here · ${all.toLocaleString()} in project`;
      el.title = 'Words of text. Commands, maths, comments, figures and tables are not counted.';
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(draw, 500); };
    ctx.ui.addStatusItem((e) => { el = e; draw(); });
    ['change', 'open', 'files', 'project'].forEach(n => ctx.on(n, later));
    ctx.onDispose(() => clearTimeout(timer));
  },
};
