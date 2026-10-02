"""Content-format IDs still shared by the opportunity policy exporter."""

import re
from pathlib import Path
from typing import Final

CONTENT_FORMAT_IDS: Final[tuple[str, ...]] = tuple(
    re.findall(
        r"^## ([a-z_]+) — .+$",
        (Path(__file__).parent / "content_formats.md").read_text(encoding="utf-8"),
        re.MULTILINE,
    )
)
