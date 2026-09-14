# Rating plans

One YAML file per carrier, per state, per effective date. These are **data**:
adding a carrier means adding a file here, never editing Python.

Naming: `{carrier-slug}-{state}-{line}-{effective-date}.yaml`, e.g.
`sample-mutual-ct-ho-2026-01-01.yaml`.

A file only belongs here once it is **verified** — a human has checked every
table against the filing PDF per `docs/verification_checklist.md`, and the
filing's own worked examples reproduce to the cent. Drafts from `extract.py`
stay elsewhere until then; they carry an `UNVERIFIED` marker that makes the
engine refuse to rate with them.

This directory is empty because no real filing has been transcribed yet. Two
synthetic plans live in `tests/fixtures/` and are what `--demo` loads.

When a carrier refiles, add a **new** file and set `expiration_date` on the old
one. Do not edit the old file in place: as-of-date rating needs both versions to
rate a policy written before the change.
