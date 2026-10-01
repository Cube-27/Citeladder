"""Policy export for the paid submission and free retrieval boundary."""

from app.core.config import dataforseo, llm_scraper
from app.core.config.costs import MICRO_USD_PER_USD


def dataforseo_policy(setting):
    return {
        "strip_characters": "".join(
            chr(point) for point in range(0x110000) if chr(point).isspace()
        ),
        "casefold_overrides": {
            chr(point): chr(point).casefold()
            for point in range(0x110000)
            if chr(point).casefold() != chr(point).lower()
        },
        "microusd_per_usd": MICRO_USD_PER_USD,
        "settings": {
            name: setting(name, dataforseo.DataForSeoSettings)
            for name in ("request_timeout_seconds", "recovery_deadline_hours")
        },
        "constants": {
            name.lower(): sorted(value) if isinstance(value, frozenset) else value
            for name, value in vars(dataforseo).items()
            if name.isupper()
            and not name.startswith("_")
            and isinstance(value, (str, int, float, bool, dict, frozenset))
        },
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
