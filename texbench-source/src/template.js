// The sample project a new user starts with.
export const SAMPLE_MAIN = String.raw`\documentclass[12pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{graphicx}
\usepackage[round]{natbib}
\usepackage[colorlinks=true,allcolors=blue]{hyperref}

\title{A Small New Keynesian Model}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
This sample shows the editor at work. Type on the left; the PDF on the right
updates when you pause. Put the cursor inside an equation and press
\textbf{Ctrl+E} to edit it visually.
\end{abstract}

\section{Model}\label{sec:model}

Households maximise lifetime utility, which gives the dynamic IS curve
\begin{equation}\label{eq:is}
  \hat{y}_t = \mathbb{E}_t \hat{y}_{t+1}
            - \frac{1}{\sigma}\left( \hat{\imath}_t - \mathbb{E}_t \pi_{t+1} \right) + \varepsilon^d_t .
\end{equation}
Firms set prices as in \citet{calvo1983}, which gives the New Keynesian Phillips curve
\begin{equation}\label{eq:nkpc}
  \pi_t = \beta\, \mathbb{E}_t \pi_{t+1} + \kappa\, \hat{y}_t .
\end{equation}
The central bank follows a \citet{taylor1993} rule,
\begin{equation}\label{eq:taylor}
  \hat{\imath}_t = \phi_\pi \pi_t + \phi_y \hat{y}_t + \varepsilon^m_t .
\end{equation}
Equations \eqref{eq:is}--\eqref{eq:taylor} close the model; see \citet{gali2015} for a textbook treatment.

\section{Calibration}

\begin{table}[h]
  \centering
  \begin{tabular}{llc}
    \toprule
    Parameter & Description & Value \\
    \midrule
    $\beta$      & Discount factor            & 0.99 \\
    $\sigma$     & Risk aversion              & 1.00 \\
    $\kappa$     & Slope of the Phillips curve & 0.10 \\
    $\phi_\pi$   & Response to inflation      & 1.50 \\
    $\phi_y$     & Response to output         & 0.125 \\
    \bottomrule
  \end{tabular}
  \caption{Baseline calibration.}\label{tab:calibration}
\end{table}

\bibliographystyle{aer}
\bibliography{references}

\end{document}
`;
export const SAMPLE_BIB = String.raw`@article{calvo1983,
  author  = {Calvo, Guillermo A.},
  title   = {Staggered Prices in a Utility-Maximizing Framework},
  journal = {Journal of Monetary Economics},
  year    = {1983},
  volume  = {12},
  number  = {3},
  pages   = {383--398}
}

@article{taylor1993,
  author  = {Taylor, John B.},
  title   = {Discretion versus Policy Rules in Practice},
  journal = {Carnegie-Rochester Conference Series on Public Policy},
  year    = {1993},
  volume  = {39},
  pages   = {195--214}
}

@book{gali2015,
  author    = {Gal{\'\i}, Jordi},
  title     = {Monetary Policy, Inflation, and the Business Cycle},
  edition   = {2},
  publisher = {Princeton University Press},
  year      = {2015}
}
`;
export const BLANK_MAIN = String.raw`\documentclass[12pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}

\title{Title}
\author{Author}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}

\end{document}
`;
