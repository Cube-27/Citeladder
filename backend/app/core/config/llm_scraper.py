"""DataForSEO consumer-scraper request policy; no paid discovery on reads."""

from typing import Final

from app.core.config.dataforseo import serialize_keyword

PRODUCTS: Final = {"chatgpt_search": "chat_gpt", "gemini_consumer": "gemini"}
KEYWORD_MAX_CHARS: Final = 2000
PRIORITY: Final = 1
PATH_ID_LIST: Final = "/v3/ai_optimization/id_list"
RECONCILE_MAX_PAGES: Final = 10
# Conservative supported launch context, documented by both task-post examples.
# Expanding this allowlist requires product-specific location/language evidence.
SUPPORTED_CONTEXTS: Final = {
    "chatgpt_search": frozenset({(2840, "en")}),
    "gemini_consumer": frozenset({(2840, "en")}),
}


def request_settings(engine: str) -> dict:
    settings = {"priority": PRIORITY}
    if engine == "chatgpt_search":
        settings["force_web_search"] = True
    return settings


def task_path(engine: str, operation: str) -> str:
    return f"/v3/ai_optimization/{PRODUCTS[engine]}/llm_scraper/{operation}"


def scraper_keyword(prompt: str) -> str:
    return serialize_keyword(prompt, limit=KEYWORD_MAX_CHARS)
