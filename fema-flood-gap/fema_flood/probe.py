"""Sample a column's real values.

Filters have to be written in the vocabulary the data actually uses. Assuming
``ownRent eq 'Owner'`` and getting zero rows is indistinguishable, in the
output, from a state that genuinely has no owner registrations -- so instead of
assuming, read a page of records and see what is in the column.
"""

from collections import Counter


def sample(client, dataset, version, fields, filter=None, limit=1000):
    """Return ``{field: Counter(value -> occurrences)}`` from one page.

    One page is plenty for the low-cardinality columns this is used on
    (owner/renter, yes/no flags); it is not a distinct-value guarantee, which
    is why callers treat a zero-row result as a reason to widen rather than as
    a final answer.
    """
    fields = [f for f in fields if f]
    if not fields:
        return {}
    url = client.build_url(dataset, version, {
        "$top": limit,
        "$select": ",".join(sorted(set(fields) | {"id"})),
        "$filter": filter,
    })
    rows = client.extract_records(client.get(url))
    tally = {field: Counter() for field in fields}
    for row in rows:
        for field in fields:
            tally[field][_key(row.get(field))] += 1
    return tally


def _key(value):
    """Hashable stand-in that keeps type information visible."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value
    return str(value)


def literal(value):
    """Render a sampled value as a ``$filter`` literal of its own type."""
    from . import api

    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value) if isinstance(value, float) else str(value)
    return api.quote_literal(value)


def describe(counter):
    """Readable summary of sampled values, most common first."""
    if not counter:
        return "(no sample)"
    return ", ".join(
        "%s x%d" % ("null" if value is None else repr(value), count)
        for value, count in counter.most_common(8))
