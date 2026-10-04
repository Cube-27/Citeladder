"""Persisted schema vocabulary; application policy is native."""

from __future__ import annotations

from typing import Final

AI_REFERRAL_RULE_VERSION: Final = "ai-referral-rules-1"

AI_REFERRAL_ANALYZER_VERSION: Final = "ai-referrals-v1"

AI_REFERRAL_FORMULA_VERSION: Final = "ai-referral-sessions-v1"

REFERRAL_SANITIZE_VERSION: Final = "referral-sanitize-1"

AI_SOURCE_OTHER: Final = "other"

ANALYTICS_TASK_KIND_INGEST_REFERRALS: Final = "ingest_referrals"

ANALYTICS_TASK_MAX_ATTEMPTS: Final = 3
