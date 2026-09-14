# Notes: what was ambiguous, and what to look for in the next filing

**Status: no real filing has been parsed yet.** This first pass was built against
two synthetic plans, so this file cannot report what a real Connecticut HO filing
turned out to say. What it *can* do is record every place where the schema forced
a decision that a filing might answer differently — because each of those is a
place where reading the next filing carelessly produces a plausible wrong number.

Read this before transcribing the first real one. Add to it afterwards.

---

## 1. Ambiguities the schema had to take a position on

### Rounding placement changes the answer more than you would expect

The engine carries full `Decimal` precision through factor steps and rounds only
where a `round` step says to. The alternative convention — round after every
factor — is equally common in filings.

This is not a rounding-error quibble. On the sample plan, across $400k–$600k of
Coverage A in $1,000 steps, the two conventions **disagree on 114 of 201
amounts**, by $1–$2. They happen to agree at $450,000, which is exactly the kind
of coincidence that makes a wrong convention survive a spot check.

*What to look for:* a rule usually titled "Premium Determination" or "Order of
Calculation". Some filings say "round each factor to three decimals"; some round
the premium after each step; most round once at the end. If the filing does not
say, a worked example will decide it for you — try both and see which reproduces.

### Band inclusivity is usually unstated

`0 - 5` and `6 - 10` on consecutive rows are unambiguous (closed). But money
brackets printed as `$200,000 to $250,000` / `$250,000 to $300,000` overlap at
the boundary, and the filing rarely says which row owns $250,000. The schema
makes this explicit per key (`bounds: closed | half_open`) rather than picking a
house rule, because guessing is a silent one-band error on every risk that lands
on a boundary.

*What to look for:* whether the filing spells out `$249,999` (closed) or relies
on the reader (half-open, usually). Boundary risks are common — $250,000 and
$500,000 Coverage A, $1,000 and $2,500 deductibles, age 10 and 20 roofs.

### "20 years or older" tables are not bands

A column printed as `0 / 10 / 20 / 30 / 50` where each row means "this age or
older" is a `nearest_below` lookup. Reading it as an exact match fails on every
age not listed; reading it as bands requires inventing boundaries the filing
never states. The second synthetic plan uses this deliberately so the semantic is
exercised.

*What to look for:* a table with no upper bounds printed, or a header like "Age
of Dwelling — use the next lower age shown".

### "All other" rows are the only legitimate default

The engine never falls back to 1.0. A `default` requires a `default_source`
citing the page where the filing prints its "all other" row. This is the single
most important guard in the schema: a missing lookup that silently rates at 1.00
produces a number that looks completely normal and is wrong.

*What to look for:* "All other", "Not otherwise classified", "All others — refer
to company" (which is *not* a default — it means decline, and should be an
error). Distinguish these carefully.

### Split protection classes are strings

`10W`, `8B`, `9S` are real ISO classes. `protection_class` is typed as `str`
throughout for this reason. The synthetic extraction round-trip immediately
surfaced the resulting trap: a filing whose PC table is printed as numeric ranges
(`1 - 4`) cannot match `10W` by band at all, so a plan with an "all other"
default would silently catch `10W` at the default factor instead of its real one.

*What to look for:* whether split classes appear in the factor table, in a
separate table, in a footnote, or not at all. The difference between `10` (2.280)
and `10W` (2.100) in the sample plan is 8% of premium.

### Where a factor applies — a known schema gap

The interpreter applies every factor to the whole running premium. Real filings
sometimes apply a factor to only part of it: a deductible credit against the
Coverage A portion but not the liability portion, or a wind/hail deductible
applied only to the wind-eligible premium.

**The schema cannot currently express this.** If the next filing does it, do not
approximate — the fix is a `scope` or `component` concept on steps, splitting the
running premium into named buckets. Flag it and we will extend the schema.

### Caps needing data the risk may not carry

`max_increase_pct` needs an expiring premium. The plan must gate such a step with
`applies_when: {has_prior_term_premium: true}`, or new business raises a
`PlanConfigurationError`. Loud, but it is a plan bug and should be.

*What to look for:* "premium transition", "capping", "rate stability" rules.
These are often in a separate filing from the rates themselves.

---

## 2. Decisions taken that the first real filing should re-test

| Decision | Why | Revisit if |
|---|---|---|
| Full precision through factors, round only at `round` steps | Filings that round per-factor can say so with extra steps; the reverse is not expressible | A filing rounds per-factor and its worksheet will not reproduce |
| Form is a factor lookup, "not written" comes from `forms_supported` | Keeps rating all three forms a single loop | A filing has genuinely separate rate tables per form — then form becomes a base-rate key instead, which the schema already supports |
| Territory tables live inside each plan | Carriers assign the same ZIP differently. In the two synthetic plans, 06371 is the cheapest tier for one carrier and the coastal tier for the other — a 53% premium spread on the same house | Never. This one is not a trade-off. |
| `applies_when` treats a missing attribute as "skip"; a table lookup treats it as an error | Lets endorsement steps be gated naturally, while a genuinely missing rating input still fails loudly | — |
| Steps are a flat ordered list | Matches how filings present a rating sequence | A filing has genuinely nested or conditional sequences |
| Money is `Decimal` end to end, parsed via `str()` | "Reproduce the filing's premium to the cent" is not achievable in binary floats | — |

---

## 3. Practical gotchas already visible

**YAML floats lose trailing zeros.** `1.230` in a plan file becomes `Decimal("1.23")`,
because `yaml.safe_load` produces a float first. Values are exact (Python's float
repr round-trips), so this is cosmetic — traces print `1.23`, not `1.230`. But a
factor with more than ~15 significant digits would lose precision. No real filing
prints factors like that; if one does, quote the value as a string in the YAML.

**Triage cannot see scanned filings.** Older filings are page images with no text
layer. `extract.py` flags those pages as candidates anyway rather than scoring
them zero, but the page count is the only signal you get. Expect to pass
`--pages` by hand.

**Worked examples sometimes omit steps.** The synthetic example on page 4 of the
test filing prints four factors but a total that implies a fifth. Real filings do
this too — the example is illustrative and the manual is authoritative. When a
worksheet won't reconcile, check whether the example is showing you every step
before assuming the sequence is wrong.

**The engine will rate risks the carrier would decline.** Eligibility rules
(roof age limits, coastal distance, prior claims) are underwriting, not rating,
and are not modelled. A premium from this engine means "this is what the rate
manual computes", not "this carrier will write it".

---

## 4. Open questions for the first real filing

1. Does the filing state its order of calculation explicitly, or must it be
   inferred from the worked example?
2. Are there factors that apply to a subtotal rather than the full premium?
3. Is there a worked example at all? If not, what else can validate the sequence?
4. How are optional coverages / endorsements rated — flat charges, per-$1,000,
   percentage of base, or their own factor tables? (All four are supported; the
   question is which.)
5. Does CT use town-based territories, as its filings often do? If so, the
   address → town step needs a real geocoder, not a ZIP lookup.
6. Are base rates filed by form, or is form a relativity applied to one base?
7. Is there a separate capping/transition filing that has to be layered on?
