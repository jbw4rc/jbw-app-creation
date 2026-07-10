import type { DarkoInfo } from '../data/seededDarko';
import { positionGroup } from './position';

// ---------------------------------------------------------------------------
// Player archetype — derived (no public labeled feed exists), from DARKO's
// projected per-100 box line + O/D-DPM + position. A rough, readable role tag to
// give lineup-building context ("3-and-D Wing", "Stretch Big", …).
// ---------------------------------------------------------------------------

export function archetype(d: DarkoInfo | undefined | null): string | null {
  if (!d || !d.box || d.box.fga == null) return null;
  const b = d.box;
  const v = (x: number | null) => x ?? 0;
  const grp = positionGroup(d.pos, d.posNum, d.pos, d.xpos);
  const usage = v(b.fga) + 0.44 * v(b.fta); // shot-creation volume per 100
  const threeRate = v(b.fga) > 0 ? v(b.fg3a) / v(b.fga) : 0;
  const od = d.odpm ?? 0;
  const dd = d.ddpm ?? 0;
  const ast = v(b.ast);
  const fg3a = v(b.fg3a);
  const fg3pct = v(b.fg3pct);
  const fta = v(b.fta);
  const blk = v(b.blk);
  const reb = v(b.reb);

  // Bigs: centers, or forwards who rebound/protect and don't shoot threes (and
  // aren't ball-dominant engines like Giannis).
  const isBig = grp === 'C' || (grp === 'F' && reb >= 10 && fg3a < 3.5 && blk >= 1 && usage < 20);
  if (isBig) {
    if (ast >= 5.5) return 'Playmaking Big';
    if (fg3a >= 4) return 'Stretch Big';
    if (blk >= 1.8 && dd >= 0) return 'Rim Protector';
    return 'Interior Big';
  }

  // Guards & wings
  if (ast >= 7.5 && usage >= 16) return 'Primary Ballhandler';
  if (usage >= 22 && od >= 1.5) return 'Offensive Engine';
  if (grp === 'F' && ast >= 6) return 'Playmaking Forward';
  if (ast >= 4.5) return 'Secondary Ballhandler';
  if (fg3a >= 4.5 && threeRate >= 0.4 && dd >= 0.5 && usage < 20) return '3-and-D Wing';
  if (fg3a >= 6 && fg3pct >= 0.36 && usage < 17) return 'Floor Spacer';
  if (fta >= 5.5 && threeRate < 0.35) return 'Slasher';
  if (fg3a >= 4 && threeRate >= 0.4) return 'Shooter';
  return grp === 'F' ? 'Wing' : 'Combo Guard';
}
