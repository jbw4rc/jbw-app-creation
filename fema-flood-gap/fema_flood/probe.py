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

    return api.format_literal(value)


def flag_literal(counter, want):
    """Literal meaning ``want`` for a yes/no column, inferred from its type.

    Value sampling alone is not enough here. A flood-damage flag is rare in a
    state whose registrations are mostly wind, so a thousand-row sample can
    contain only ``False`` -- and treating that absence as "no true value
    exists" drops the predicate and silently widens the cohort. The sample is
    used for the column's *type*; the two possible values of a flag are known.
    """
    from . import api
    from .schema import truthy

    if not counter:
        return None
    for value in counter:
        if value is None:
            continue
        if truthy(value) is want:
            return literal(value)           # an observed value is best
    for value in counter:                   # otherwise infer from the type
        if value is None:
            continue
        if isinstance(value, bool):
            return "true" if want else "false"
        if isinstance(value, (int, float)):
            return "1" if want else "0"
        return None      # a string vocabulary we have not seen both sides of
    return None


def describe(counter):
    """Readable summary of sampled values, most common first."""
    if not counter:
        return "(no sample)"
    return ", ".join(
        "%s x%d" % ("null" if value is None else repr(value), count)
        for value, count in counter.most_common(8))
