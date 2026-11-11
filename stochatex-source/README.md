# StochaTeX source

The built app is in `../stochatex/`. This folder holds what is needed to rebuild `core.js`.

- `src/` — the core (editor, compile, preview, module host). Bundled into `stochatex/core.js`.
- Modules, styles, the equation editor and the IRF plotter are plain files and live only in `../stochatex/`
  (`modules/`, `app.css`, `index.html`, `equation/`, `irf/`). Edit them there.
- `tools/build_packages.py` — builds the on-demand TeX package archives from a TeX Live install.
- `t_*.mjs` — browser tests (need Chrome and `node serve.mjs`).

Rebuild: `npm install`, copy `../stochatex` (without `core.js`, `runtime/`, `vendor/`) to `static/`, then `node build.mjs`.
The TeX runtime in `../stochatex/runtime/` is not rebuilt by this script.
