import { open } from './t_app.mjs';
const { b, p, errs } = await open();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
await p.waitForSelector('body.ready', { timeout: 30000 }); await sleep(800);
const doc = String.raw`\documentclass{article}
\usepackage[en-GB]{datetime2}
\title{T}\author{A}\date{\today}
\begin{document}
\maketitle
Today: \today.
\end{document}
`;
await p.evaluate((d) => window.texbench.app.project.write('main.tex', d, { open: true }), doc);
await p.evaluate(() => window.texbench.app.compile()); await sleep(20000);
console.log('log:', await p.evaluate(() => (window.texbench.app.lastResult?.log || '').split('\n').filter(l => /datetime|warning|Warning|tracklang|english/i.test(l)).slice(0, 12).join('\n')));
console.log('status', await p.$eval('#status', e => e.textContent));
await (await p.$('#pdf')).screenshot({ path: '/tmp/date3.png' });
await b.close();
