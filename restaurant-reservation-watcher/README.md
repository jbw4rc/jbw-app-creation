# Reservation Watcher

Watches Cru (Resy) and The Nautilus (OpenTable) in Nantucket for open tables
and pushes a phone notification the instant one appears. It **only alerts —
it never books**. You still tap the link and finish the reservation
yourself. That's deliberate: both platforms prohibit automated booking bots
in their terms of service, and reliably auto-booking would mean working
around their bot detection, which isn't something this tool does.

Runs as a scheduled GitHub Action (`.github/workflows/reservation-watch.yml`)
every 10 minutes, on GitHub's own servers — no laptop, phone, or VPS needed.

## How it works

- **Cru** — checked via Resy's anonymous "find" API (the same one resy.com's
  own site calls when you browse without logging in).
- **The Nautilus** — checked by loading its public OpenTable page in a
  headless browser and reading the visible time-slot buttons, since
  OpenTable doesn't expose a stable public API and is more aggressive about
  blocking plain HTTP bot traffic.
- Each run diffs "currently open" against last run's state and alerts only
  what's *newly* open, so you're not re-notified for a slot that's been open
  the whole time. If a slot closes and later reopens, that counts as new
  again — each reopening is a fresh shot at it.

## One-time setup

Notifications go through [ntfy.sh](https://ntfy.sh) — a free push
notification service with **no account, no signup, no API keys**. You pick
a topic name (like a password only you know) and that's the entire setup.

### 1. Install the ntfy app

Install **ntfy** from the App Store (iOS) or Play Store (Android).

### 2. Pick a topic name and subscribe

Open the app, tap "Subscribe to topic," and enter a long, hard-to-guess
name — anyone who knows your topic name can send to it, since ntfy.sh's
public server has no login. Don't use anything guessable like
"cru-nantucket." A ready-made suggestion:

```
nantucket-res-3472b1de
```

(Feel free to use that exact one, or make up your own random string.)

### 3. Add the repo secret

In this repo on GitHub: **Settings → Secrets and variables → Actions → New
repository secret**. Add one secret (doable from a phone browser):

| Secret | Value |
|---|---|
| `NTFY_TOPIC` | the topic name you subscribed to, e.g. `nantucket-res-3472b1de` |

### 4. Merge to main

Scheduled (`cron`) triggers only fire off the repo's **default branch**.
Until this is merged, the workflow exists but won't run on schedule — you
can still test it manually via the "Run workflow" button on the
**Actions → Reservation watcher** tab (`workflow_dispatch`). Once merged,
it runs automatically every 10 minutes.

### 5. Test it

From the Actions tab, click "Run workflow" once. Check the run's log for a
line like `checked 2 watch(es), N open slot(s), 0 new` — 0 new is expected
on the first run (it has nothing to diff against yet), but confirms both
checkers ran without erroring. To confirm a notification actually lands on
your phone, you can send yourself a test push directly — open a browser and
visit:

```
https://ntfy.sh/nantucket-res-3472b1de?message=test
```

(swap in your real topic) — it should pop up on your phone within seconds
if the app is subscribed.

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

export NTFY_TOPIC=nantucket-res-3472b1de

# runs one check; loop it yourself (cron, systemd timer, etc.)
python check_once.py
```
