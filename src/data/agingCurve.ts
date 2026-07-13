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
export const AGING_PEAK_AGE = 19;
export const AGING_META = {"players":0,"playerSeasons":0,"deltas":0,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":0,"beta":0,"n":0},{"age":20,"alpha":0,"beta":0,"n":0},{"age":21,"alpha":0,"beta":0,"n":0},{"age":22,"alpha":0,"beta":0,"n":0},{"age":23,"alpha":0,"beta":0,"n":0},{"age":24,"alpha":0,"beta":0,"n":0},{"age":25,"alpha":0,"beta":0,"n":0},{"age":26,"alpha":0,"beta":0,"n":0},{"age":27,"alpha":0,"beta":0,"n":0},{"age":28,"alpha":0,"beta":0,"n":0},{"age":29,"alpha":0,"beta":0,"n":0},{"age":30,"alpha":0,"beta":0,"n":0},{"age":31,"alpha":0,"beta":0,"n":0},{"age":32,"alpha":0,"beta":0,"n":0},{"age":33,"alpha":0,"beta":0,"n":0},{"age":34,"alpha":0,"beta":0,"n":0},{"age":35,"alpha":0,"beta":0,"n":0},{"age":36,"alpha":0,"beta":0,"n":0},{"age":37,"alpha":0,"beta":0,"n":0},{"age":38,"alpha":0,"beta":0,"n":0}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":0,"n":0},{"age":20,"rel":0,"n":0},{"age":21,"rel":0,"n":0},{"age":22,"rel":0,"n":0},{"age":23,"rel":0,"n":0},{"age":24,"rel":0,"n":0},{"age":25,"rel":0,"n":0},{"age":26,"rel":0,"n":0},{"age":27,"rel":0,"n":0},{"age":28,"rel":0,"n":0},{"age":29,"rel":0,"n":0},{"age":30,"rel":0,"n":0},{"age":31,"rel":0,"n":0},{"age":32,"rel":0,"n":0},{"age":33,"rel":0,"n":0},{"age":34,"rel":0,"n":0},{"age":35,"rel":0,"n":0},{"age":36,"rel":0,"n":0},{"age":37,"rel":0,"n":0},{"age":38,"rel":0,"n":0}];
