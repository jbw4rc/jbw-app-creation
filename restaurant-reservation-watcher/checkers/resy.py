"""
Resy availability checker.

Uses Resy's anonymous "find" API — the same endpoint resy.com itself calls
when you browse a venue's availability without being logged in. No account
or auth token is required to *look*; only actually booking requires login,
and this tool never does that.

The API key below is not a secret credential — it's the public, static key
Resy's own web client embeds for anonymous browsing (documented across many
open-source Resy availability trackers). If Resy rotates it, requests here
will start returning 401s; grab a fresh one from your browser's dev tools
(Network tab -> any request to api.resy.com -> Authorization header) and
swap it in below.
"""
import requests

RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"

HEADERS = {
    "Authorization": f'ResyAPI api_key="{RESY_API_KEY}"',
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://resy.com",
    "Referer": "https://resy.com/",
}


class ResyError(RuntimeError):
    pass


def get_venue_id(slug: str, location: str) -> int:
    r = requests.get(
        "https://api.resy.com/3/venue",
        params={"url_slug": slug, "location": location},
        headers=HEADERS,
        timeout=15,
    )
    if r.status_code != 200:
        raise ResyError(f"venue lookup failed ({r.status_code}): {r.text[:300]}")
    data = r.json()
    try:
        return data["id"]["resy"]
    except (KeyError, TypeError) as e:
        raise ResyError(f"unexpected venue response shape: {data}") from e


def find_slots(venue_id: int, day: str, party_size: int) -> list[dict]:
    """Returns a list of {date, time, party_size, slot_type} for open slots."""
    r = requests.get(
        "https://api.resy.com/4/find",
        params={"lat": 0, "long": 0, "day": day, "party_size": party_size, "venue_id": venue_id},
        headers=HEADERS,
        timeout=15,
    )
    if r.status_code != 200:
        raise ResyError(f"find failed ({r.status_code}): {r.text[:300]}")
    data = r.json()
    venues = data.get("results", {}).get("venues", [])
    if not venues:
        return []

    out = []
    for slot in venues[0].get("slots", []):
        try:
            out.append({
                "date": day,
                "party_size": party_size,
                "time": slot["date"]["start"],
                "slot_type": slot.get("config", {}).get("type", ""),
            })
        except (KeyError, TypeError):
            continue
    return out
