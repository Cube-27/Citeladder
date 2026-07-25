#!/usr/bin/env bash
# Rewrite the fixture tunnel host hardcoded in the harness files.
#
# The crawler enforces an SSRF url_policy (no loopback/private IPs), so the
# fixture must be served through a public tunnel host; every fresh `port
# expose` mints a NEW host, which must be propagated here. Fixture HTML uses
# relative hrefs, so only these 6 files carry the host:
#   sh-seed.sh  sh-p2-dryrun.py  fixture/robots.txt  fixture/sitemap.xml
#   fixture/llms.txt  sh-p2-expectations.json
#
# Usage: sh-set-fixture-host.sh <new-host>   (host with or without scheme)
# Then export FIXTURE_URL="https://<new-host>/" for the suites.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW="${1:?usage: sh-set-fixture-host.sh <new-host>}"
NEW="${NEW#https://}"
NEW="${NEW#http://}"
NEW="${NEW%/}"

FILES=(
  "$HERE/sh-seed.sh"
  "$HERE/sh-p2-dryrun.py"
  "$HERE/fixture/robots.txt"
  "$HERE/fixture/sitemap.xml"
  "$HERE/fixture/llms.txt"
  "$HERE/sh-p2-expectations.json"
)
for f in "${FILES[@]}"; do
  sed -i -E 's|[A-Za-z0-9.-]+\.preview\.us1\.vorflux\.com|'"$NEW"'|g' "$f"
done
echo "fixture host rewritten to $NEW in:"
printf '  %s\n' "${FILES[@]}"
