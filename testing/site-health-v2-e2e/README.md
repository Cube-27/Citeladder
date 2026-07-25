# Site Health v2 — E2E harness (P1/P2)

Test-only harness for running a REAL site-health crawl end-to-end locally.
Nothing here ships; it supports the v2 phases (see
`docs/roadmap/site-health-v2-handoff.md`).

## Contents

- `fixture/` — 9-page static site engineered so every classifier page type is
  exercised (`/` homepage, `/blog/post-1/` article, `/pricing/` pricing with a
  deliberately outranked Product schema, `/docs/intro/` docs, `/faq/` faq,
  `/product/widget/` product, `/category/shoes/` category, `/about/`
  about_contact, `/misc/plain/` zero-signal → other) plus P2 additions:
  `robots.txt` (allows the crawler UA, blocks GPTBot, Sitemap directive),
  `llms.txt`, `sitemap.xml` (10 URLs incl. a link-less orphan page), and
  `robots-deny.txt` (Suite C variant B: denies only `SearchifySiteHealthBot`;
  installed over `robots.txt` by the wrapper, never served by default).
- `sh_p2_lib.py` — shared stdlib-only library imported by all three suites
  (in-repo, via `Path(__file__).parent` on `sys.path`): `Api` cookie-jar JSON
  session (`get`/`post`/`put`/`req(raw=)`), `check`/`summary` assertion
  accumulator, `register_or_login` (register 201, login fallback on 400),
  `create_project`/`create_crawl`/`wait_crawl`/`list_all`
  (`items`/`next_cursor` walker), and `FIXTURE_URL` from the environment.
- `sh-set-fixture-host.sh <host>` — rewrites the tunnel host in the 6 files
  that carry it (`sh-seed.sh`, `sh-p2-dryrun.py`, `fixture/robots.txt`,
  `fixture/sitemap.xml`, `fixture/llms.txt`, `sh-p2-expectations.json`).
  Fixture HTML uses relative hrefs, so nothing else needs rewriting.
- `sh-seed.sh` — registers/logs in a test user, creates a project pointing at
  the fixture tunnel. Idempotent.
- `sh-p2-dryrun.py` — dry-run: `extract_page_facts` + `classify` +
  `evaluate_all` over every fixture page through the tunnel; regenerates
  `sh-p2-expectations.json`. **Re-run after any parser/rules change** —
  expectations must be re-baselined (two P2 review fixes changed outcomes).
  `BASE` comes from `SH_BASE`/`FIXTURE_URL`, defaulting to the committed host.
- `sh-p2-e2e-free.py` — Free-sample crawl e2e: seed → crawl → API assertions
  (9/9 analyzed, page types, version stamps, `site_facts` stance, site_root
  weight-0 scoring neutrality, finalize rows, issues, exports, by_page_type).
  Expectations path overridable via `SH_EXPECTATIONS`.
- `sh-p2-e2e-negative.py` + `sh-p2-run-negative.sh` — robots denies the
  crawler UA: crawl fails, no page rows, site_root evaluations never
  fabricated, `site_facts` still persisted. Wrapper swaps in
  `fixture/robots-deny.txt` (`SH_FIXTURE_DIR` overridable) and restores
  robots via trap.
- `sh-p2-e2e-starter.py` + `sh-p2-run-starter.sh` — Starter mode: sitemap
  ingestion → orphan in inventory; monitored set → `sitemap_orphan` FAIL on
  root, `broken_internal_link` FAIL on the orphan page. Wrapper grants Starter
  to the HARNESS USER's workspace (resolved through `workspace_members` for
  `sh-p1-test@searchify.dev`) via `psql "$DATABASE_URL"` (or `docker exec
  "$SH_DB_CONTAINER"` if set) and restores the entitlement via trap.

## How to run

Prereqs: Postgres (`searchify` DB, greenfield-recreated after any model
change), backend on :8000, site-health worker running — see
`docs/DEVELOPMENT.md` and the memory recipes referenced in the handoff doc.

```bash
# 0. Fresh DB + backend + worker as SEPARATE processes (invariant 8)
cd backend && uv run alembic downgrade base && uv run alembic upgrade head
uv run uvicorn app.main:app --port 8000 &          # backend
uv run python -m app.workers.site_health_worker &  # worker

# 1. Serve the fixture and expose it (SSRF: the crawler rejects loopback)
python3 -m http.server 9900 --directory testing/site-health-v2-e2e/fixture &
# expose :9900 (e.g. `vflux port expose --port 9900`), then point the harness
# at the minted host and export it for every following step:
bash testing/site-health-v2-e2e/sh-set-fixture-host.sh <exposed-host>
export FIXTURE_URL="https://<exposed-host>/"

# 2. Dry-run / RE-BASELINE expectations (mandatory before Suite B; re-run
#    after any parser/rules change). If scores move, the "77.3" literal in
#    sh-p2-e2e-free.py (inventory export check) must move with them.
cd backend && uv run python ../testing/site-health-v2-e2e/sh-p2-dryrun.py \
  --json > ../testing/site-health-v2-e2e/sh-p2-expectations.json

# 3. Seed + Free e2e
bash testing/site-health-v2-e2e/sh-seed.sh
cd backend && uv run python ../testing/site-health-v2-e2e/sh-p2-e2e-free.py

# 4. Negative + Starter flows (each wrapper restores state via trap).
#    The worker caches robots.txt per authority IN MEMORY for 24h — restart
#    the worker before Suite C (so it fetches the deny variant) and again
#    before Suite D (so it fetches the restored variant A).
bash testing/site-health-v2-e2e/sh-p2-run-negative.sh   # restart worker first
bash testing/site-health-v2-e2e/sh-p2-run-starter.sh    # restart worker first
```

Environment knobs: `FIXTURE_URL` (required by the suites + `sh_p2_lib`),
`SH_API_BASE` (default `http://localhost:8000/api/v1`), `SH_EXPECTATIONS`,
`SH_BASE` (dryrun), `SH_FIXTURE_DIR` + `SH_FIXTURE_LOCAL` (negative wrapper),
`DATABASE_URL` / `SH_DB_CONTAINER` / `SH_HARNESS_EMAIL` (starter wrapper).

Gotchas: the Free sample allowance (10) is workspace-wide — deactivate stale
`free_sample` monitored rows before re-crawling (`UPDATE monitored_site_urls
SET active=false ... WHERE selection_source='free_sample' AND active=true;`).
The fixture's robots.txt must keep allowing the crawler's own UA
(`SearchifySiteHealthBot`) or every crawl is `robots_denied` by design.
Robots semantics: 5xx → `robots_unavailable` (deny-all); 4xx → allow-all
(fail-open); the per-authority cache lives in the worker process (TTL 24h);
llms.txt and `link_check` probes honor robots.
