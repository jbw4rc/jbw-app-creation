# Filing PDFs

Downloaded by hand from SERFF; **not** committed (see `.gitignore`).

Layout — `extract.py` and every `source_page` citation assume it:

```
data/filings/{state}/{carrier-slug}/{serff-tracking}.pdf
```

e.g. `data/filings/ct/sample-mutual/SAMP-134567890.pdf`

Use the lowercase USPS code for `{state}` and a lowercase, hyphenated
`{carrier-slug}` matching the one in the plan's `plan_id`.
