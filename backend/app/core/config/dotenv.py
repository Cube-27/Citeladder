"""Standard-library environment loading for local schema maintenance only."""

from __future__ import annotations

import os
import re
from collections.abc import Iterator, Mapping
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]
PROJECT_ROOT = BASE_DIR.parent
DISABLE_DOTENV_VAR = "CITELADDER_DISABLE_DOTENV"
_KEY_VALUE = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")
_VARIABLE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
_QUOTED = re.compile(r"'([^'\\]|\\[\s\S])*'|\"([^\"\\]|\\[\s\S])*\"")
_ESCAPES = {"a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}


def _quoted_value(value: str, lines: Iterator[str]) -> str:
    while (match := _QUOTED.match(value)) is None:
        try:
            value += "\n" + next(lines)
        except StopIteration:
            raise ValueError("Invalid quoted schema environment assignment") from None
    remainder = value[match.end() :].strip()
    if remainder and not remainder.startswith("#"):
        raise ValueError("Invalid quoted schema environment assignment")
    quoted = match[0]
    escapes = {"\\": "\\", "'": "'"}
    if quoted[0] == '"':
        escapes.update({**_ESCAPES, '"': '"'})
    return re.sub(r"\\(.)", lambda item: escapes.get(item[1], item[0]), quoted[1:-1])


def read_env_file(path: Path, env: Mapping[str, str]) -> dict[str, str]:
    """Read local assignments, quotes and ${NAME} expansion without execution."""
    if not path.is_file():
        return {}
    values: dict[str, str] = {}
    lines = iter(path.read_text(encoding="utf-8").splitlines())
    for line in lines:
        match = _KEY_VALUE.match(line.strip())
        if match is None:
            continue
        key, value = match.groups()
        if value.startswith(("'", '"')):
            value = _quoted_value(value, lines)
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].rstrip()
        available = {**values, **env}
        values[key.upper()] = _VARIABLE.sub(
            lambda item, available=available: available.get(
                item[1].upper(), item[2] or ""
            ),
            value,
        )
    return values


def schema_environment(
    env: Mapping[str, str] | None = None,
    *,
    files: tuple[Path, ...] | None = None,
) -> dict[str, str]:
    """Root -> backend -> process precedence, with explicit test isolation."""
    source = {
        key.upper(): value
        for key, value in (os.environ if env is None else env).items()
    }
    values: dict[str, str] = {}
    disabled = source.get(DISABLE_DOTENV_VAR, "").strip().casefold()
    if disabled not in {"1", "true", "yes", "on"}:
        for path in (
            files if files is not None else (PROJECT_ROOT / ".env", BASE_DIR / ".env")
        ):
            values.update(read_env_file(path, {**values, **source}))
    return {**values, **source}
