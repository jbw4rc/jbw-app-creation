# Paris for Mom & Dad — Oct 6–12, 2026

Built from `source-brief.md`. Three files, no build step:

| File | What it is |
|---|---|
| `index.html` | The trip guide. One self-contained page — open it in any browser, or save it to a phone home screen. |
| `paris_mom_dad.kml` | All 49 pins, one folder per day, for Google My Maps. |
| `places.csv` | The same pins as a spreadsheet (Name, Latitude, Longitude, Day, Type, Notes). |

## Import the pins into Google Maps on their phones

1. On a computer, go to **google.com/maps/d** (Google My Maps) and sign in with the Google account their phone uses.
2. **Create a new map** → **Import** → upload `paris_mom_dad.kml`.
3. My Maps imports one layer per day, each in its own color. Rename the map to something like *Paris Oct 2026*.
4. Click **Share** and either share it to their Google account or turn on "anyone with the link."
5. On the phone: **Google Maps app → Saved → Maps** — the map appears there, pins and all.

If a layer ever needs rebuilding, `places.csv` imports the same way (choose Latitude/Longitude for position and Name for the title).

## Share the page

- Any static host works (GitHub Pages, Netlify drop, iCloud/Drive link) — it's a single file with no server.
- Or just email/message the `index.html` file: opening the attachment works, and on iPhone **Share → Add to Home Screen** makes it a one-tap icon.
- The map background needs a data connection; every other part of the page, including the full place list with coordinates, works with no signal (handy in the metro).

## Editing

`index.html` embeds the place data inline, near the bottom in `var PLACES = [...]`. Edit that array, `places.csv` and the KML together if pins change.
