"""An in-memory stand-in for OpenFEMA.

Subclasses the real :class:`fema_flood.api.Client` and replaces only the HTTP
call, so the tests exercise the genuine URL building, ``$filter`` construction,
keyset paging, schema discovery, and aggregation code -- everything except the
socket.
"""

import re
import urllib.parse

from fema_flood import api

# Every filter this tool emits is a conjunction of `field <op> literal` terms,
# so a term scanner is an exact interpreter for them rather than an approximation.
TERM = re.compile(r"(\w+)\s+(eq|gt|ge|lt|le|ne)\s+('(?:[^']|'')*'|[^\s()]+)")


def _literal(token):
    if token.startswith("'"):
        return token[1:-1].replace("''", "'")
    lowered = token.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    try:
        return int(token)
    except ValueError:
        try:
            return float(token)
        except ValueError:
            return token


def _equal(actual, expected):
    if actual is None:
        return expected is None
    if isinstance(expected, bool) or isinstance(actual, bool):
        return bool(actual) == bool(expected)
    if isinstance(expected, (int, float)) and not isinstance(actual, str):
        return float(actual) == float(expected)
    return str(actual) == str(expected)


def matches(record, filter_string):
    if not filter_string:
        return True
    for field, op, token in TERM.findall(filter_string):
        expected = _literal(token)
        actual = record.get(field)
        if op == "eq":
            if not _equal(actual, expected):
                return False
        elif op == "ne":
            if _equal(actual, expected):
                return False
        else:
            if actual is None:
                return False
            left, right = actual, expected
            if isinstance(left, str) or isinstance(right, str):
                left, right = str(left), str(right)
            if op == "gt" and not left > right:
                return False
            if op == "ge" and not left >= right:
                return False
            if op == "lt" and not left < right:
                return False
            if op == "le" and not left <= right:
                return False
    return True


class FakeClient(api.Client):
    """Serves canned tables; records every URL requested for assertions."""

    def __init__(self, tables, field_types=None, last_refresh="2026-01-15T00:00:00.000Z",
                 reject_compound_filters=False, **kwargs):
        kwargs.setdefault("cache_dir", None)
        kwargs.setdefault("use_cache", False)
        kwargs.setdefault("progress", api.silent_progress)
        super().__init__(**kwargs)
        self.tables = tables
        self.field_types = field_types or {}
        self.last_refresh = last_refresh
        self.reject_compound_filters = reject_compound_filters
        self.urls = []

    def _request(self, url):
        self.urls.append(url)
        path = urllib.parse.urlparse(url).path
        dataset = path.rsplit("/", 1)[-1]
        params = {k: v[0] for k, v in
                  urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}
        filter_string = params.get("$filter")

        if dataset == "DataSetFields":
            return self._fields_response(filter_string)

        rows = self.tables.get(dataset)
        if rows is None:
            raise api.HttpError(404, url, "unknown dataset %s" % dataset)
        if self.reject_compound_filters and filter_string and " and " in filter_string:
            raise api.HttpError(400, url, "compound filter not supported")

        rows = [r for r in rows if matches(r, filter_string)]
        order_by = params.get("$orderby")
        if order_by:
            if any(order_by not in row for row in rows):
                raise api.HttpError(400, url, '{"error":[{"code":"OF_OQP_003",'
                                    '"type":"$orderby criteria error","message":'
                                    '"Criteria includes field not in the data model."}]}')
            rows = sorted(rows, key=lambda r: r[order_by])

        count = len(rows)
        skip = int(params.get("$skip", 0))
        top = int(params.get("$top", 1000))
        page = rows[skip:skip + top]

        select = params.get("$select")
        if select:
            keep = set(select.split(","))
            known = set()
            for row in rows or self.tables.get(dataset) or []:
                known |= set(row)
            missing = sorted(k for k in keep if known and k not in known)
            if missing:
                # The real API rejects this outright (OF_OQP_003), which is how
                # the id-on-every-dataset assumption stayed hidden.
                raise api.HttpError(400, url, '{"error":[{"code":"OF_OQP_003",'
                                    '"type":"$select criteria error","message":'
                                    '"Criteria includes field \\"%s\\" not found '
                                    'in the data model."}]}' % missing[0])
            page = [{k: v for k, v in row.items() if k in keep} for row in page]

        metadata = {"lastRefresh": self.last_refresh}
        inlinecount = params.get("$inlinecount")
        if inlinecount is not None and inlinecount not in ("allpages", "none"):
            # The real API is strict about this, and getting it wrong is what
            # broke the first live run.
            raise api.HttpError(400, url, '{"error":"Bad Request","message":'
                                '"Unexpected querystring parameter: \'$inlinecount '
                                'must be \\"allpages\\" or \\"none\\" (was '
                                '\\"%s\\")\'","code":"INVALID_QUERY_PARAMETER"}'
                                % inlinecount)
        if inlinecount == "allpages":
            metadata["count"] = count
        return {"metadata": metadata, dataset: page}

    def _fields_response(self, filter_string):
        match = re.search(r"openFemaDataSet eq '([^']+)'", filter_string or "")
        dataset = match.group(1) if match else None
        declared = self.field_types.get(dataset)
        if declared is None:
            # Mimic a dataset with no published field metadata, forcing the
            # client onto its record-probe fallback.
            return {"metadata": {}, "DataSetFields": []}
        rows = [{"name": name, "type": kind} for name, kind in declared.items()]
        return {"metadata": {}, "DataSetFields": rows}
