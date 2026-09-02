"""Entry point for `python -m fema_flood`.

Also tolerates `python fema_flood` (no -m), which runs this file as a loose
script with no package context and would otherwise fail on the relative
import. Recovering is a two-line path fix and saves an unhelpful traceback.
"""

try:
    from .cli import main
except ImportError:  # pragma: no cover - exercised via subprocess in tests
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from fema_flood.cli import main

raise SystemExit(main())
