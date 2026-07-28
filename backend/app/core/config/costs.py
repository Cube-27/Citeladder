"""Stable identifiers for persisted execution-cost observations.

Provider pricing belongs to the later estimate workstream.  This module only
names the normalized, provider-reported usage projection written per completed
execution, so historic observations remain interpretable when pricing arrives.
"""

EXECUTION_COST_PROJECTION_VERSION = "provider-usage-v1"
MICRO_USD_PER_USD = 1_000_000
