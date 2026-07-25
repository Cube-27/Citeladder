# Commerce attribution domain package (WS-B).
#
# A pure PROJECTION over the integrations-owned ``IntegrationMetricRow``
# ecommerce fact rows (invariants 2 + 7): ``snapshot.py`` holds the PURE A1
# projection math (no DB, no network, no clock) plus the DB-only
# ``attribution_snapshot`` refresh executor — NO provider I/O anywhere in
# this package. ``schemas.py`` / ``service.py`` are the persisted-read DTOs
# and the read service behind ``api/commerce.py`` (reads serve persisted
# snapshots only — never a recomputation, invariant 7).
