"""Command line interface."""

import argparse
import os
import shutil
import sys

from . import analysis, api, cpi, datasets, pipeline, report as report_mod, states


DEFAULT_CACHE = os.path.join(
    os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache"),
    "fema-flood-gap")

BUNDLE_FORMATS = [("report.txt", "text"), ("report.md", "md"),
                  ("report.html", "html"), ("by-declaration.csv", "csv"),
                  ("report.json", "json")]


def build_parser():
    parser = argparse.ArgumentParser(
        prog="fema-flood-gap",
        description="Pull OpenFEMA IHP registrations and NFIP claims for one "
                    "state and compare what uninsured flooded homeowners "
                    "received from FEMA against what insured claimants were paid.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=EPILOG)
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("report", help="build a state report (default command)")
    _add_report_args(run)

    schema = sub.add_parser("schema", help="show how dataset fields resolved")
    _add_network_args(schema)

    cache = sub.add_parser("cache", help="inspect or clear the download cache")
    cache.add_argument("action", choices=["info", "clear"], nargs="?", default="info")
    cache.add_argument("--cache-dir", default=DEFAULT_CACHE)

    sub.add_parser("states", help="list recognized state and territory codes")
    return parser


def _add_network_args(parser):
    group = parser.add_argument_group("network and cache")
    group.add_argument("--cache-dir", default=DEFAULT_CACHE,
                       help="where downloaded pages are cached (default: %(default)s)")
    group.add_argument("--no-cache", action="store_true",
                       help="do not read or write the cache")
    group.add_argument("--refresh", action="store_true",
                       help="ignore cached pages and re-download")
    group.add_argument("--page-size", type=int, default=api.DEFAULT_PAGE_SIZE,
                       help="records per request, max 10000 (default: %(default)s)")
    group.add_argument("--timeout", type=int, default=180, help="per-request timeout, seconds")
    group.add_argument("--retries", type=int, default=5, help="attempts per request")
    group.add_argument("--paging", choices=["cursor", "skip"], default="cursor",
                       help="keyset paging on id (default) or offset paging")
    group.add_argument("--quiet", action="store_true", help="suppress progress output")


def _add_report_args(parser):
    parser.add_argument("state", nargs="?", help="state postal code or name, e.g. LA")
    parser.add_argument("--state", dest="state_opt", help=argparse.SUPPRESS)

    scope = parser.add_argument_group("scope")
    scope.add_argument("--since", "--min-year", dest="min_year", type=int,
                       help="only declarations from this year onward")
    scope.add_argument("--until", "--max-year", dest="max_year", type=int,
                       help="only declarations through this year")
    scope.add_argument("--disaster", dest="disasters", action="append", type=int,
                       help="limit to this disaster number (repeatable)")
    scope.add_argument("--incident-type", dest="incident_types", action="append",
                       help="limit to this declaration incident type, e.g. "
                            "'Flood' or 'Hurricane' (repeatable)")
    scope.add_argument("--flood-declarations-only", action="store_true",
                       help="limit to water-related incident types")

    cohort = parser.add_argument_group("cohort definition")
    cohort.add_argument("--include-renters", action="store_true",
                        help="do not restrict to owner-occupants")
    cohort.add_argument("--flood-basis", choices=["damage", "water", "any"],
                        default="damage",
                        help="what counts as flooded: the flood-damage flag "
                             "(default), a recorded water level, or either")
    cohort.add_argument("--unknown-insurance", choices=["exclude", "uninsured", "insured"],
                        default="exclude",
                        help="how to treat registrations with no flood-insurance "
                             "value (default: %(default)s)")
    cohort.add_argument("--primary-residence-only", action="store_true",
                        help="drop registrations flagged as non-primary residences")

    nfip = parser.add_argument_group("NFIP claim selection")
    nfip.add_argument("--nfip-owner-occupied", action="store_true",
                      help="restrict claims to single-family/owner-occupied "
                           "dwellings, the closest match to an IHP owner")
    nfip.add_argument("--nfip-primary-residence", action="store_true",
                      help="restrict claims to primary residences")
    nfip.add_argument("--nfip-since", type=int, help="earliest NFIP year of loss")
    nfip.add_argument("--nfip-until", type=int, help="latest NFIP year of loss")
    nfip.add_argument("--match-buffer-days", type=int, default=3,
                      help="days to widen each incident window when matching "
                           "claims to a declaration (default: %(default)s)")
    nfip.add_argument("--skip-nfip", action="store_true",
                      help="skip the NFIP pull (IHP figures only)")

    money = parser.add_argument_group("dollars")
    money.add_argument("--adjust-to", type=int, metavar="YEAR",
                       help="restate all dollars in this year's terms using CPI-U")
    money.add_argument("--cpi-file", help="JSON {\"year\": index} overriding the built-in CPI-U table")

    output = parser.add_argument_group("output")
    output.add_argument("--format", default="text",
                        choices=sorted(set(report_mod.RENDERERS)),
                        help="output format (default: %(default)s)")
    output.add_argument("--out", "-o", help="write to this file instead of stdout")
    output.add_argument("--bundle", metavar="DIR",
                        help="write every format into this directory")
    output.add_argument("--limit", type=int, default=25,
                        help="declarations shown in table output (default: %(default)s)")
    output.add_argument("--sort", choices=["ihp_total", "households", "disaster"],
                        default="ihp_total", help="declaration table ordering")
    output.add_argument("--skip-context", action="store_true",
                        help="skip the comparison-cohort counts")

    advanced = parser.add_argument_group("advanced")
    advanced.add_argument("--ihp-version", type=int, default=datasets.IHP[1],
                          help="OpenFEMA API version for the IHP dataset")
    advanced.add_argument("--nfip-version", type=int, default=datasets.NFIP[1],
                          help="OpenFEMA API version for the NFIP claims dataset")
    advanced.add_argument("--no-percentiles", action="store_true",
                          help="skip medians/percentiles to save memory on huge pulls")
    _add_network_args(parser)


EPILOG = """examples:
  fema-flood-gap LA
  fema-flood-gap TX --since 2005 --adjust-to 2025 --format md -o tx.md
  fema-flood-gap NC --flood-declarations-only --nfip-owner-occupied --bundle out/nc
  fema-flood-gap NJ --disaster 4086 --format json

The headline cohort is: owner-occupant registrations with FEMA-verified flood
damage and no flood insurance. IHP equals HA plus ONA, so the three are not
additive. Runs are cached on disk, so re-running with different cohort options
or output formats does not re-download anything.
"""


def make_client(args):
    return api.Client(
        cache_dir=None if args.no_cache else args.cache_dir,
        refresh=args.refresh,
        use_cache=not args.no_cache,
        page_size=args.page_size,
        timeout=args.timeout,
        max_retries=args.retries,
        paging=args.paging,
        progress=api.silent_progress if args.quiet else api._stderr_progress,
    )


def build_options(args, state):
    table = cpi.load_table(args.cpi_file) if args.cpi_file else None
    deflator = cpi.Deflator(args.adjust_to, table)
    keep_values = not args.no_percentiles

    cohort = analysis.CohortOptions(
        owner_only=not args.include_renters,
        flood_basis=args.flood_basis,
        unknown_insurance=args.unknown_insurance,
        primary_residence_only=args.primary_residence_only,
        keep_values=keep_values)

    nfip = analysis.NfipOptions(
        owner_occupied_only=args.nfip_owner_occupied,
        primary_residence_only=args.nfip_primary_residence,
        min_year=args.nfip_since if args.nfip_since is not None else args.min_year,
        max_year=args.nfip_until if args.nfip_until is not None else args.max_year,
        keep_values=keep_values)

    return pipeline.RunOptions(
        state=state, cohort=cohort, nfip=nfip, deflator=deflator,
        min_year=args.min_year, max_year=args.max_year,
        incident_types=args.incident_types,
        flood_declarations_only=args.flood_declarations_only,
        disasters=set(args.disasters) if args.disasters else None,
        match_buffer_days=args.match_buffer_days,
        ihp_version=args.ihp_version, nfip_version=args.nfip_version,
        skip_nfip=args.skip_nfip, skip_context=args.skip_context,
        sort=args.sort)


def cmd_report(args):
    raw_state = args.state or args.state_opt
    if not raw_state:
        sys.stderr.write("error: a state is required, e.g. `fema-flood-gap LA`\n")
        return 2
    try:
        state = states.resolve(raw_state)
    except states.UnknownState as exc:
        sys.stderr.write("error: %s\n" % exc)
        return 2

    client = make_client(args)
    options = build_options(args, state)
    result = pipeline.build(client, options)

    if args.bundle:
        os.makedirs(args.bundle, exist_ok=True)
        for filename, fmt in BUNDLE_FORMATS:
            path = os.path.join(args.bundle, filename)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(report_mod.render(result, fmt, args.limit))
            client.progress("wrote %s" % path)
    else:
        text = report_mod.render(result, args.format, args.limit)
        if args.out:
            directory = os.path.dirname(os.path.abspath(args.out))
            os.makedirs(directory, exist_ok=True)
            with open(args.out, "w", encoding="utf-8") as fh:
                fh.write(text)
            client.progress("wrote %s" % args.out)
        else:
            sys.stdout.write(text)

    client.progress("%d requests, %d served from cache"
                    % (client.requests_made, client.cache_hits))
    return 0


def cmd_schema(args):
    client = make_client(args)
    for label, loader in [("IHP", datasets.ihp_schema),
                          ("NFIP claims", datasets.nfip_schema),
                          ("Declarations", datasets.declaration_schema)]:
        resolved = loader(client)
        print("%s -- %s v%s (%s)"
              % (label, resolved.dataset, resolved.version, resolved.source))
        for logical, actual in sorted(resolved.bindings.items()):
            declared = resolved.types.get(actual, "?") if actual else "-"
            print("  %-22s %-42s %s" % (logical, actual or "(not present)", declared))
        print()
    return 0


def cmd_cache(args):
    directory = args.cache_dir
    if not os.path.isdir(directory):
        print("no cache at %s" % directory)
        return 0
    files = [os.path.join(directory, f) for f in os.listdir(directory)]
    size = sum(os.path.getsize(f) for f in files if os.path.isfile(f))
    if args.action == "clear":
        shutil.rmtree(directory)
        print("removed %s (%d files, %.1f MB)" % (directory, len(files), size / 1e6))
    else:
        print("%s\n  %d cached responses, %.1f MB" % (directory, len(files), size / 1e6))
    return 0


def cmd_states(_args):
    for abbr in sorted(states.STATES):
        print("%s  %s" % (abbr, states.STATES[abbr]))
    return 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    known = {"report", "schema", "cache", "states"}
    # `fema-flood-gap LA` should work without typing the subcommand.
    if argv and argv[0] not in known and not argv[0].startswith("-"):
        argv.insert(0, "report")
    elif argv and argv[0].startswith("-") and argv[0] not in ("-h", "--help"):
        argv.insert(0, "report")
    elif not argv:
        argv = ["--help"]

    args = build_parser().parse_args(argv)
    handlers = {"report": cmd_report, "schema": cmd_schema,
                "cache": cmd_cache, "states": cmd_states}
    handler = handlers.get(args.command)
    if handler is None:
        build_parser().print_help()
        return 2
    try:
        return handler(args)
    except api.OpenFemaError as exc:
        sys.stderr.write("\nOpenFEMA request failed: %s\n" % exc)
        return 1
    except KeyboardInterrupt:
        sys.stderr.write("\ninterrupted (cached pages are kept; re-run to resume)\n")
        return 130
    except BrokenPipeError:
        # `... | head` closes stdout early; exit quietly instead of dumping a
        # traceback over the user's terminal.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        return 0
