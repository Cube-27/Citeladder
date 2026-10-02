"""Commerce discovery's serialization in the Python-owned TypeScript policy export."""

from collections.abc import Callable
from typing import Any

from pydantic_settings import BaseSettings

from app.core.config import commerce_catalog as c


def discovery_policy(
    setting_spec: Callable[[str, type[BaseSettings]], dict[str, Any]],
) -> dict[str, Any]:
    return {
        "result_limit": c.COMMERCE_COMPETITOR_RESULT_LIMIT,
        "provider_result_limit": c.COMMERCE_COMPETITOR_PROVIDER_RESULT_LIMIT,
        "query_attribute_limit": c.COMMERCE_COMPETITOR_QUERY_ATTRIBUTE_LIMIT,
        "name_max_words": c.COMMERCE_COMPETITOR_TARGET_NAME_MAX_WORDS,
        "snippet_chars": c.COMMERCE_COMPETITOR_KEENABLE_SNIPPET_CHARS,
        "verify_concurrency": c.COMMERCE_COMPETITOR_VERIFY_CONCURRENCY,
        "verify_timeout_seconds": c.COMMERCE_COMPETITOR_VERIFY_TIMEOUT_SECONDS,
        "price_bands": [
            (None if ceiling == float("inf") else ceiling, label)
            for ceiling, label in c.COMMERCE_COMPETITOR_PRICE_BANDS
        ],
        "page_kinds": {
            kind: sorted(values)
            for kind, values in c.COMMERCE_COMPETITOR_PAGE_KINDS_BY_TARGET.items()
        },
        "excluded_hosts": c.COMMERCE_COMPETITOR_EXCLUDED_HOST_SUFFIXES,
        "excluded_paths": c.COMMERCE_COMPETITOR_EXCLUDED_PATH_TOKENS,
        "editorial_patterns": c.COMMERCE_EDITORIAL_TITLE_PATTERNS,
        "second_hand_tokens": c.COMMERCE_SECOND_HAND_TOKENS,
        "provider_version": c.COMMERCE_COMPETITOR_PROVIDER_VERSION,
        "validator_version": c.COMMERCE_COMPETITOR_VALIDATOR_VERSION,
        "settings": {
            name: setting_spec(name, c.CommerceSettings)
            for name in c.CommerceSettings.model_fields
        },
    }
