"""Versioned, bounded policy for crawl-local lexical topic inventory."""

from typing import Final

TOPICAL_FORMULA_VERSION: Final = "site-topical-1"
TOPICAL_MIN_CORPUS_PAGES: Final = 5
TOPICAL_MIN_PAGE_TERMS: Final = 20
TOPICAL_MAX_PAGES: Final = 1000
TOPICAL_MAX_FEATURES: Final = 4000
TOPICAL_MAX_CLUSTERS: Final = 12
TOPICAL_MAX_ITERATIONS: Final = 20
TOPICAL_OUTLIER_THRESHOLD: Final = 0.65
TOPICAL_MAX_OUTLIERS: Final = 25
TOPICAL_CLUSTER_TOP_TERMS: Final = 8
