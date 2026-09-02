"""OpenFEMA dataset catalog lookup.

Dataset versions change -- OpenFEMA republishes a table as v2 and retires v1,
and the endpoint path carries the version, so a stale guess is a 404. Rather
than hard-code versions and break, the tool reads the catalog OpenFEMA
publishes about itself and picks the current version of each dataset it needs.
"""

from . import api


class CatalogError(api.OpenFemaError):
    pass


def _version_number(entry):
    try:
        return int(entry.get("version"))
    except (TypeError, ValueError):
        return 0


def _deprecated(entry):
    return bool(entry.get("depDate"))


def fetch(client):
    """All catalog rows, fetched once per client and reused."""
    cached = getattr(client, "_catalog_cache", None)
    if cached is not None:
        return cached
    url = client.build_url("DataSets", 1, {"$top": 1000})
    rows = client.extract_records(client.get(url))
    client._catalog_cache = rows
    return rows


def entries_for(client, name):
    """Every published version of one dataset, newest first."""
    lowered = name.lower()
    matches = [r for r in fetch(client) if (r.get("name") or "").lower() == lowered]
    return sorted(matches, key=_version_number, reverse=True)


def search(client, keyword):
    """Catalog rows whose name or title contains ``keyword``."""
    lowered = keyword.lower()
    hits = [r for r in fetch(client)
            if lowered in (r.get("name") or "").lower()
            or lowered in (r.get("title") or "").lower()]
    return sorted(hits, key=lambda r: ((r.get("name") or ""), -_version_number(r)))


def resolve(client, name, requested=None, hint=None):
    """Pick the version of ``name`` to query.

    Returns ``(version, entry, note)``. An explicit ``requested`` version is
    honoured even if the catalog disagrees -- the catalog is a convenience, not
    an authority to override the operator -- but the mismatch comes back as a
    note so it lands in the report.
    """
    try:
        entries = entries_for(client, name)
    except api.OpenFemaError as exc:
        if requested is None:
            raise CatalogError(
                "could not read the OpenFEMA dataset catalog (%s), so the "
                "version of %s is unknown. Pass an explicit version to skip "
                "this lookup." % (exc, name))
        return requested, None, "catalog unavailable; used the version given"

    if not entries:
        suggestions = _suggest(client, name, hint)
        raise CatalogError(
            "OpenFEMA has no dataset named %r.%s" % (name, suggestions))

    live = [e for e in entries if not _deprecated(e)]
    pool = live or entries
    best = pool[0]
    version = _version_number(best)

    if requested is not None:
        match = next((e for e in entries if _version_number(e) == requested), None)
        if match is None:
            return requested, None, (
                "v%s is not in the catalog for %s (published: %s)"
                % (requested, name,
                   ", ".join("v%d" % _version_number(e) for e in entries)))
        if _deprecated(match):
            return requested, match, (
                "v%s of %s is deprecated (%s); v%d is current"
                % (requested, name, match.get("depDate"), version))
        return requested, match, None

    note = None
    if not live:
        note = ("every published version of %s is deprecated; using v%d"
                % (name, version))
    return version, best, note


def _suggest(client, name, hint):
    """Name candidates for a dataset that is not in the catalog."""
    keyword = hint or _longest_word(name)
    try:
        hits = search(client, keyword)
    except api.OpenFemaError:
        return ""
    names = []
    for entry in hits:
        label = "%s (v%d)" % (entry.get("name"), _version_number(entry))
        if label not in names:
            names.append(label)
    if not names:
        return " Run `fema-flood-gap datasets` to list what is published."
    return (" Datasets matching %r: %s. Use --ihp-dataset / --nfip-dataset to "
            "point at the right one." % (keyword, "; ".join(names[:12])))


def _longest_word(name):
    import re
    words = re.findall(r"[A-Z][a-z]+", name) or [name]
    return max(words, key=len)


def describe(entry):
    if not entry:
        return ""
    bits = []
    if entry.get("recordCount"):
        bits.append("%s records" % format(int(entry["recordCount"]), ","))
    if entry.get("lastRefresh"):
        bits.append("refreshed %s" % str(entry["lastRefresh"])[:10])
    if entry.get("depDate"):
        bits.append("DEPRECATED %s" % str(entry["depDate"])[:10])
    return ", ".join(bits)
