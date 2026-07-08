// A shared 0–100 → letter-grade scale, used by the financial-flexibility and
// draft-asset assessments so their grades read on one consistent curve.

export type GradeTone = 'strength' | 'solid' | 'weak';

export interface Grade {
  letter: string; // A+ … F
  score: number; // 0..100
  tone: GradeTone; // strength (green) / solid (neutral) / weak (red)
}

const BANDS: [min: number, letter: string][] = [
  [95, 'A+'], [88, 'A'], [82, 'A−'],
  [76, 'B+'], [70, 'B'], [64, 'B−'],
  [58, 'C+'], [52, 'C'], [46, 'C−'],
  [40, 'D+'], [34, 'D'], [28, 'D−'],
  [0, 'F'],
];

export function toGrade(score: number): Grade {
  const s = Math.max(0, Math.min(100, score));
  const letter = BANDS.find(([min]) => s >= min)![1];
  const tone: GradeTone = s >= 64 ? 'strength' : s <= 45 ? 'weak' : 'solid';
  return { letter, score: s, tone };
}
