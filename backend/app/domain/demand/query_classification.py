"""Persisted query identity retained for the MCP query-evidence reader."""

import re
import unicodedata

_TOKEN_RE = re.compile(r"[\w]+", re.UNICODE)


def normalize_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(_TOKEN_RE.findall(normalized))
