import os

import requests


def send_alert(body: str) -> None:
    """Push a notification via ntfy.sh -- no account, no API key, just a
    shared topic name. Anyone who knows the topic can publish/subscribe to
    it (ntfy.sh's public server is unauthenticated), so treat NTFY_TOPIC
    like a lightweight secret: long and made-up, not "cru-nantucket"."""
    topic = os.environ["NTFY_TOPIC"]
    resp = requests.post(
        f"https://ntfy.sh/{topic}",
        data=body.encode("utf-8"),
        headers={"Title": "Table open!", "Priority": "urgent", "Tags": "bell"},
        timeout=15,
    )
    resp.raise_for_status()
