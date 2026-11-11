// Turn a TeX log into a list of problems: { severity, file, line, message }.
// pdfTeX is run with file:line:error style, so errors look like "./main.tex:12: Undefined control sequence."
// Warnings carry only "on input line N", so the open-file stack is tracked through the log's parentheses.
export function parseLog(log, mainFile, projectFiles) {
  const problems = [], stack = [mainFile];
  const known = new Set(projectFiles);
  const norm = (f) => f.replace(/^\.?\//, '');
  const lines = unwrap(log || '');
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m;
    if ((m = /^(?:\.\/|\/)?([^\s:()]+\.\w+):(\d+): (.*)$/.exec(L))) {
      const msg = m[3], ctx = context(lines, i);
      problems.push({ severity: 'error', file: known.has(norm(m[1])) ? norm(m[1]) : mainFile, line: +m[2], message: msg.replace(/^LaTeX Error: /, '') + (ctx.token && /Undefined control sequence/.test(msg) ? ' ' + ctx.token : ''), ...ctx });
      continue;
    }
    if ((m = /^! (.*)$/.exec(L)) && !/^! ==>/.test(L)) {
      let line = null;
      for (let k = i + 1; k < Math.min(i + 12, lines.length); k++) { const c = /^l\.(\d+)/.exec(lines[k]); if (c) { line = +c[1]; break; } }
      const msg = m[1].replace(/^LaTeX Error: /, ''), ctx = context(lines, i);
      if (!problems.some(p => p.message.startsWith(msg.slice(0, 30)) && p.line === line)) problems.push({ severity: 'error', file: stack[stack.length - 1], line, message: msg + (ctx.token && /Undefined control sequence/.test(msg) ? ' ' + ctx.token : ''), ...ctx });
      continue;
    }
    if ((m = /^(?:LaTeX|Package|Class) (?:(\S+) )?Warning: (.*)$/.exec(L))) {
      let msg = m[2];
      while (i + 1 < lines.length && /^\(\S+\)\s+/.test(lines[i + 1])) msg += ' ' + lines[++i].replace(/^\(\S+\)\s+/, '');
      const ln = /on input line (\d+)/.exec(msg);
      if (/^(There were undefined references|There were undefined citations|Label\(s\) may have changed|There were multiply-defined|Shell escape feature is not enabled)/.test(msg)) continue;
      problems.push({ severity: 'warning', file: stack[stack.length - 1], line: ln ? +ln[1] : null, message: (m[1] ? m[1] + ': ' : '') + msg.replace(/ on input line \d+\.?/, '').trim() });
      continue;
    }
    // BibTeX: "Warning--I didn't find a database entry for "key"" and "I was expecting a `,'---line 5 of file refs.bib"
    if ((m = /^Warning--(.*)$/.exec(L))) { if (!/^(empty|to sort, need)/.test(m[1])) problems.push({ severity: 'warning', file: mainFile, line: null, message: m[1] }); continue; }
    if ((m = /^(.*?)---line (\d+) of file (\S+)/.exec(L))) { const f = norm(m[3]); problems.push({ severity: 'error', file: known.has(f) ? f : [...known].find(k => k.endsWith('/' + f) || k === f + '.bib') || f, line: +m[2], message: m[1].trim() || 'BibTeX error' }); continue; }
    if ((m = /^(Overfull|Underfull) \\hbox .* at lines (\d+)--\d+/.exec(L))) {
      if (m[1] === 'Overfull') problems.push({ severity: 'info', file: stack[stack.length - 1], line: +m[2], message: L.replace(/ in paragraph.*/, '') + ' (text sticks out into the margin)' });
      continue;
    }
    // follow "(file ... )" nesting; anything that is not a project file is pushed as a placeholder
    const re = /\((?:\.\/|\/)?([^\s()]*)|\)/g;
    let t;
    while ((t = re.exec(L))) {
      if (t[0] === ')') { if (stack.length > 1) stack.pop(); }
      else stack.push(known.has(norm(t[1] || '')) ? norm(t[1]) : stack[stack.length - 1]);
    }
  }
  return problems;
}
// The code TeX was reading when it stopped: "l.12 ...text" (and the rest on the next line). The token is the last command.
function context(lines, i) {
  for (let k = i + 1; k < Math.min(i + 12, lines.length); k++) {
    const c = /^l\.\d+ (.*)$/.exec(lines[k]);
    if (c) { const before = c[1].replace(/^\.\.\./, ''), after = (lines[k + 1] || '').trim(); const tok = (/(\\[A-Za-z@]+\*?|\\.)\s*$/.exec(before) || [])[1]; return { context: (before + (after ? ' ' + after : '')).trim(), token: tok || null }; }
  }
  return {};
}
// TeX wraps log lines at 79 characters; glue them back together.
function unwrap(log) {
  const raw = log.split('\n'), out = [];
  for (let i = 0; i < raw.length; i++) {
    let s = raw[i];
    while (s.length >= 79 && raw[i].length === 79 && i + 1 < raw.length) { s += raw[++i]; if (raw[i].length !== 79) break; }
    out.push(s);
  }
  return out;
}
