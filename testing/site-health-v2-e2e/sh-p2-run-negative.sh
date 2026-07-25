#!/usr/bin/env bash
# Suite C wrapper: swap fixture robots.txt to the deny variant, run the
# negative e2e, ALWAYS restore variant A afterwards.
#
# NOTE: the worker caches robots.txt per authority in-memory for 24h
# (robots_cache_ttl_seconds), populated lazily at crawl time. Run Suite C
# against a FRESH worker (restart it before invoking this wrapper), and
# restart it again afterwards before Suite D, or crawls read the stale
# cached policy. See README "How to run".
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
FIXTURE_DIR="${SH_FIXTURE_DIR:-$HERE/fixture}"

BAK="$(mktemp /tmp/sh-robots-variantA.XXXXXX.bak)"
cp "$FIXTURE_DIR/robots.txt" "$BAK"
restore() { cp "$BAK" "$FIXTURE_DIR/robots.txt"; rm -f "$BAK"; }
trap restore EXIT

cp "$HERE/fixture/robots-deny.txt" "$FIXTURE_DIR/robots.txt"
echo "robots.txt swapped to variant B (deny SearchifySiteHealthBot):"
curl -s "${SH_FIXTURE_LOCAL:-http://localhost:9900}/robots.txt" | head -3

cd "$REPO/backend" && uv run python "$HERE/sh-p2-e2e-negative.py"
