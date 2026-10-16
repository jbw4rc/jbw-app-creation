import json
import os

STATE_FILE = os.path.join(os.path.dirname(__file__), "state.json")


def slot_key(slot: dict) -> str:
    return f"{slot['restaurant']}|{slot['date']}|{slot.get('time')}|{slot['party_size']}"


def load_open_slots() -> set[str]:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return set(json.load(f).get("open_slots", []))
    return set()


def save_open_slots(keys: set[str]) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump({"open_slots": sorted(keys)}, f, indent=2)
