"""Minimal OpenFEMA API client: cursor paging, retries, on-disk cache.

Stdlib only, on purpose -- this needs to run on an analyst's laptop with no
`pip install` step. The one non-obvious piece is paging: OpenFEMA's ``$skip``
degrades badly past a few hundred thousand rows and can repeat or drop records
while the underlying table is being refreshed, so we page on a keyset cursor
(``$orderby=id`` plus ``id gt <last id>``) and fall back to ``$skip`` only if a
dataset does not cooperate.
"""

import gzip
import hashlib
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "https://www.fema.gov/api/open"
USER_AGENT = "fema-flood-gap/1.0 (+https://www.fema.gov/about/openfema/api)"

# OpenFEMA caps $top at 10,000. 5,000 keeps individual responses ~10-20 MB for
# the wide NFIP rows, which is a friendlier retry unit on a flaky connection.
DEFAULT_PAGE_SIZE = 5000

# Floor for the adaptive shrink applied when a server keeps truncating a page.
MIN_PAGE_SIZE = 250

RETRY_STATUS = {408, 425, 429, 500, 502, 503, 504}

# Words OpenFEMA uses when it is the $filter it objects to, as opposed to some
# other malformed part of the request. Used to decide whether widening the
# query is a sensible recovery or would just repeat the same failure.
_FILTER_COMPLAINTS = ("filter", "operator", "operand", "predicate", "column",
                      "field", "attribute")


def looks_like_filter_rejection(error):
    """True when a 400 is plausibly about the ``$filter``, not the rest of the URL."""
    body = (getattr(error, "body", "") or "").lower()
    if not body:
        return True          # no detail to go on; the caller may still retry
    if "querystring parameter" in body or "query_parameter" in body:
        return False         # a malformed parameter, which widening will not fix
    return any(word in body for word in _FILTER_COMPLAINTS)


class OpenFemaError(RuntimeError):
    """Any non-recoverable failure talking to OpenFEMA."""


class HttpError(OpenFemaError):
    def __init__(self, status, url, body=""):
        self.status = status
        self.url = url
        self.body = body
        super().__init__("HTTP %s from %s%s" % (status, url, (": " + body) if body else ""))


def _error_body(exc):
    """Readable text from an error response.

    Error bodies arrive gzipped like any other (we send Accept-Encoding), and
    are usually a full HTML error page -- printing those raw dumps either
    binary or a screenful of markup over the user's terminal.
    """
    try:
        raw = exc.read()
    except Exception:
        return ""
    if not raw:
        return ""
    headers = getattr(exc, "headers", None)
    if headers is not None and headers.get("Content-Encoding") == "gzip":
        try:
            raw = gzip.decompress(raw)
        except (OSError, EOFError):
            return "(unreadable compressed error body)"
    text = raw.decode("utf-8", "replace")
    if "<" in text and ">" in text:
        text = re.sub(r"<[^>]+>", " ", text)
    text = " ".join(text.split())
    if not text:
        return ""
    return text[:200] + ("..." if len(text) > 200 else "")


def quote_literal(value):
    """Quote a string for an OData-ish ``$filter`` literal."""
    return "'" + str(value).replace("'", "''") + "'"


