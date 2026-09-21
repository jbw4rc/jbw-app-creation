# Paris for Mom & Dad: Build Brief for Claude Code

## Your job

Build a one-stop trip companion for my parents' Paris trip from the data below. They are in their later years, will use it mostly on a phone, and should be able to get walking, metro or taxi directions to any pin in one tap.

Produce these files in `./paris-trip/`:

1. **`index.html`**: a single self-contained, mobile-first web page (details in "Output spec").
2. **`paris_mom_dad.kml`**: one folder per day, for importing into Google My Maps so the pins appear in the Google Maps app under Saved → Maps.
3. **`places.csv`**: columns Name, Latitude, Longitude, Day, Type, Notes. Also importable into Google My Maps.

Use only the data in this file. Don't invent places, hours, prices or phone numbers. Where something is marked TBD, show it as "TBD" in the output rather than guessing.

## Trip overview

- **Travelers:** my parents, arriving from Spain (already on European time).
- **Dates:** arrive Tue Oct 6, depart Mon Oct 12, 2026. **Departure time and airport/station: TBD.**
- **Hotel:** Pullman Paris Montparnasse, 19 Rue du Commandant René Mouchotte, 75014 Paris. Phone +33 1 44 36 44 36. Coordinates 48.8384551, 2.320393. It's right beside Gare Montparnasse.
- **Friends joining:** the Augers/Whittkets arrive the late afternoon of Thu Oct 8.
- **Style:** casual, never overbooked. Each day is a menu, not a schedule. Recommended spots are places locals go, not tourist traps.

## Day-by-day plan

