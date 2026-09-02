"""Adaptive field resolution.

OpenFEMA renames and re-types fields between dataset versions (NFIP v1's
``amountPaidOnBuildingClaim`` vs v2's ``netBuildingPaymentAmount``; flags that
are integer 0/1 in one vintage and boolean in another). Rather than hard-code a
schema that quietly produces wrong numbers when it drifts, every field this
tool needs is declared as an ordered list of candidate names, resolved at run
time against the live schema, and reported so you can see what it bound to.
"""

from . import api

_TRUE = {"1", "y", "yes", "true", "t"}
_FALSE = {"0", "n", "no", "false", "f"}


class SchemaError(api.OpenFemaError):
    pass


class Schema:
    """Resolved field names and types for one dataset."""

    def __init__(self, dataset, version, fields, types=None, source="probe"):
        self.dataset = dataset
        self.version = version
        self.fields = list(fields)
        self.types = dict(types or {})
        self.source = source
        self._lower = {f.lower(): f for f in self.fields}
        self.bindings = {}

    def has(self, name):
        return name.lower() in self._lower

    def bind(self, logical, candidates, required=True):
        """Map a logical field to the first candidate the dataset actually has."""
        for candidate in candidates:
            actual = self._lower.get(candidate.lower())
            if actual:
                self.bindings[logical] = actual
                return actual
        if required:
            raise SchemaError(
                "%s v%s has no field for %r (tried %s). Available: %s"
                % (self.dataset, self.version, logical, ", ".join(candidates),
                   ", ".join(sorted(self.fields)[:40]))
            )
        self.bindings[logical] = None
        return None

    def name(self, logical):
        return self.bindings.get(logical)

    def type_of(self, logical):
        actual = self.name(logical)
        return self.types.get(actual) if actual else None

    def get(self, record, logical, default=None):
        actual = self.name(logical)
        if not actual:
            return default
        value = record.get(actual, default)
        return default if value is None else value

    def flag_literal(self, logical, truthy):
        """Render a boolean-ish filter literal in the type the dataset wants."""
        declared = (self.type_of(logical) or "").lower()
        if declared in ("boolean", "bool"):
            return "true" if truthy else "false"
        return "1" if truthy else "0"


def truthy(value):
    """Interpret OpenFEMA's assorted yes/no encodings. ``None`` means unknown."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    return None


def number(value):
    """Coerce a money/numeric field to float; unparseable or absent -> None."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None


def year_of(value):
    """Year from an OpenFEMA date string ('2016-08-11T00:00:00.000Z') or year."""
    if value is None or value == "":
        return None
    if isinstance(value, int):
        return value if 1800 < value < 2200 else None
    text = str(value).strip()
    if len(text) >= 4 and text[:4].isdigit():
        year = int(text[:4])
        return year if 1800 < year < 2200 else None
    return None


def date_key(value):
    """Sortable 'YYYY-MM-DD' from an OpenFEMA date, or None."""
    if not value:
        return None
    text = str(value).strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return None


def discover(client, dataset, version):
    """Resolve a dataset's schema, preferring the declared field metadata."""
    try:
        return _from_dataset_fields(client, dataset, version)
    except (api.OpenFemaError, KeyError, ValueError):
        return _from_probe(client, dataset, version)


def _from_dataset_fields(client, dataset, version):
    url = client.build_url("DataSetFields", 1, {
        "$top": 500,
        "$filter": "openFemaDataSet eq %s and datasetVersion eq %s"
                   % (api.quote_literal(dataset), version),
        "$select": "name,type",
    })
    rows = client.extract_records(client.get(url))
    if not rows:
        raise api.OpenFemaError("no field metadata for %s v%s" % (dataset, version))
    names, types = [], {}
    for row in rows:
        field = row.get("name")
        if not field:
            continue
        names.append(field)
        if row.get("type"):
            types[field] = row["type"]
    return Schema(dataset, version, names, types, source="DataSetFields")


def _from_probe(client, dataset, version):
    """Fall back to reading one record's keys.

    Types come out of the sampled values, so a null in the sample leaves a
    field untyped -- which is fine: ``flag_literal`` then defaults to 0/1,
    the encoding OpenFEMA uses for every flag this tool touches.
    """
    url = client.build_url(dataset, version, {"$top": 1})
    rows = client.extract_records(client.get(url))
    if not rows:
        raise SchemaError("could not probe %s v%s: no records returned" % (dataset, version))
    record = rows[0]
    types = {}
    for key, value in record.items():
        if isinstance(value, bool):
            types[key] = "boolean"
        elif isinstance(value, (int, float)):
            types[key] = "number"
        elif value is not None:
            types[key] = "text"
    return Schema(dataset, version, record.keys(), types, source="record probe")
