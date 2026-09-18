"""DataForSEO Google Organic payloads for the AI Overview parser.

**Provenance.** The plan cites a real captured response at
``docs/evaluations/SERP_sample_result.json``. That file is NOT in this
repository — it was never committed and is absent from history. These
fixtures are therefore reconstructed from the plan's structural description
of it, which is specific: sixteen items, the AI Overview at
``rank_absolute: 3``, four ``ai_overview_element`` blocks of which only the
second carries ``links[]``, five root references of which two are
``www.google.com`` Shopping URLs, and ``items[1].references`` duplicating the
root list.

They therefore prove the parser matches the DOCUMENTED shape. They do not
prove it matches a live response, and they are not a substitute for the
captured sample. When that file lands, point
``test_ai_overview_parser.py::test_the_captured_sample_yields_five_citations``
at it and delete this note.
"""

from __future__ import annotations

from typing import Any

BRAND_DOMAIN = "bestandless.com.au"
COMPETITOR_DOMAIN = "kmart.com.au"
KEYWORD = "best value kids school uniforms australia"

# Two of the five root references are Google's own Shopping surface. A brand
# named beside one of these is NOT cited by it: the reference belongs to
# Google. This is the fixture for that rule.
GOOGLE_SHOPPING_URL_A = (
    "https://www.google.com/search?q=kids+school+uniforms&prds=abc123&sa=X"
)
GOOGLE_SHOPPING_URL_B = "https://www.google.com/search?q=school+shirts&prds=def456&sa=X"

_ROOT_REFERENCES: list[dict[str, Any]] = [
    {
        "type": "ai_overview_reference",
        "source": "Best&Less",
        "domain": f"www.{BRAND_DOMAIN}",
        "url": f"https://www.{BRAND_DOMAIN}/school-uniforms",
        "title": "School Uniforms | Best&Less",
        "text": "Shop school uniforms from $5.",
    },
    {
        "type": "ai_overview_reference",
        "source": "Kmart",
        "domain": COMPETITOR_DOMAIN,
        "url": f"https://{COMPETITOR_DOMAIN}/category/school-uniforms",
        "title": "School Uniforms - Kmart Australia",
        "text": "Everyday low prices on school basics.",
    },
    {
        "type": "ai_overview_reference",
        "source": "Choice",
        "domain": "choice.com.au",
        "url": "https://choice.com.au/reviews/school-uniform-value",
        "title": "Which school uniforms are best value?",
        "text": "We compared eight Australian retailers.",
    },
    {
        "type": "ai_overview_reference",
        "source": "Google Shopping",
        "domain": "www.google.com",
        "url": GOOGLE_SHOPPING_URL_A,
        "title": "Kids school uniforms",
        "text": "Shopping results",
    },
    {
        "type": "ai_overview_reference",
        "source": "Google Shopping",
        "domain": "www.google.com",
        "url": GOOGLE_SHOPPING_URL_B,
        "title": "School shirts",
        "text": "Shopping results",
    },
]