### Tue Oct 6: arrival (late afternoon)
- Settle in and stay close to the hotel.
- Dinner: Le Dôme (seafood) or La Closerie des Lilas (Hemingway's bar).
- Nightcap: Le Rosebud (opens 6pm), about 10 min walk.

### Wed Oct 7: Orsay, Orangerie and Saint-Germain (free day)
- **Morning:** Marché Edgar-Quinet (Wed market, 5 min walk from hotel).
- **~9:30:** Musée d'Orsay (timed ticket required). Coffee first at Les Antiquaires, two blocks away.
- **After lunch:** walk 10 min over the footbridge and through the Tuileries to the Musée de l'Orangerie (timed ticket required).
- **Afternoon:** Saint-Germain cafés: Les Deux Magots, Café de Flore, La Palette, Café de la Mairie. Shops nearby: Pierre Hermé (macarons), Poilâne (bread), La Dernière Goutte (wine).
- **Evening:** a pre-dinner glass at Le Baron Rouge, then dinner at **Bistrot Paul Bert** (RESERVE; 10 min walk apart). Taxi home.

### Thu Oct 8: Louvre, Invalides, Rue Cler, Eiffel Tower dinner (free until dinner)
- **9:00:** Louvre (book the 9am timed slot; Thursday is its quietest day). About 3 hours; pick 3-4 must-sees.
- **12:30:** lunch on Le Nemours' terrace under the Palais-Royal arcades. Optional: walk through the Palais-Royal garden to Legrand Filles et Fils (wine shop) in Galerie Vivienne.
- **2:30:** taxi or metro to Napoleon's Tomb at Invalides (about 1 hour; walk-in).
- **4:00: Rue Cler (highlight of the afternoon).** A pedestrian market street lined with cheese shops, bakeries, produce stands, butchers and flower stalls. Wander it end to end, pick up cheese at Marie-Anne Cantin, then settle in at Café du Marché. It's an easy place to meet the friends when they arrive.
- **Evening:** existing plan, dinner at the Eiffel Tower with the friends (already arranged; not a recommendation). Rue Cler is a 10-minute walk away.
- Nearby extras if they want them: Le Rubis, Willi's Wine Bar, Stohrer.

### Fri Oct 9: Normandy, all day
- Booked tour. **Pickup point and times: TBD.**

### Sat Oct 10: Montmartre food tour, 11am-4pm
- **Early morning:** Marché Edgar-Quinet again (Sat market, by the hotel). Light shopping only, since the food tour follows.
- **~10:15:** metro Line 12 from Montparnasse-Bienvenüe to Abbesses (about 30 min, no changes).
- **Evening:** keep it easy near the hotel.
- **Tour meeting point: TBD.**

### Sun Oct 11: two options

**Option A: with the panoramic tour (8:30am-12:30pm)**
- 8:30-12:30: panoramic tour. **Meeting point: TBD.**
- ~1:00: lunch at Le Saint-Régis on Île Saint-Louis, then Berthillon.
- Afternoon: Notre-Dame, then Sainte-Chapelle (book a 3:30pm slot).
- ~5:00: rest at the hotel.
- 7:30: dinner at **Benoit** (RESERVE).

**Option B: no tour**
- 9:30: Sainte-Chapelle (book a 9:30am slot; best light), then Notre-Dame.
- 11:30: cross to the Left Bank: croissant at La Maison d'Isabelle and cheese at Laurent Dubois (closes 1pm Sunday).
- 12:30: lunch at Le Saint-Régis, then Berthillon.
- Afternoon, pick one: Luxembourg Gardens and Café de la Mairie (easy, on the way home), **or** the Arc de Triomphe rooftop and the Champs-Élysées.
- ~5:00: rest.
- 7:30: dinner at **Benoit** (RESERVE).

Sunday closures: Poilâne, Barthélémy, Legrand, Le Rubis, Willi's Wine Bar, Bistrot Paul Bert. Most cheese shops close around 1pm.

### Mon Oct 12: departure
- **Departure time: TBD.** If they have a free morning, stay near the hotel.
- Monday closures: Orsay, Versailles, most cheese shops and top bakeries (Isabelle, Laurent Dubois, Cantin, Quatrehomme, Barthélémy, Blé Sucré), Berthillon, Paul Bert.
- Open Monday and close by: **Poilâne** (from 7:15am, bread and butter cookies travel well) and **La Grande Épicerie de Paris** (from 8:30am; butter, cheese, gifts and wine to take home; about 15 min walk or a short taxi from the hotel). Last coffee at Le Select.
- Tip: food shops will vacuum-pack cheese for travel. Buy take-home cheese on Saturday or before 1pm Sunday, since most cheese shops are closed Monday.

### Not scheduled (keep on the map as "Extras")
Versailles doesn't fit this trip: every free day is taken, and it's closed on Monday (departure day). Keep it on the map for a future visit. The other extras are markets and food shops for spare moments.

## Bookings checklist

| What | When | How |
|---|---|---|
| Paris Museum Pass (6-day) | Buy now | parismuseumpass.fr only. €125 each. Starts at first scan (Orsay, Wed morning). |
| Musée d'Orsay | Wed Oct 7, ~9:30am | Free pass-holder slot, mandatory: pick the Paris Museum Pass voucher. |
| Musée de l'Orangerie | Wed Oct 7, early afternoon | Free pass-holder slot: Admission, then the "Countermark Paris Museum Pass" line. |
| Bistrot Paul Bert | Wed Oct 7, dinner | Call ~10:30am or 4pm Paris time. Hard to reach. |
| Louvre | Thu Oct 8, 9:00am | Free pass-holder slot at ticket.louvre.fr. Book this first; it sells out. |
| Sainte-Chapelle | Sun Oct 11, 3:30pm (A) or 9:30am (B) | Free pass-holder slot at tickets.monuments-nationaux.fr: "Visit of the monument," then the "I already have a ticket" line. Decide on the tour first. |
| Notre-Dame towers (optional) | Sun Oct 11 | Covered by the pass; free slot at tickets.monuments-nationaux.fr, Paris Museum Pass line. Opens 72 hours ahead. |
| Napoleon's Tomb, Arc de Triomphe | Thu Oct 8 / Sun option B | Covered by the pass. Walk-in, no slot needed. |
| Notre-Dame | Sun Oct 11 | Free. Optional free time-slot reservation skips the main line. |
| Benoit | Sun Oct 11, 7:30pm dinner | Reserve. +33 1 42 72 25 76 |

**Museum pass: buy the 6-day Paris Museum Pass (€125 each, about $143), only from parismuseumpass.fr.** The clock starts at the first scan (Orsay, Wed Oct 7 morning) and runs 144 consecutive hours, so it covers every museum day through Sunday. It covers the Louvre (€32), Sainte-Chapelle (€22), Napoleon's Tomb (€17), Orsay (€16) and the Orangerie (~€12.50), plus the Arc de Triomphe (€22) and the Notre-Dame towers (€16) if they want them. It skips the ticket lines (not security) and means one purchase instead of five. The 4-day pass would expire Sunday morning, before Sainte-Chapelle.

**Time slots are still required with the pass.** Book each one free on the venue's own site, choosing the Museum Pass option. No pass number is needed to book. Show the pass plus the slot confirmation at the door.

## Getting around

Assume about $1.14 per euro. Prices are for both of them together.

- **Metro:** €2.55 per person per ride (about $6 for two). Paper tickets are gone: use a Navigo Easy card (€2 at any station, 10-ride pack €17.35) or the Bonjour RATP app. Buses need a separate ticket.
- **Taxi:** priced per car, €8 minimum. Higher rates on weekday evenings and all day Sunday. G7 is the main taxi app; Uber also works.
- **The hotel's lines:** Line 4 (Saint-Germain, Cité, Châtelet), Line 12 (Solférino for Orsay, Concorde, Abbesses for Montmartre), Line 6 (Bir-Hakeim for the Eiffel Tower, Étoile for the Arc).
- **Safety:** pickpockets work Lines 1, 4 and 6 near big sights. Keep a zipped bag in front.

| Leg | Walk | Metro | Taxi |
|---|---|---|---|
| Hotel → Orsay | 35 min | Line 12 to Solférino, ~20 min, $6 | 12 min, ~$14-18 |
| Orsay → Orangerie | 10 min (footbridge + Tuileries) | n/a | n/a |
| Orangerie → Saint-Germain | 25 min | n/a | 10 min, ~$12-16 |
| Saint-Germain → hotel | 25 min | Line 4, 15 min, $6 | ~$14-17 |
| Hotel → Paul Bert | too far | ~35 min, 1 change, $6 | 20 min, ~$22-29 (home ~$23-32) |
| Hotel → Louvre | too far | ~25 min, 1 change, $6; or bus 95 direct, 30 min, ~$5 | 15 min, ~$17-21 |
| Louvre → Napoleon's Tomb | 40 min | ~20 min, 1 change, $6 | 12 min, ~$14-18 |
| Invalides → Rue Cler → Eiffel Tower | 10 min each | n/a | n/a |
| Eiffel Tower dinner → hotel (night) | too far | Line 6, 15 min, $6 | 12 min, ~$17-23 |
| Hotel → Montmartre (Abbesses) | too far | Line 12, 30 min, no change, $6 | 25-30 min, ~$23-32 |
| Tour end → Île Saint-Louis (Sun A) | depends | depends | ~$12-20 |
| Island sights (each hop) | 5 min | n/a | n/a |
| Sainte-Chapelle ↔ hotel | 40 min | Line 4 (Cité), 15 min, $6 | ~$16-21 |
| Hotel ↔ Benoit | too far | Line 4 to Châtelet + 5 min walk, 15 min, $6 | 15 min, ~$17-23 each way |
| Islands → Luxembourg (Sun B) | 25 min | n/a | ~$12-16 |
| Luxembourg → hotel | 20 min | n/a | n/a |
| Islands → Arc de Triomphe (Sun B) | too far | Line 1, 20 min, $6 | 20 min, ~$21-27 |
| Arc de Triomphe → hotel | too far | Line 6, 20 min, $6 (partly above ground, good views) | ~$21-27 |

## Market days (Dad loves markets)

| Market | Days (mornings, ~7am-1:30pm) | Fits which day |
|---|---|---|
| Marché Edgar-Quinet | Wed, Sat | Wed Oct 7 + Sat Oct 10 (by the hotel) |
| Marché aux Fleurs | Daily, 8am-7:30pm | Sun Oct 11 |
| Marché Raspail | Tue, Fri; Sun is the big organic market | Extra |
| Marché Maubert | Tue, Thu, Sat | Extra |
| Marché Saxe-Breteuil | Thu, Sat (Eiffel Tower view) | Extra |
| Marché d'Aligre | Tue-Sun (closed Mon) | Extra |
| Marché Notre-Dame (Versailles) | Outdoor Tue, Fri, Sun; halls Tue-Sun | Extra (Versailles) |

## Places (all pins)

| Name | Latitude | Longitude | Day | Type | Notes |
|---|---|---|---|---|---|
| Pullman Paris Montparnasse (HOTEL) | 48.8384551 | 2.320393 | Home base | Hotel | 19 Rue du Commandant René Mouchotte, 75014. +33 1 44 36 44 36. Next to Gare Montparnasse (trains to Versailles-Chantiers). Rooftop bar. |
| Le Select | 48.8426118 | 2.3284069 | Tue Oct 6 | Café | Lost Generation haunt near the hotel. Morning coffee at the bar. |
| Le Dôme | 48.8420072 | 2.3289451 | Tue Oct 6 | Café | Historic art deco brasserie across from Le Select. A drink on the covered terrace; famous for seafood. |
| Le Rosebud | 48.8416605 | 2.3282787 | Tue Oct 6 | Bar | 1960s jazz-era cocktail bar on Rue Delambre. Nightcap near the hotel. Opens 6pm. |
| La Closerie des Lilas | 48.8401436 | 2.3360432 | Tue Oct 6 | Café | Hemingway's hangout; famous names engraved on the bar. Drink in the piano bar. Opens noon. |
| Jardin du Luxembourg | 48.8466144 | 2.3363309 | Sun Oct 11 (option B) | Sight | Grab two green chairs by the fountain and relax. |
| Café de la Mairie | 48.8515084 | 2.3337044 | Wed Oct 7 | Café | Locals' terrace on Place Saint-Sulpice. Coffee or wine; skip the food. |
| Les Deux Magots | 48.854052 | 2.3331062 | Wed Oct 7 | Café | Famous and pricey but worth it once. Order the hot chocolate. |
| Café de Flore | 48.8541588 | 2.3326046 | Wed Oct 7 | Café | Next door to Deux Magots. Sit on the terrace. |
| La Palette | 48.8554318 | 2.3368618 | Wed Oct 7 | Café | Gallery-street terrace on Rue de Seine. Stick to wine; cocktails are overpriced. |
| Les Antiquaires | 48.8586582 | 2.3288088 | Wed Oct 7 | Café | Corner bistro two blocks from Orsay. Coffee before or lunch after. |
| Musée d'Orsay | 48.8599614 | 2.3265614 | Wed Oct 7 | Museum | Book timed ticket. Closed Mondays. Start on the 5th floor (Impressionists). |
| Musée de l'Orangerie | 48.8637884 | 2.3226724 | Wed Oct 7 | Museum | Monet's Water Lilies. Book timed ticket. Closed Tuesdays. About 1 hour. |
| Arc de Triomphe | 48.8737917 | 2.2950275 | Sun Oct 11 (option B) | Sight | Option B afternoon: rooftop views + Champs-Élysées. Covered by the museum pass, walk-in. Use the underground tunnel to reach it. |
| Sainte-Chapelle | 48.855375 | 2.3449609 | Sun Oct 11 | Sight | Book timed ticket: 3:30pm (option A) or 9:30am (option B). Morning light is best. |
| Notre-Dame de Paris | 48.8529682 | 2.3499021 | Sun Oct 11 | Sight | Free entry. Reserve a free time slot online to skip the main line. |
| Le Saint-Régis | 48.8529059 | 2.3537978 | Sun Oct 11 | Café | Just over the bridge on Île Saint-Louis. Coffee stop after Notre-Dame. |
| Berthillon | 48.8517135 | 2.3567206 | Sun Oct 11 | Café | Best sorbet in Paris. Closed Mon & Tue. |
| Benoit | 48.8584202 | 2.3500687 | Sun Oct 11 | Restaurant | RESERVE Sunday dinner 7:30pm. 1912 bistro, open daily 12-2 and 7-10pm. Get the profiteroles. |
| Eiffel Tower | 48.8583701 | 2.2944813 | Thu Oct 8 | Existing plan | Dinner with the friends (already arranged). The tower sparkles on the hour after dark. Watch for pickpockets. |
| Rue Cler | 48.8577001 | 2.3059504 | Thu Oct 8 | Market | HIGHLIGHT. Pedestrian market street: cheese shops, bakeries, produce, flowers. Best Tue-Sat; most shops closed Mon, quiet Sun afternoon. |
| Café du Marché | 48.856669 | 2.306326 | Thu Oct 8 | Café | The Rue Cler café. Terrace lunch and people-watching. |
| Napoleon's Tomb (Invalides) | 48.8550614 | 2.3125393 | Thu Oct 8 | Sight | 10 min walk from Rue Cler. About an hour for the dome. |
| Le Nemours | 48.8630568 | 2.3365269 | Thu Oct 8 | Café | Terrace under the Palais-Royal arcades steps from the Louvre. Coffee before / recovery after. |
| Louvre | 48.8606111 | 2.337644 | Thu Oct 8 | Museum | Book earliest timed slot. Closed Tuesdays. Pick 3-4 must-sees. |
| Le Rubis | 48.866177 | 2.331403 | Extra (near Louvre) | Wine bar | Old-school zinc wine bar full of regulars. Chalkboard menu. Closed Sunday. |
| Willi's Wine Bar | 48.866314 | 2.338319 | Extra (near Louvre) | Wine bar | Paris wine-bar institution since 1980. Great early dinner. Closed Sunday. |
| Le Baron Rouge | 48.8494461 | 2.3773588 | Wed Oct 7 | Wine bar | Standing-room wine bar by the Aligre market. Pre-dinner glass; 10 min walk to Paul Bert. |
| Bistrot Paul Bert | 48.8522102 | 2.3850177 | Wed Oct 7 | Restaurant | RESERVE (call ~10:30am or 4pm Paris time). Steak au poivre. Closed Sun & Mon. |
| Marché Edgar-Quinet | 48.8415657 | 2.3238078 | Wed Oct 7 + Sat Oct 10 | Market | WED & SAT mornings (7am-1:30/2:30pm). 5 min walk from hotel. Rotisserie chicken + oysters. |
| Marché Raspail | 48.8498686 | 2.3270825 | Extra (not scheduled) | Market | TUE & FRI mornings; SUNDAY is the famous organic market. Near Luxembourg. |
| Poilâne | 48.8512944 | 2.3289972 | Wed Oct 7 + Mon Oct 12 | Bakery | THE legendary bread bakery. Get a slice of the big P loaf, the apple tart, and the butter cookies. Closed Sun. |
| Pierre Hermé | 48.8514868 | 2.332762 | Wed Oct 7 | Bakery | Best macarons in Paris. Try the Ispahan (rose/raspberry/lychee). Takeaway only. |
| La Grande Épicerie de Paris | 48.8503167 | 2.3239433 | Mon Oct 12 | Food hall | Gorgeous gourmet food hall. Butter, cheese, gifts to bring home; big wine cellar downstairs. Open daily. |
| Fromagerie Quatrehomme | 48.8481026 | 2.3195897 | Extra (not scheduled) | Cheese shop | Top cheesemonger; staff will pick for you and vacuum-pack for the flight. Closed Mon. |
| La Dernière Goutte | 48.8539463 | 2.3361959 | Wed Oct 7 | Wine shop | Tiny, friendly wine shop; owner speaks English and loves recommending bottles. Great Burgundy. |
| Barthélémy | 48.8544587 | 2.3255338 | Extra (not scheduled) | Cheese shop | Classic old cheese shop ~10 min walk from Orsay. Vacuum-packs for travel. Closed Sun & Mon. |
| La Maison d'Isabelle | 48.8498436 | 2.3482751 | Sun Oct 11 (option B) | Bakery | Award-winning croissant, just across the bridge from Notre-Dame. Short line moves fast. Closed Mon. |
| Fromagerie Laurent Dubois | 48.8498024 | 2.3485006 | Sun Oct 11 (option B) | Cheese shop | Next door to Isabelle. Ask to taste the aged Comté. Closed Mon. |
| Marché Maubert | 48.8499215 | 2.3485543 | Extra (not scheduled) | Market | TUE, THU & SAT mornings. Small, local market 5 min from Notre-Dame. |
| Marché aux Fleurs | 48.8551453 | 2.3476661 | Sun Oct 11 | Market | Flower market between Sainte-Chapelle and Notre-Dame. Open daily. |
| Marché Saxe-Breteuil | 48.8481169 | 2.3104749 | Extra (not scheduled) | Market | THU & SAT mornings. Big, beautiful market with the Eiffel Tower in view. Go before 11. |
| Marie-Anne Cantin | 48.8564772 | 2.3055702 | Thu Oct 8 | Cheese shop | Top cheese shop right off Rue Cler; ask for a 5-cheese tasting plate for a Champ de Mars picnic. Closed Mon. |
| Stohrer | 48.8652644 | 2.3468149 | Extra (near Louvre) | Bakery | Oldest pastry shop in Paris (1730) on the Rue Montorgueil market street, ~15 min from the Louvre. Get the baba au rhum. |
| Legrand Filles et Fils | 48.8663131 | 2.3398759 | Thu Oct 8 | Wine shop | Historic wine shop + tasting bar in Galerie Vivienne, steps from Palais-Royal. Closed Sun. |
| Marché d'Aligre | 48.8500235 | 2.3789591 | Extra (not scheduled) | Market | TUE-SUN mornings (closed Mon); busiest Sat & Sun. Outdoor stalls + covered hall + flea market. Morning trip, separate from dinner. |
| Blé Sucré | 48.8505998 | 2.3766946 | Extra (not scheduled) | Bakery | Locals' pick for croissant and pain au chocolat, right by Aligre. Closed Mon. |
| Palace of Versailles | 48.8048649 | 2.1203554 | Extra (not scheduled) | Sight | CLOSED MON. Book timed tickets ahead; take earliest slot. Train from Gare Montparnasse to Versailles-Chantiers (~15 min) then ~20 min walk or taxi. |
| Marché Notre-Dame (Versailles) | 48.8065744 | 2.1321226 | Extra (not scheduled) | Market | Outdoor market TUE, FRI & SUN mornings; covered halls open Tue-Sun. Build a picnic for the palace gardens. |
## Output spec for `index.html`

- **Single file.** All CSS and JS inline. Load Leaflet from cdnjs with a pinned version, using OpenStreetMap tiles. No build step and no API keys.
- **Mobile first.** Large tap targets and a base font of at least 17px, since this is for older readers. Works in light and dark mode.
- **Tabs or sections:** Map, Day by day, Bookings, Getting around, Markets.
- **Map:**
  - Color-code pins by day. The hotel gets a distinct star or home icon. Extras are muted grey.
  - Filter chips for each day (Tue 6, Wed 7, Thu 8, Sat 10, Sun 11 A, Sun 11 B, Mon 12, Extras) and for type (Café, Wine bar, Restaurant, Museum, Sight, Market, Bakery, Cheese shop, Wine shop, Food hall, Existing plan). Style "Existing plan" pins as booked plans, not recommendations. Give Rue Cler a highlighted pin.
  - Tapping a pin shows the name, type, note, and a **Directions** button that opens `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` (Google Maps app on phones). Add a **Walk from hotel** link with `&origin=48.8384551,2.320393&travelmode=walking`.
- **Day by day:** render each day from the plan above as a readable card, with the matching transport legs inline under each move. Tapping a place name flies the map to that pin.
- **Bookings:** a checklist (museum pass first, then time slots, then restaurants) with checkboxes that persist in localStorage (wrap in try/catch).
- **Offline:** the map tiles need data, but everything else must work offline once the page is saved. Include a text list of every place with its coordinates and notes as a fallback.
- **Accuracy:** show "TBD" for the tour meeting points and the departure time. Add a footer saying hours and prices were checked September 2026 and should be confirmed on official sites.

## KML spec
- One `<Folder>` per Day value, in trip order, with Extras last.
- Each `<Placemark>` gets `<name>`, `<description>` (Type + Notes) and a `<Point>` with `lng,lat,0` coordinates.
- Include a simple style per folder so each day imports in a different color.

## After building
Open `index.html` in a browser and check the page on a narrow (~380px) viewport. Confirm all 49 pins render and every Directions link works. Then tell me how to import the KML into Google My Maps and how to share the page with my parents.
