"""Policy export for the paid submission and free retrieval boundary."""

from app.connectors.search_surfaces import contracts
from app.core.config import dataforseo, llm_scraper
from app.core.config.costs import MICRO_USD_PER_USD
from scripts.ts_platform_constants import constants


def dataforseo_policy(setting):
    return {
        **_unicode_policy(),
        "microusd_per_usd": MICRO_USD_PER_USD,
        "surface": constants(contracts, (str, frozenset)),
        "settings": {
            name: setting(name, dataforseo.DataForSeoSettings)
            for name in (
                "request_timeout_seconds",
                "recovery_deadline_hours",
                "max_response_bytes",
            )
        },
        "constants": constants(dataforseo, (str, int, float, bool, dict, frozenset)),
        "scraper": {
            "products": llm_scraper.PRODUCTS,
            "request_settings": {
                engine: llm_scraper.request_settings(engine)
                for engine in llm_scraper.PRODUCTS
            },
            "keyword_max_chars": llm_scraper.KEYWORD_MAX_CHARS,
            "priority": llm_scraper.PRIORITY,
            "id_list_path": llm_scraper.PATH_ID_LIST,
            "reconcile_max_pages": llm_scraper.RECONCILE_MAX_PAGES,
        },
    }


def _unicode_policy():
    return {
        "strip_characters": "".join(
            chr(point) for point in range(0x110000) if chr(point).isspace()
        ),
        "casefold_overrides": {
            chr(point): chr(point).casefold()
            for point in range(0x110000)
            if chr(point).casefold() != chr(point).lower()
        },
    }
