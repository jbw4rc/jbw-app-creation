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
export const AGING_PEAK_AGE = 27;
export const AGING_META = {"players":441,"playerSeasons":2401,"deltas":1893,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":0.985,"beta":-0.04,"n":6},{"age":20,"alpha":0.826,"beta":-0.051,"n":77},{"age":21,"alpha":0.678,"beta":-0.073,"n":144},{"age":22,"alpha":0.558,"beta":-0.081,"n":181},{"age":23,"alpha":0.455,"beta":-0.053,"n":202},{"age":24,"alpha":0.373,"beta":-0.042,"n":217},{"age":25,"alpha":0.314,"beta":-0.053,"n":185},{"age":26,"alpha":0.207,"beta":-0.047,"n":176},{"age":27,"alpha":0.127,"beta":-0.038,"n":156},{"age":28,"alpha":0.104,"beta":-0.045,"n":125},{"age":29,"alpha":0.005,"beta":-0.051,"n":105},{"age":30,"alpha":-0.125,"beta":-0.047,"n":82},{"age":31,"alpha":-0.181,"beta":-0.05,"n":66},{"age":32,"alpha":-0.232,"beta":-0.05,"n":50},{"age":33,"alpha":-0.278,"beta":-0.049,"n":40},{"age":34,"alpha":-0.321,"beta":-0.048,"n":31},{"age":35,"alpha":-0.504,"beta":-0.026,"n":19},{"age":36,"alpha":-0.763,"beta":-0.005,"n":16},{"age":37,"alpha":-0.868,"beta":0.002,"n":8},{"age":38,"alpha":-0.696,"beta":-0.001,"n":4}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":-3.431,"n":6},{"age":20,"rel":-2.446,"n":77},{"age":21,"rel":-1.671,"n":144},{"age":22,"rel":-1.121,"n":181},{"age":23,"rel":-0.75,"n":202},{"age":24,"rel":-0.437,"n":217},{"age":25,"rel":-0.19,"n":185},{"age":26,"rel":-0.048,"n":176},{"age":27,"rel":0,"n":156},{"age":28,"rel":-0.003,"n":125},{"age":29,"rel":-0.054,"n":105},{"age":30,"rel":-0.221,"n":82},{"age":31,"rel":-0.497,"n":66},{"age":32,"rel":-0.825,"n":50},{"age":33,"rel":-1.187,"n":40},{"age":34,"rel":-1.575,"n":31},{"age":35,"rel":-1.985,"n":19},{"age":36,"rel":-2.527,"n":16},{"age":37,"rel":-3.294,"n":8},{"age":38,"rel":-4.162,"n":4}];
