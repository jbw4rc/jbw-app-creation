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
export const AGING_META = {"players":463,"playerSeasons":2490,"deltas":1949,"source":"darko.app career histories","survivorBias":true,"model":"per-age WLS delta = alpha + beta*dpm"};
export const AGING_COEFFS: AgingCoeff[] = [{"age":19,"alpha":0.938,"beta":-0.035,"n":6},{"age":20,"alpha":0.799,"beta":-0.044,"n":80},{"age":21,"alpha":0.67,"beta":-0.066,"n":152},{"age":22,"alpha":0.555,"beta":-0.078,"n":185},{"age":23,"alpha":0.446,"beta":-0.054,"n":207},{"age":24,"alpha":0.359,"beta":-0.04,"n":223},{"age":25,"alpha":0.3,"beta":-0.051,"n":192},{"age":26,"alpha":0.198,"beta":-0.047,"n":180},{"age":27,"alpha":0.119,"beta":-0.039,"n":158},{"age":28,"alpha":0.1,"beta":-0.043,"n":129},{"age":29,"alpha":0.004,"beta":-0.045,"n":108},{"age":30,"alpha":-0.129,"beta":-0.039,"n":83},{"age":31,"alpha":-0.187,"beta":-0.044,"n":65},{"age":32,"alpha":-0.234,"beta":-0.049,"n":52},{"age":33,"alpha":-0.256,"beta":-0.049,"n":41},{"age":34,"alpha":-0.286,"beta":-0.046,"n":32},{"age":35,"alpha":-0.484,"beta":-0.027,"n":21},{"age":36,"alpha":-0.745,"beta":-0.003,"n":17},{"age":37,"alpha":-0.91,"beta":0.003,"n":9},{"age":38,"alpha":-0.954,"beta":-0.007,"n":5}];
// Reference talent-blind trajectory (dpm=0), for legends only.
export const AGING_CURVE: AgingPoint[] = [{"age":19,"rel":-3.358,"n":6},{"age":20,"rel":-2.42,"n":80},{"age":21,"rel":-1.663,"n":152},{"age":22,"rel":-1.105,"n":185},{"age":23,"rel":-0.725,"n":207},{"age":24,"rel":-0.422,"n":223},{"age":25,"rel":-0.18,"n":192},{"age":26,"rel":-0.042,"n":180},{"age":27,"rel":0,"n":158},{"age":28,"rel":-0.012,"n":129},{"age":29,"rel":-0.056,"n":108},{"age":30,"rel":-0.2,"n":83},{"age":31,"rel":-0.453,"n":65},{"age":32,"rel":-0.767,"n":52},{"age":33,"rel":-1.128,"n":41},{"age":34,"rel":-1.494,"n":32},{"age":35,"rel":-1.865,"n":21},{"age":36,"rel":-2.39,"n":17},{"age":37,"rel":-3.138,"n":9},{"age":38,"rel":-4.047,"n":5}];
