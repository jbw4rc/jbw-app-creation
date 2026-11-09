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
export const AGING_META = {"players":394,"playerSeasons":2096,"deltas":1639,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":1.02,"beta":-0.024,"n":6},{"age":20,"alpha":0.881,"beta":-0.027,"n":68},{"age":21,"alpha":0.758,"beta":-0.039,"n":135},{"age":22,"alpha":0.61,"beta":-0.049,"n":173},{"age":23,"alpha":0.47,"beta":-0.04,"n":189},{"age":24,"alpha":0.382,"beta":-0.035,"n":200},{"age":25,"alpha":0.32,"beta":-0.039,"n":165},{"age":26,"alpha":0.235,"beta":-0.037,"n":152},{"age":27,"alpha":0.156,"beta":-0.035,"n":136},{"age":28,"alpha":0.09,"beta":-0.033,"n":106},{"age":29,"alpha":0.002,"beta":-0.036,"n":80},{"age":30,"alpha":-0.083,"beta":-0.034,"n":66},{"age":31,"alpha":-0.18,"beta":-0.024,"n":49},{"age":32,"alpha":-0.295,"beta":-0.024,"n":36},{"age":33,"alpha":-0.3,"beta":-0.029,"n":25},{"age":34,"alpha":-0.245,"beta":-0.021,"n":19},{"age":35,"alpha":-0.398,"beta":-0.005,"n":12},{"age":36,"alpha":-0.698,"beta":-0.001,"n":11},{"age":37,"alpha":-0.811,"beta":-0.002,"n":5},{"age":38,"alpha":-0.657,"beta":0.001,"n":3}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":-3.944,"n":6},{"age":20,"rel":-2.924,"n":68},{"age":21,"rel":-2.07,"n":135},{"age":22,"rel":-1.386,"n":173},{"age":23,"rel":-0.901,"n":189},{"age":24,"rel":-0.553,"n":200},{"age":25,"rel":-0.289,"n":165},{"age":26,"rel":-0.112,"n":152},{"age":27,"rel":-0.019,"n":136},{"age":28,"rel":0,"n":106},{"age":29,"rel":-0.04,"n":80},{"age":30,"rel":-0.179,"n":66},{"age":31,"rel":-0.39,"n":49},{"age":32,"rel":-0.655,"n":36},{"age":33,"rel":-1.029,"n":25},{"age":34,"rel":-1.413,"n":19},{"age":35,"rel":-1.712,"n":12},{"age":36,"rel":-2.121,"n":11},{"age":37,"rel":-2.821,"n":5},{"age":38,"rel":-3.634,"n":3}];
