// What the model check found last, shared with the visual view (chips on equations) and the Dynare export.
// { result, on(fn) }: result is set by the model-checks module after each run; null while it is off.
const listeners = new Set();
export const modelState = {
  result: null,
  set(r) { this.result = r; for (const f of listeners) { try { f(r); } catch (e) { console.error(e); } } },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
