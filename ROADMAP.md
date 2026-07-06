# Roadmap / Notes

Queued ideas, not yet built.

## In-season rotation anchoring
Right now (offseason) rotation minutes are seeded from DARKO's projected
`x_minutes`. Once the season starts, anchor the seed to **actual rotations**:

- Pull trailing actual minutes (last ~10–15 games) via a new GitHub Action —
  DARKO game logs, NBA Stats, or Basketball-Reference.
- **Blend** rather than hard-switch: weight actuals by `games_played / 15` so
  early-season noise doesn't cause a Game-1 overreaction; crossfade to actuals
  as the sample grows.
- Optional **toggle**: "Projected role" vs "Actual (last N games)" so the user
  can compare what a team *is* doing vs what the model expects.
- Caveats: single games are noisy (foul trouble, blowouts, back-to-backs);
  injuries should not zero out a star's season role — hence the trailing window.

Note: DARKO's `x_minutes` already recomputes daily in-season, so the app drifts
toward reality on its own even before this is built.
