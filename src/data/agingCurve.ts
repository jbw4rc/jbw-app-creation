// AUTO-GENERATED talent-aware NBA aging curve (DARKO DPM career histories).
// Regenerate: node scripts/build-aging-curve.mjs
//
// Model: for each age we fit  Δdpm = alpha(age) + beta(age)*dpm  by weighted
// least squares over consecutive-season pairs. alpha = a typical player's
// yearly change at that age; beta = the talent slope (extra change per point
// of current DPM). Project a player forward by iterating the recursion with
// HIS OWN current DPM, so higher-talent young players develop more (and stars
// mean-revert) straight from the data — no hand-set tiers.
// CAVEAT: survivor-biased sample (current DARKO players' careers).
export interface AgingCoeff { age: number; alpha: number; beta: number; n: number; }
export interface AgingPoint { age: number; rel: number; n: number; }
export const AGING_PEAK_AGE = 28;
export const AGING_META = {"players":399,"playerSeasons":2154,"deltas":1691,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":1.04,"beta":-0.017,"n":8},{"age":20,"alpha":0.88,"beta":-0.028,"n":69},{"age":21,"alpha":0.75,"beta":-0.04,"n":136},{"age":22,"alpha":0.609,"beta":-0.05,"n":178},{"age":23,"alpha":0.469,"beta":-0.043,"n":192},{"age":24,"alpha":0.383,"beta":-0.038,"n":201},{"age":25,"alpha":0.326,"beta":-0.039,"n":170},{"age":26,"alpha":0.231,"beta":-0.036,"n":157},{"age":27,"alpha":0.145,"beta":-0.036,"n":140},{"age":28,"alpha":0.084,"beta":-0.034,"n":112},{"age":29,"alpha":0.004,"beta":-0.036,"n":85},{"age":30,"alpha":-0.071,"beta":-0.034,"n":69},{"age":31,"alpha":-0.16,"beta":-0.026,"n":53},{"age":32,"alpha":-0.286,"beta":-0.028,"n":38},{"age":33,"alpha":-0.308,"beta":-0.031,"n":27},{"age":34,"alpha":-0.234,"beta":-0.023,"n":20},{"age":35,"alpha":-0.394,"beta":-0.006,"n":12},{"age":36,"alpha":-0.733,"beta":-0.001,"n":11},{"age":37,"alpha":-0.828,"beta":-0.003,"n":6},{"age":38,"alpha":-0.684,"beta":0.003,"n":4}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":-3.92,"n":8},{"age":20,"rel":-2.88,"n":69},{"age":21,"rel":-2.029,"n":136},{"age":22,"rel":-1.355,"n":178},{"age":23,"rel":-0.874,"n":192},{"age":24,"rel":-0.536,"n":201},{"age":25,"rel":-0.282,"n":170},{"age":26,"rel":-0.097,"n":157},{"age":27,"rel":-0.004,"n":140},{"age":28,"rel":0,"n":112},{"age":29,"rel":-0.049,"n":85},{"age":30,"rel":-0.185,"n":69},{"age":31,"rel":-0.383,"n":53},{"age":32,"rel":-0.635,"n":38},{"age":33,"rel":-1.013,"n":27},{"age":34,"rel":-1.411,"n":20},{"age":35,"rel":-1.702,"n":12},{"age":36,"rel":-2.11,"n":11},{"age":37,"rel":-2.845,"n":6},{"age":38,"rel":-3.676,"n":4}];
