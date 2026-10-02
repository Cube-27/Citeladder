"""Shared project/operator defaults and frozen scraper product identity."""

from app.core.config import dataforseo, llm_scraper


def dataforseo_policy():
    return {
        "constants": {
            "default_device": dataforseo.DEFAULT_DEVICE,
            "default_language_code": dataforseo.DEFAULT_LANGUAGE_CODE,
            "default_location_code": dataforseo.DEFAULT_LOCATION_CODE,
        },
        "scraper": {"products": llm_scraper.PRODUCTS},
    }