def format_literal(value, quote_numbers=False):
    """Render a Python value as a ``$filter`` literal of the right type.

    Quoting is not cosmetic: OpenFEMA rejects a quoted literal against a
    numeric column outright, so the id used for keyset paging has to be
    written as the type the column actually is.
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not quote_numbers:
        return repr(value) if isinstance(value, float) else str(value)
    return quote_literal(value)


def _sorts_before(left, right):
    """``left <= right`` without blowing up on mixed types."""
    try:
        return left <= right
    except TypeError:
        return str(left) <= str(right)


def or_filters(*parts):
    """OR a set of predicates, for a column with several matching values."""
    clean = [p for p in parts if p]
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    return " or ".join("(%s)" % p for p in clean)


def and_filters(*parts):
    clean = [p for p in parts if p]
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    return " and ".join("(%s)" % p for p in clean)


class Client:
    """Fetches OpenFEMA pages, caching each response body on disk.

    The cache is keyed on the full request URL, so re-running a report with a
    different cohort definition costs nothing as long as the underlying query
    is unchanged -- which matters when a single state's registration pull is
    hundreds of pages.
    """

    def __init__(self, cache_dir=None, refresh=False, use_cache=True,
                 page_size=DEFAULT_PAGE_SIZE, timeout=180, max_retries=5,
                 paging="cursor", progress=None):
        self.cache_dir = cache_dir
        self.refresh = refresh
        self.use_cache = use_cache and bool(cache_dir)
        self.page_size = max(1, min(int(page_size), 10000))
        self.timeout = timeout
        self.max_retries = max_retries
        self.paging = paging
        self.progress = progress if progress is not None else _stderr_progress
        self.requests_made = 0
        self.cache_hits = 0
        if self.use_cache:
            os.makedirs(self.cache_dir, exist_ok=True)

    # ---------------------------------------------------------------- plumbing

    def build_url(self, dataset, version, params):
        query = [(k, v) for k, v in params.items() if v is not None]
        return "%s/v%s/%s?%s" % (
            BASE_URL, version, dataset,
            urllib.parse.urlencode(query, quote_via=urllib.parse.quote),
        )

    def _cache_path(self, url):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:40]
        return os.path.join(self.cache_dir, digest + ".json.gz")

    def get(self, url):
        """GET a URL, returning parsed JSON, using and filling the disk cache."""
        path = self._cache_path(url) if self.use_cache else None
        if path and not self.refresh and os.path.exists(path):
            try:
                with gzip.open(path, "rt", encoding="utf-8") as fh:
                    payload = json.load(fh)
                self.cache_hits += 1
                return payload
            except (OSError, ValueError):
                # A truncated cache entry (interrupted run) should not be fatal.
                os.remove(path)

        payload = self._fetch(url)
        if path:
            tmp = path + ".tmp"
            with gzip.open(tmp, "wt", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, path)
        return payload

    def _request(self, url):
        """One HTTP attempt. Overridden wholesale by the test double.

        Kept separate from the retry loop so that retry, backoff, and the
        classification of transient failures are exercised by tests rather
        than replaced by them.
        """
        request = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
        })
        self.requests_made += 1
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            raw = response.read()
            if response.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            return json.loads(raw.decode("utf-8"))

    def _fetch(self, url):
        delay = 2.0
        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return self._request(url)
            except urllib.error.HTTPError as exc:
                body = _error_body(exc)
                if exc.code not in RETRY_STATUS:
                    # 400 usually means a $filter the dataset does not accept;
                    # callers catch this and retry with a simpler query.
                    raise HttpError(exc.code, url, body)
                last_error = HttpError(exc.code, url, body)
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                if retry_after and str(retry_after).isdigit():
                    delay = max(delay, float(retry_after))
            except (urllib.error.URLError, TimeoutError, ValueError, OSError,
                    http.client.HTTPException) as exc:
                # http.client.HTTPException covers IncompleteRead and
                # RemoteDisconnected: a chunked response cut off mid-transfer.
                # These are transient and belong in the retry loop -- they are
                # neither OSError nor ValueError, so they need naming outright.
                last_error = OpenFemaError("%s while fetching %s"
                                           % (exc.__class__.__name__ + ": " + str(exc)
                                              if str(exc) else exc.__class__.__name__,
                                              url))

            if attempt < self.max_retries:
                self.progress("  retry %d/%d in %.0fs (%s)"
                              % (attempt, self.max_retries - 1, delay, last_error))
                time.sleep(delay)
                delay = min(delay * 2, 60)
        raise last_error

    @staticmethod
    def extract_records(payload):
        """Pull the record array out of a response body.

        OpenFEMA names the array after the dataset, so we take whichever key
        isn't ``metadata``.
        """
        for key, value in payload.items():
            if key != "metadata" and isinstance(value, list):
                return value
        return []

    # ------------------------------------------------------------------ public

    def count(self, dataset, version, filter=None):
        """Row count for a query, via ``$inlinecount`` on a one-row page.

        OpenFEMA follows OData here: the value is ``allpages``, not ``all``.
        No ``$select`` is sent: naming a column here bought nothing (the page
        is one row) and failed outright on datasets without an ``id``.
        """
        url = self.build_url(dataset, version, {
            "$inlinecount": "allpages", "$top": 1, "$filter": filter,
        })
        payload = self.get(url)
        meta = payload.get("metadata") or {}
        if meta.get("count") is None:
            raise OpenFemaError("no count in metadata for %s" % url)
        return int(meta["count"])

    def metadata(self, dataset, version):
        url = self.build_url(dataset, version, {"$top": 1})
        return (self.get(url).get("metadata") or {})

    def records(self, dataset, version, select=None, filter=None, label=None,
                expected=None, key="id"):
        """Yield every record matching ``filter``, one page at a time.

        ``key`` is the field to order and page on -- pass
        ``schema.key_field()``, which is ``None`` for a dataset with no
        identifier. Without a key there is nothing to build a cursor from, so
        paging falls back to ``$skip``.
        """
        if key:
            select_clause = ",".join(sorted(set(select) | {key})) if select else None
        else:
            select_clause = ",".join(sorted(set(select))) if select else None
        mode = self.paging if key else "skip"
        seen = 0
        cursor = None
        skip = 0
        label = label or dataset
        quote_ids = False        # flipped if OpenFEMA rejects the literal's type
        page_size = self.page_size

        while True:
            if mode == "cursor":
                page_filter = and_filters(
                    filter,
                    "%s gt %s" % (key, format_literal(cursor, quote_ids))
                    if cursor else None)
                params = {"$top": page_size, "$filter": page_filter,
                          "$select": select_clause, "$orderby": key}
            else:
                params = {"$top": page_size, "$skip": skip, "$filter": filter,
                          "$select": select_clause, "$orderby": key}
            url = self.build_url(dataset, version, params)

            try:
                rows = self.extract_records(self.get(url))
            except HttpError as exc:
                if mode == "cursor" and exc.status == 400 and cursor is not None \
                        and not quote_ids and "data type" in (exc.body or "").lower():
                    # The id column is not the type we guessed from its value.
                    self.progress("  retrying the page cursor as a quoted literal")
                    quote_ids = True
                    continue
                if mode == "cursor" and exc.status == 400 and seen == 0:
                    # Dataset rejected keyset paging (no comparable id); restart
                    # on $skip rather than failing the whole run.
                    self.progress("  keyset paging rejected, falling back to $skip")
                    mode = "skip"
                    continue
                raise
            except OpenFemaError:
                # Every retry of this page failed. Before giving up on a pull
                # that may be hundreds of pages in, try asking for less: a
                # large page that the server keeps truncating often succeeds
                # when it is smaller.
                if page_size <= MIN_PAGE_SIZE:
                    raise
                page_size = max(MIN_PAGE_SIZE, page_size // 4)
                self.progress("  page failed repeatedly; retrying with %d rows "
                              "per request" % page_size)
                continue

            if not rows:
                break

            if mode == "cursor" and cursor is not None \
                    and _sorts_before(rows[0].get(key, ""), cursor):
                # The server returned rows at or before the cursor, meaning it
                # ignored the `id gt` predicate. Yielding these would duplicate
                # what we already emitted, so switch to offset paging from the
                # exact point we reached instead.
                self.progress("  keyset predicate not honoured, switching to $skip")
                mode, skip, cursor = "skip", seen, None
                continue

            for row in rows:
                yield row
            seen += len(rows)
            self.progress("  %s: %s rows%s" % (
                label, f"{seen:,}",
                " of ~%s" % f"{expected:,}" if expected else "",
            ))

            if len(rows) < page_size:
                break
            if mode == "cursor":
                next_cursor = rows[-1].get(key)
                if not next_cursor or next_cursor == cursor:
                    self.progress("  cursor stalled, falling back to $skip")
                    mode, skip = "skip", seen
                    cursor = None
                    continue
                cursor = next_cursor
            else:
                skip += len(rows)


def _stderr_progress(message):
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def silent_progress(message):
    pass
