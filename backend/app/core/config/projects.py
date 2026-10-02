"""Shared Python model/operator defaults; runtime policy is native."""

from __future__ import annotations

from typing import Final

BENCHMARK_MODE_CONTROLLED_LOCALIZED: Final = "controlled_localized"

DEFAULT_BENCHMARK_MODE: Final = BENCHMARK_MODE_CONTROLLED_LOCALIZED

PROMPT_ORIGIN_MANUAL: Final = "manual"

DEFAULT_PROMPT_ORIGIN: Final = PROMPT_ORIGIN_MANUAL

DEFAULT_REPETITIONS: Final = 1
