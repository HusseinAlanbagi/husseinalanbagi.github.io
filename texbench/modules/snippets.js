// Ready-made blocks: figures, tables, theorems, and the standard equations of DSGE models.
// ${1:text} marks a field: Tab moves to the next one.
const GENERAL = [
  ['Figure', '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=${1:0.8}\\textwidth]{${2:file}}\n  \\caption{${3:Caption}}\\label{fig:${4:name}}\n\\end{figure}'],
  ['Two figures side by side', '\\begin{figure}[htbp]\n  \\centering\n  \\begin{subfigure}{0.48\\textwidth}\n    \\includegraphics[width=\\linewidth]{${1:left}}\n    \\caption{${2:Left}}\n  \\end{subfigure}\\hfill\n  \\begin{subfigure}{0.48\\textwidth}\n    \\includegraphics[width=\\linewidth]{${3:right}}\n    \\caption{${4:Right}}\n  \\end{subfigure}\n  \\caption{${5:Caption}}\\label{fig:${6:name}}\n\\end{figure}', 'needs \\usepackage{subcaption}'],
  ['Table (booktabs)', '\\begin{table}[htbp]\n  \\centering\n  \\begin{tabular}{${1:lcc}}\n    \\toprule\n    ${2:Column 1} & ${3:Column 2} & ${4:Column 3} \\\\\\\\\n    \\midrule\n    ${5} &  &  \\\\\\\\\n    \\bottomrule\n  \\end{tabular}\n  \\caption{${6:Caption}}\\label{tab:${7:name}}\n\\end{table}', 'needs \\usepackage{booktabs}'],
  ['Numbered equation', '\\begin{equation}\\label{eq:${1:name}}\n  ${2}\n\\end{equation}'],
  ['Aligned equations', '\\begin{align}\n  ${1} &= ${2} \\label{eq:${3:name}} \\\\\\\\\n  ${4} &= ${5}\n\\end{align}'],
  ['Bulleted list', '\\begin{itemize}\n  \\item ${1}\n  \\item ${2}\n\\end{itemize}'],
  ['Numbered list', '\\begin{enumerate}\n  \\item ${1}\n  \\item ${2}\n\\end{enumerate}'],
  ['Proposition and proof', '\\begin{proposition}\\label{prop:${1:name}}\n  ${2}\n\\end{proposition}\n\\begin{proof}\n  ${3}\n\\end{proof}', 'needs amsthm and \\newtheorem{proposition}{Proposition}'],
  ['Response to referee comment', '\\paragraph{Comment ${1:1}.} \\textit{${2:The referee’s comment.}}\n\n\\noindent\\textbf{Response.} ${3}\n'],
];
const DSGE = [
  ['Euler equation (consumption)', 'C_t^{-\\sigma} = \\beta \\, \\mathbb{E}_t \\left[ C_{t+1}^{-\\sigma} \\frac{R_t}{\\Pi_{t+1}} \\right]'],
  ['Euler equation (log-linear IS curve)', '\\hat{y}_t = \\mathbb{E}_t \\hat{y}_{t+1} - \\frac{1}{\\sigma} \\left( \\hat{\\imath}_t - \\mathbb{E}_t \\pi_{t+1} \\right)'],
  ['New Keynesian Phillips curve', '\\pi_t = \\beta \\, \\mathbb{E}_t \\pi_{t+1} + \\kappa \\, \\hat{y}_t'],
  ['Hybrid Phillips curve (indexation)', '\\pi_t = \\frac{\\iota}{1 + \\beta \\iota} \\pi_{t-1} + \\frac{\\beta}{1 + \\beta \\iota} \\mathbb{E}_t \\pi_{t+1} + \\frac{(1 - \\theta)(1 - \\beta \\theta)}{\\theta (1 + \\beta \\iota)} \\widehat{mc}_t'],
  ['Calvo price index', 'P_t^{1-\\varepsilon} = \\theta P_{t-1}^{1-\\varepsilon} + (1 - \\theta) \\left( P_t^{*} \\right)^{1-\\varepsilon}'],
  ['Calvo optimal reset price', 'P_t^{*} = \\frac{\\varepsilon}{\\varepsilon - 1} \\, \\frac{\\mathbb{E}_t \\sum_{k=0}^{\\infty} (\\beta \\theta)^k \\Lambda_{t,t+k} \\, MC_{t+k} \\, P_{t+k}^{\\varepsilon} Y_{t+k}}{\\mathbb{E}_t \\sum_{k=0}^{\\infty} (\\beta \\theta)^k \\Lambda_{t,t+k} \\, P_{t+k}^{\\varepsilon - 1} Y_{t+k}}'],
  ['Taylor rule', '\\hat{\\imath}_t = \\rho_i \\hat{\\imath}_{t-1} + (1 - \\rho_i) \\left( \\phi_\\pi \\pi_t + \\phi_y \\hat{y}_t \\right) + \\varepsilon^m_t'],
  ['Household budget constraint', 'P_t C_t + B_t = W_t N_t + R_{t-1} B_{t-1} + D_t - T_t'],
  ['Household problem', '\\max_{\\{C_t, N_t, B_t\\}} \; \\mathbb{E}_0 \\sum_{t=0}^{\\infty} \\beta^t \\left[ \\frac{C_t^{1-\\sigma}}{1-\\sigma} - \\chi \\frac{N_t^{1+\\varphi}}{1+\\varphi} \\right]'],
  ['Labour supply', '\\chi N_t^{\\varphi} C_t^{\\sigma} = \\frac{W_t}{P_t}'],
  ['Production function (Cobb–Douglas)', 'Y_t = A_t K_{t-1}^{\\alpha} N_t^{1-\\alpha}'],
  ['Capital accumulation', 'K_t = (1 - \\delta) K_{t-1} + I_t'],
  ['Capital accumulation with adjustment costs', 'K_t = (1 - \\delta) K_{t-1} + \\left[ 1 - \\frac{\\phi_I}{2} \\left( \\frac{I_t}{I_{t-1}} - 1 \\right)^2 \\right] I_t'],
  ['AR(1) shock', '\\log A_t = \\rho_a \\log A_{t-1} + \\varepsilon^a_t, \\qquad \\varepsilon^a_t \\sim \\mathcal{N}(0, \\sigma_a^2)'],
  ['Market clearing', 'Y_t = C_t + I_t + G_t'],
  ['Fisher equation', '\\hat{\\imath}_t = \\hat{r}_t + \\mathbb{E}_t \\pi_{t+1}'],
  ['Stochastic discount factor', '\\Lambda_{t,t+1} = \\beta \\left( \\frac{C_{t+1}}{C_t} \\right)^{-\\sigma}'],
  ['UIP condition', '\\hat{\\imath}_t - \\hat{\\imath}^{*}_t = \\mathbb{E}_t \\Delta \\hat{e}_{t+1}'],
];
export default {
  id: 'snippets',
  name: 'Snippets',
  description: 'Ready-made blocks from a menu: figures, tables, lists, and standard DSGE equations (Euler, Phillips curve, Calvo, Taylor rule …).',
  category: 'Writing',
  activate(ctx) {
    const inMath = () => {
      const text = ctx.editor.getText().slice(0, ctx.editor.getCursor().pos);
      const opens = (text.match(/\\begin\{(equation|align|gather|multline)\*?\}|\\\[/g) || []).length, closes = (text.match(/\\end\{(equation|align|gather|multline)\*?\}|\\\]/g) || []).length;
      return opens > closes;
    };
    const insertEq = (name, eq) => {
      if (inMath()) return ctx.editor.insert(eq);
      const label = name.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '-');
      ctx.editor.insert(`\\begin{equation}\\label{eq:${label}}\n  ${eq}\n\\end{equation}\n`);
    };
    const general = (tpl) => { // CodeMirror snippet syntax: backslashes are literal, ${n:x} are fields
      ctx.editor.insertSnippet(tpl.replace(/\\\\\\\\/g, '\\\\'));
    };
    const off = ctx.ui.addToolbarButton({ label: 'Snippets', icon: '❏', title: 'Insert a ready-made block', onClick: () => ctx.ui.menu(off.el, [
      { heading: 'DSGE equations' }, ...DSGE.map(([name, eq]) => ({ label: name, onClick: () => insertEq(name, eq) })),
      '-', { heading: 'General' }, ...GENERAL.map(([name, tpl, hint]) => ({ label: name, title: hint || '', onClick: () => general(tpl) })),
    ]) });
    for (const [name, eq] of DSGE) ctx.ui.addCommand({ id: 'snippet.dsge.' + name, name: 'Insert equation: ' + name, run: () => insertEq(name, eq) });
    for (const [name, tpl] of GENERAL) ctx.ui.addCommand({ id: 'snippet.' + name, name: 'Insert: ' + name, run: () => general(tpl) });
  },
};
