"""
Single-pass availability check across every watch in config.yaml.

Designed to be invoked on a schedule (GitHub Actions cron every 10 min) --
NOT as a long-running loop. Each run:
  1. Checks every configured restaurant/date/party-size combination.
  2. Diffs the currently-open slots against the previous run's state.json.
  3. Pushes an alert (via ntfy.sh) only for slots that are newly open since last run.
  4. Saves the current open-slot set as the new state.

This means it re-alerts if a slot closes and later reopens -- each
appearance is a fresh chance, not just the first one ever seen.
"""
import sys
import traceback
from datetime import datetime

import yaml

from checkers import resy, opentable
from notify import send_alert
from state import load_open_slots, save_open_slots, slot_key


def check_watch(watch: dict) -> list[dict]:
    found = []
    if watch["platform"] == "resy":
        venue_id = resy.get_venue_id(watch["venue_slug"], watch["location"])
        for date in watch["dates"]:
            for size in watch["party_sizes"]:
                for slot in resy.find_slots(venue_id, date, size):
                    slot["restaurant"] = watch["name"]
                    found.append(slot)

    elif watch["platform"] == "opentable":
        for date in watch["dates"]:
            for size in watch["party_sizes"]:
                for slot in opentable.find_slots(watch["slug"], date, size):
                    slot["restaurant"] = watch["name"]
                    found.append(slot)

    else:
        raise ValueError(f"unknown platform: {watch['platform']!r}")

    return found


def format_alert(slot: dict) -> str:
    return (
        f"Table open: {slot['restaurant']} - {slot['date']} "
        f"{slot.get('time', '')} for {slot['party_size']}. Book now."
    )


def main() -> int:
    with open("config.yaml") as f:
        config = yaml.safe_load(f)

    previously_open = load_open_slots()
    currently_open: dict[str, dict] = {}
    had_error = False

    for watch in config["watches"]:
        try:
            for slot in check_watch(watch):
                currently_open[slot_key(slot)] = slot
        except Exception:
            had_error = True
            print(f"[{datetime.now()}] ERROR checking {watch['name']}:", file=sys.stderr)
            traceback.print_exc()

    newly_open = set(currently_open) - previously_open

    for key in sorted(newly_open):
        slot = currently_open[key]
        msg = format_alert(slot)
        print(f"[{datetime.now()}] ALERT: {msg}")
        send_alert(msg)

    print(
        f"[{datetime.now()}] checked {len(config['watches'])} watch(es), "
        f"{len(currently_open)} open slot(s), {len(newly_open)} new"
    )

    save_open_slots(set(currently_open))

    # Don't fail the whole run over one platform erroring -- but surface it
    # in the Actions log/exit code so persistent failures are noticeable.
    return 1 if had_error else 0


if __name__ == "__main__":
    sys.exit(main())
