"""The page-kind vocabulary itself, and nothing else.

One small module holding the bare tokens, so every catalog that DESCRIBES a
kind -- its rules, its profile, the schema it should declare, the shapes an
answer engine favours -- can import the vocabulary without importing each
other. Keeping the tokens beside any one of those catalogs is what made the
first attempt at separating them circular.

Re-exported from ``site_health_taxonomy``, so existing importers are unaffected.
"""

from __future__ import annotations

from typing import Final

PAGE_KIND_HOMEPAGE: Final = "homepage"
PAGE_KIND_ARTICLE: Final = "article"
PAGE_KIND_PRODUCT: Final = "product"
PAGE_KIND_CATEGORY: Final = "category"
PAGE_KIND_PRICING: Final = "pricing"
PAGE_KIND_DOCS: Final = "docs"
PAGE_KIND_FAQ: Final = "faq"
PAGE_KIND_ABOUT_CONTACT: Final = "about_contact"
PAGE_KIND_OTHER: Final = "other"
PAGE_KIND_SERVICE: Final = "service"
PAGE_KIND_LOCAL: Final = "local"
PAGE_KIND_GUIDE: Final = "guide"
PAGE_KIND_COMPARISON: Final = "comparison"
PAGE_KIND_CASE_STUDY_REVIEW: Final = "case_study_review"
PAGE_KIND_TRUST_POLICY: Final = "trust_policy"
