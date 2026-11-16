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
export const AGING_META = {"players":396,"playerSeasons":2110,"deltas":1651,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":1.031,"beta":-0.023,"n":6},{"age":20,"alpha":0.877,"beta":-0.028,"n":68},{"age":21,"alpha":0.752,"beta":-0.04,"n":135},{"age":22,"alpha":0.61,"beta":-0.05,"n":173},{"age":23,"alpha":0.47,"beta":-0.043,"n":189},{"age":24,"alpha":0.383,"beta":-0.038,"n":201},{"age":25,"alpha":0.326,"beta":-0.039,"n":166},{"age":26,"alpha":0.232,"beta":-0.036,"n":154},{"age":27,"alpha":0.147,"beta":-0.037,"n":137},{"age":28,"alpha":0.085,"beta":-0.035,"n":107},{"age":29,"alpha":0.004,"beta":-0.036,"n":81},{"age":30,"alpha":-0.072,"beta":-0.034,"n":66},{"age":31,"alpha":-0.163,"beta":-0.026,"n":51},{"age":32,"alpha":-0.288,"beta":-0.028,"n":37},{"age":33,"alpha":-0.305,"beta":-0.03,"n":26},{"age":34,"alpha":-0.231,"beta":-0.022,"n":20},{"age":35,"alpha":-0.394,"beta":-0.006,"n":12},{"age":36,"alpha":-0.73,"beta":0.001,"n":11},{"age":37,"alpha":-0.836,"beta":0,"n":5},{"age":38,"alpha":-0.685,"beta":0,"n":3}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":-3.913,"n":6},{"age":20,"rel":-2.882,"n":68},{"age":21,"rel":-2.034,"n":135},{"age":22,"rel":-1.357,"n":173},{"age":23,"rel":-0.875,"n":189},{"age":24,"rel":-0.536,"n":201},{"age":25,"rel":-0.281,"n":166},{"age":26,"rel":-0.097,"n":154},{"age":27,"rel":-0.002,"n":137},{"age":28,"rel":0,"n":107},{"age":29,"rel":-0.052,"n":81},{"age":30,"rel":-0.187,"n":66},{"age":31,"rel":-0.386,"n":51},{"age":32,"rel":-0.64,"n":37},{"age":33,"rel":-1.02,"n":26},{"age":34,"rel":-1.412,"n":20},{"age":35,"rel":-1.698,"n":12},{"age":36,"rel":-2.105,"n":11},{"age":37,"rel":-2.833,"n":5},{"age":38,"rel":-3.669,"n":3}];
