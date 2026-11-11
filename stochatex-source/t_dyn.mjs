import { parseMod, modelToLatex, variableTable, parameterTable, texName } from './static/modules/lib/dynare.js';
export const MOD = `// RBC + NK bits
var y $y$ (long_name='output'), c, k, inv, n, a, pi, r_nom, c_hat;
varexo eps_a eps_m;
parameters alpha beta delta rho_a sigma phi_pi SIGMA_E;
alpha = 0.33; beta = 0.99; // discount
delta = 0.025; rho_a = 0.95; sigma = 2; phi_pi = 1.5; SIGMA_E = 1/(1+alpha);
model;
[name='Euler equation']
c^(-sigma) = beta*c(+1)^(-sigma)*(alpha*a(+1)*k^(alpha-1)*n(+1)^(1-alpha) + 1 - delta);
[name='Production']
y = a*k(-1)^alpha*n^(1-alpha);
k = (1-delta)*k(-1) + inv;
y = c + inv;
log(a) = rho_a*log(a(-1)) + eps_a;
pi = beta*pi(+1) + 0.1*(y - STEADY_STATE(y));
r_nom = phi_pi*pi + eps_m - (c_hat(+1) - c_hat)/sigma;
n = exp(-c)/sqrt(y) + abs(k)*2;
end;
steady_state_model; a = 1; end;
shocks; var eps_a; stderr 0.01; end;
`;
const m = parseMod(MOD);
console.log(m.vars.map(v => v.name).join(' '), '|', m.exo.map(v => v.name).join(' '), '|', m.params.map(p => p.name + '=' + p.value).join(' '));
console.log(modelToLatex(m)); console.log(modelToLatex(m, { expectations: false, separate: true }).split('\n').slice(0, 4).join('\n'));
console.log(parameterTable(m)); console.log(variableTable(m).split('\n').slice(6, 9).join('\n'));
console.log(['rho_a', 'eps_a', 'c_hat', 'inv', 'r_nom', 'Y_ss', 'c1', 'PI', 'w_h_tilde'].map(n => JSON.stringify(texName(n))).join(' '));
