// AUTO-GENERATED empirical NBA aging curve (delta method on DARKO DPM history).
// Regenerate: node scripts/build-aging-curve.mjs
// Units: DARKO DPM (pts/100 poss). 'rel' = expected DPM at that age vs peak (<=0).
// 'delta' = year-over-year DPM change entering the next age.
// CAVEAT: survivor-biased sample (current DARKO players' careers). v1 = single
// talent-blind curve; talent-bucketing is a planned follow-up.
export interface AgingPoint { age: number; delta: number; rel: number; n: number; }
export const AGING_PEAK_AGE = 29;
export const AGING_META = {"players":463,"playerSeasons":2490,"deltas":1949,"source":"darko.app career histories","survivorBias":true};
export const AGING_CURVE: AgingPoint[] = [{"age":19,"delta":1.277,"rel":-4.815,"n":6},{"age":20,"delta":1.004,"rel":-3.538,"n":80},{"age":21,"delta":0.724,"rel":-2.534,"n":152},{"age":22,"delta":0.563,"rel":-1.81,"n":185},{"age":23,"delta":0.438,"rel":-1.246,"n":207},{"age":24,"delta":0.334,"rel":-0.808,"n":223},{"age":25,"delta":0.252,"rel":-0.474,"n":192},{"age":26,"delta":0.138,"rel":-0.222,"n":180},{"age":27,"delta":0.061,"rel":-0.084,"n":158},{"age":28,"delta":0.023,"rel":-0.023,"n":129},{"age":29,"delta":-0.092,"rel":0,"n":108},{"age":30,"delta":-0.202,"rel":-0.092,"n":83},{"age":31,"delta":-0.258,"rel":-0.294,"n":65},{"age":32,"delta":-0.32,"rel":-0.553,"n":52},{"age":33,"delta":-0.34,"rel":-0.873,"n":41},{"age":34,"delta":-0.394,"rel":-1.213,"n":32},{"age":35,"delta":-0.567,"rel":-1.608,"n":21},{"age":36,"delta":-0.778,"rel":-2.175,"n":17},{"age":37,"delta":-0.923,"rel":-2.952,"n":9},{"age":38,"delta":-0.937,"rel":-3.875,"n":5}];