def _ai_overview_block() -> dict[str, Any]:
    """Four elements; only the second carries links and nested references."""
    return {
        "type": "ai_overview",
        "rank_group": 1,
        # The position of the BLOCK on the SERP among sixteen items.
        "rank_absolute": 3,
        "position": "left",
        # Describes how Google PRODUCED the block, not whether the DataForSEO
        # task has finished. The captured sample carries `false` alongside a
        # fully populated overview, so it must never be read as pending.
        "asynchronous_ai_overview": False,
        "markdown": (
            "For value school uniforms in Australia, Best&Less and Kmart are "
            "the most commonly recommended retailers.\n"
        ),
        "items": [
            {
                "type": "ai_overview_element",
                "title": "Best value school uniforms",
                "text": (
                    "For value school uniforms in Australia, Best&Less and "
                    "Kmart are the most commonly recommended retailers."
                ),
                "links": None,
                "references": None,
            },
            {
                "type": "ai_overview_element",
                "title": "",
                "text": (
                    "Best&Less stocks a full school range from $5, while "
                    "Kmart focuses on everyday basics."
                ),
                # Only this element carries inline links. LINKED is a separate
                # signal from CITED, and this is where it comes from.
                "links": [
                    {
                        "type": "link_element",
                        "title": "Best&Less school uniforms",
                        "url": f"https://www.{BRAND_DOMAIN}/school-uniforms",
                        "domain": f"www.{BRAND_DOMAIN}",
                    },
                    {
                        "type": "link_element",
                        "title": "Kmart school uniforms",
                        "url": f"https://{COMPETITOR_DOMAIN}/category/school-uniforms",
                        "domain": COMPETITOR_DOMAIN,
                    },
                ],
                # Duplicates the root list exactly. Ingesting both would double
                # every citation count in Sources.
                "references": list(_ROOT_REFERENCES),
            },
            {
                "type": "ai_overview_element",
                "title": "Price comparison",
                "text": "",
                # A brand named ONLY in a table cell is named in the answer.
                # A text-only walk would miss Target entirely.
                "table": {
                    "table_header": ["Retailer", "Polo from"],
                    "table_content": [
                        ["Best&Less", "$5"],
                        ["Kmart", "$6"],
                        ["Target", "$9"],
                    ],
                },
                "links": None,
                "references": None,
            },
            {
                "type": "ai_overview_element",
                "title": "",
                "text": "",
                # No plain text, so the markdown rendering is the fallback.
                "markdown": "Check sizing guides before ordering online.",
                "links": None,
                "references": None,
            },
        ],
        "references": list(_ROOT_REFERENCES),
    }


def _filler_items(count: int) -> list[dict[str, Any]]:
    """Other item types. Retained as raw evidence, read by no projection."""
    types = [
        "organic",
        "people_also_ask",
        "popular_products",
        "local_pack",
        "related_searches",
        "google_reviews",
    ]
    return [
        {
            "type": types[index % len(types)],
            "rank_absolute": index + 4,
            "title": f"Other SERP feature {index}",
        }
        for index in range(count)
    ]


def completed_task(*, task_id: str = "task-0001", with_overview: bool = True) -> dict:
    """One completed task object, as an element of ``tasks[]``."""
    items: list[dict[str, Any]] = []
    if with_overview:
        items.append(_ai_overview_block())
    items.extend(_filler_items(15 if with_overview else 16))
    item_types = sorted({str(item["type"]) for item in items})
    return {
        "id": task_id,
        "status_code": 20000,
        "status_message": "Ok.",
        "time": "1.8273 sec.",
        "cost": 0.002,
        "result_count": 1,
        "data": {
            "api": "serp",
            "function": "task_get",
            "se": "google",
            "se_type": "organic",
            "keyword": KEYWORD,
            "location_code": 2036,
            "language_code": "en",
            "device": "desktop",
            "os": "windows",
            "depth": 10,
            "load_async_ai_overview": True,
            "tag": "audit:1:0:0:google_ai_overview",
        },
        "result": [
            {
                "keyword": KEYWORD,
                "type": "organic",
                "se_domain": "google.com.au",
                "location_code": 2036,
                "language_code": "en",
                "datetime": "2026-09-17 11:42:06 +00:00",
                "item_types": item_types,
                "items_count": len(items),
                "items": items,
            }
        ],
    }


def response(*tasks: dict[str, Any], status_code: int = 20000) -> dict[str, Any]:
    """The full API envelope. A production parser unwraps this first."""
    return {
        "version": "0.1.20260901",
        "status_code": status_code,
        "status_message": "Ok." if status_code == 20000 else "Error.",
        "time": "2.0114 sec.",
        "cost": 0.002,
        "tasks_count": len(tasks),
        "tasks_error": 0,
        "tasks": list(tasks),
    }


def task_with_status(status_code: int, *, task_id: str = "task-0001") -> dict[str, Any]:
    """A task carrying only a status — queued, handed or failed."""
    return {
        "id": task_id,
        "status_code": status_code,
        "status_message": "…",
        "cost": 0,
        "result": None,
    }
