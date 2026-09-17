"""The entity roster one page assessment was judged against.

A presence verdict is only meaningful relative to the names it looked for.
Adding a competitor, or an alias, changes what every earlier assessment would
have concluded -- so each verdict records the roster it used rather than
quietly ageing into a claim nobody made.

Because the normalized page text is not retained, re-judging an old snapshot
against a new roster is not possible: it costs a fresh retrieval. That is the
honest consequence of not republishing someone else's page, and it is why this
value is stored rather than recomputed on read.
"""

from __future__ import annotations

import json
from hashlib import sha256
from typing import Any

from app.core.config.source_pages import SOURCE_PAGE_PRESENCE_VERSION


def project_roster(configuration: dict[str, Any]) -> str:
    """A stable fingerprint of the brand and competitor names in use.

    Taken from the audit's FROZEN configuration, so it describes the roster
    that was actually measured rather than whatever the project looks like
    when the inspection happens to run.
    """
    identity = {
        "brand": str(configuration.get("brand_name") or ""),
        "brand_aliases": sorted(
            str(alias) for alias in (configuration.get("brand_aliases") or [])
        ),
        "competitors": sorted(
            [
                str(item.get("name") or ""),
                *sorted(str(alias) for alias in (item.get("aliases") or [])),
            ]
            for item in (configuration.get("competitors") or [])
        ),
        "detector": SOURCE_PAGE_PRESENCE_VERSION,
    }
    digest = sha256(json.dumps(identity, sort_keys=True).encode("utf-8")).hexdigest()
    return f"roster-{digest[:32]}"
