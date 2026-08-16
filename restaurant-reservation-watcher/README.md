# Reservation Watcher

Watches Cru (Resy) and The Nautilus (OpenTable) in Nantucket for open tables
and texts you the instant one appears. It **only alerts — it never books**.
You still tap the link and finish the reservation yourself. That's
deliberate: both platforms prohibit automated booking bots in their terms of
service, and reliably auto-booking would mean working around their bot
detection, which isn't something this tool does.

Runs as a scheduled GitHub Action (`.github/workflows/reservation-watch.yml`)
every 10 minutes, on GitHub's own servers — no laptop, phone, or VPS needed.

## How it works

- **Cru** — checked via Resy's anonymous "find" API (the same one resy.com's
  own site calls when you browse without logging in).
- **The Nautilus** — checked by loading its public OpenTable page in a
  headless browser and reading the visible time-slot buttons, since
  OpenTable doesn't expose a stable public API and is more aggressive about
  blocking plain HTTP bot traffic.
- Each run diffs "currently open" against last run's state and texts only
  what's *newly* open, so you're not re-texted for a slot that's been open
  the whole time. If a slot closes and later reopens, that counts as new
  again — each reopening is a fresh shot at it.

## One-time setup

### 1. Twilio (for the text messages)

1. Create a free account at twilio.com (trial includes credit).
2. Buy/claim a Twilio phone number (trial accounts get one).
3. From the Twilio console, grab your **Account SID** and **Auth Token**.

### 2. Add repo secrets

In this repo on GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Add these four (all doable from a phone browser):

| Secret | Value |
|---|---|
| `TWILIO_ACCOUNT_SID` | from Twilio console |
| `TWILIO_AUTH_TOKEN` | from Twilio console |
| `TWILIO_FROM_NUMBER` | your Twilio number, e.g. `+15551234567` |
| `TWILIO_TO_NUMBER` | your cell number, e.g. `+15559876543` |

### 3. Merge to main

Scheduled (`cron`) triggers only fire off the repo's **default branch**.
Until this is merged, the workflow exists but won't run on schedule — you
can still test it manually via the "Run workflow" button on the
**Actions → Reservation watcher** tab (`workflow_dispatch`). Once merged,
it runs automatically every 10 minutes.

### 4. Test the SMS wiring

From the Actions tab, click "Run workflow" once. Check the run's log for a
line like `checked 2 watch(es), N open slot(s), 0 new` — 0 new is expected
on the first run (it has nothing to diff against yet), but confirms both
checkers ran without erroring. If you want to confirm the text itself
works, temporarily delete `state.json` from the cache (or just wait for a
real slot to open) — or run `check_once.py` locally with a real Twilio env
and an empty `state.json` to trigger a test alert.

## Changing what's watched

Edit `config.yaml` — dates, party sizes, or add/remove restaurants — and
commit. Currently watching Cru and The Nautilus for **Wed–Fri, Aug 26–28,
2026**, party sizes 2–5.

## Known fragility

- **Resy**: uses a public API key embedded in Resy's own web client. If
  Resy rotates it, calls start returning 401 — grab a fresh key from your
  browser's dev tools (Network tab → any `api.resy.com` request →
  `Authorization` header) and swap it into `checkers/resy.py`.
- **OpenTable**: scrapes rendered HTML via a headless browser, since there's
  no stable API to call. If `find_slots()` ever returns 0 results for a
  date you know is wide open, that likely means OpenTable changed its page
  structure rather than the restaurant actually being full. Set
  `WATCHER_DEBUG=1` as a workflow env var to dump the rendered page HTML as
  a debug artifact and check whether the `data-test` selectors in
  `checkers/opentable.py` still match.
- **Timing**: GitHub Actions cron is best-effort and can lag a few minutes
  during high load. Good for catching cancellations over hours/days; not a
  guarantee of sub-second reaction time.

## Running locally instead

If you ever want tighter polling (e.g. on a VPS you control) rather than
the 10-minute GitHub Actions cadence:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

export TWILIO_ACCOUNT_SID=...
export TWILIO_AUTH_TOKEN=...
export TWILIO_FROM_NUMBER=+1...
export TWILIO_TO_NUMBER=+1...

# runs one check; loop it yourself (cron, systemd timer, etc.)
python check_once.py
```
