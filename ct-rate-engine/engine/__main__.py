"""Allow ``python -m engine`` to behave like ``python -m engine.quote``."""

from engine.quote import main

if __name__ == "__main__":
    raise SystemExit(main())
