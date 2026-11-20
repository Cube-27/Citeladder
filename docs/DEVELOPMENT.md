# Development guide — CiteLadder

Setup, validation commands and local troubleshooting.
[CLAUDE.md](../CLAUDE.md) owns agent workflow;
[the index](README.md) routes feature owners, and [invariants](invariants.md)
remain binding. The commands below are task-specific references, not a
per-edit checklist. Preserve existing `.env` and `.env.local` files during setup.

## Toolchain

### Public documentation

From `frontend/`, run `pnpm dev:docs` for the static docs site at
`http://127.0.0.1:4322`. It needs no backend or live credentials. Production
output is built with `pnpm build:docs`; `pnpm preview:docs` serves that output.
`pnpm test:docs` rebuilds the site, then runs the isolated browser suite. Its artifacts
land in the ignored `frontend/test-results/docs`.

Articles live under `apps/docs/src/content/`. Each Markdown file supplies
`title`, `description`, `group` and numeric `order`. Those values drive the
route, grouped navigation, previous/next links, search index and sitemap.
Keep changelog entries in `changelog.md`, distinguishing implementation dates
from verified deployment. Validate content through the docs build and browser
suite, including internal links and heading anchors.

The docs asset preparation script copies the canonical logo, favicon and any
locally available licensed fonts. Use the existing `pnpm fonts:pull` workflow
when licensed font access is available; font binaries remain ignored. The
repository check script includes the documentation build.

Versions come from `engines.node` and `packageManager` in
[`frontend/package.json`](../frontend/package.json) and from `docker-compose.yml`.

## API setup

```bash
cd frontend
pnpm install
pnpm --filter @citeladder/api migrate   # applies the pending SQL migrations (URLs from POSTGRES_* in .env)
export DATABASE_URL="postgresql://citeladder_app:<password>@localhost:55432/citeladder"
pnpm --filter @citeladder/api start
```

`docs/operations/dependency-licenses.json` records resolved production packages,
not deployed artifacts or legal acceptance; its `sources` record how to refresh it.

The API process enqueues work and never performs provider calls or long-running
crawl/sync/generation work inline. Every background owner (analytics, discovery,
integrations, Agent, audits, Site Health and billing recovery) runs through one
bounded entry point, from `frontend/services/api/`:

```bash
pnpm tick     # periodic owners once (recovery, schedules, dispatch), then drain
pnpm runner   # drain every lane until idle or the admission budget expires
```

Run `pnpm tick` again (or in a loop) to keep processing; the Compose `runner`
service repeats it every 10 seconds. Each owner uses the shared durable
PostgreSQL queue/lease contract and receives only the configuration its owner
requires.

## Frontend setup

```bash
cd frontend
echo "API_SERVICE_ORIGIN=http://localhost:8100" > .env.local
pnpm install
pnpm fonts:pull             # the brand faces from the private font repo
pnpm dev                    # Local marketing Worker: http://127.0.0.1:3000
pnpm dev:vite               # Vite authenticated SPA: http://127.0.0.1:3001/login
```

`API_SERVICE_ORIGIN` is **server-only**. The browser calls relative `/api/*`.
The Vite dev server (`pnpm dev:vite`) proxies these paths to the API service;
`pnpm dev` runs the marketing Worker, which uses its protected upstream configuration.

Fonts come only from the private `Cube-27/cube27-fonts` repo (some faces there
are licensed for self-hosting, not redistribution). `pnpm fonts:pull` uses your
`gh` login to copy the ones in use into the gitignored `public/fonts/`, and
`check:policy` fails if any font file is ever tracked. Without them the UI
renders in metric-matched system fallbacks.

To change a face, edit its `family` and `file` in
`frontend/lib/config/brand-fonts.json` and run `pnpm fonts:pull` (with
`--latest` after uploading a new file to the font repo, to re-pin its
revision). The pull recomputes the face's weight range and fallback metrics in
that JSON; commit it. Nothing else names a face.

Astro owns marketing and public routes; Vite owns authenticated product routes.
They share dependencies, API client, styles and public assets. Vite reads the
server-only `API_SERVICE_ORIGIN`; the marketing Worker uses `ORIGIN_UPSTREAM`:

```bash
pnpm build                  # Astro marketing SSR build
pnpm build:marketing        # Astro Worker build and static-output check
pnpm types:marketing-worker # Regenerate checked-in marketing bindings
pnpm dev:marketing-worker   # Rebuild and run local Workerd with a disposable upstream
pnpm build:vite             # Vite authenticated SPA build
pnpm preview:vite           # production bundle preview on port 3001
```

Vite proxies `/api/*` and MCP consent (`/mcp/oauth/consent`). MCP and its
OAuth endpoints are served on the API host, which locally is the API itself
(`PUBLIC_API_URL=http://127.0.0.1:8100`), so a local MCP client connects to
`http://127.0.0.1:8100/mcp`.

## Running the full stack with Docker Compose

The Compose path is the clean-clone workflow. From the repository root, it builds and starts
PostgreSQL, applies the pending migrations, then starts the native API, the
`runner` loop and the three Workers under `wrangler dev`. Do not run host-side
migrations or `pnpm dev` alongside this stack.

```bash
cp .env.example .env
docker compose --env-file .env -f docker-compose.yml --profile app \
  up -d --build --force-recreate

curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:8100/health
```

Each Worker runs exactly as production serves it, on its own loopback port:
marketing at `http://127.0.0.1:3000`, the app at `http://127.0.0.1:3001` and
the documentation at `http://127.0.0.1:4322`. The app Worker proxies relative
`/api/*` requests and MCP consent to the API container; MCP itself is served
by the API container directly on its port. Compose sets `FRONTEND_URL` to the
app port.
Compose builds bake those origins, so marketing, app and docs links stay
local; other builds link production. Local Compose enables disposable
Worker-to-API HTTP transport with the `LOCAL_WORKER_ORIGIN` binding, and only
for its `api-service:8100` upstream. Production always requires HTTPS and the
origin token. The app Worker serves direct SPA refreshes from its built
`index.html` with `no-cache`; missing chunks return 404 instead of application
HTML.

The API is also published at `http://127.0.0.1:8100`. The one-shot `migrate` service must have completed successfully. See
`docker-compose.yml` for the executable process list and
[`release-checklist.md`](release-checklist.md) for clean-clone release verification.

## Testing

Select tests for the behavior at risk, following
[CLAUDE.md testing](../CLAUDE.md#testing). Replace the quoted placeholder paths
in the examples with real affected files or test identifiers. Full selected
owner suites belong to CI; ordinary documentation edits do not launch them.

### Frontend

From `frontend/`, `pnpm exec vp test run "<test-path>"` runs targeted Vitest
(network mocked with MSW); the other scripts (`check`, `check:policy`,
`check:compat`, `check:dead-code`, `build*`, `test:e2e`) are in `package.json`.

The default Playwright suite uses mocked browser fixtures and runs its tests in
parallel. Its `app` project targets the built SPA (`vp preview`) on 3100; its
`marketing` project targets the built Astro Worker on 3101. It is not
evidence of live provider acceptance; those checks remain explicit release work.
A failed test is retried once so the report says whether it is flaky, and in CI
a flaky test fails the run (`failOnFlakyTests`); the trace kept is the first,
failing attempt's. Fix the test; never raise the retries.

For browser enforcement of production Worker CSP, build `pnpm build:app` and
`pnpm build:marketing` with explicit public origins and the disposable marketing
analytics ID `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-CONSENTTEST`, then run `pnpm test:workers`
from `frontend/`. This separate suite starts local Workerd on ports
8793/8794 (each Worker sees `https://` request URLs), checks built HTML and hydration, and proves injected inline scripts
are blocked. It also runs the existing authenticated Performance and analytics
consent checks against the built Workers. It uses disposable upstream settings and mocks analytics requests;
it does not enable or test a live checkout/provider. CI runs it as the
`Worker CSP and consent (playwright)` job, built with the accepted public origins.

### API service (TypeScript)

`frontend/services/api` is a pnpm workspace package; `pnpm install` in `frontend/`
installs it. Its suite writes and deletes fixture rows. Pre-launch there are no
customers, so it runs against the one local development database (`citeladder`
in docker compose; plain `docker compose up -d` starts only it); do not create
per-branch copies. Run it with `pnpm test:api` from `frontend/`, which drops
the provider credentials and secrets the test guard (`test/inherited-credentials.ts`)
refuses and logs to `<git-dir>/api-test.log`. After a new migration, bring that
database forward with `pnpm --filter @citeladder/api migrate`. Tests never read `.env`
(`test/environment.ts` sets `CITELADDER_DISABLE_DOTENV`), and the schema,
bootstrap and seed tests create and drop their own `citeladder_*_test_*`
databases on that server. Before each file, `test/queue-isolation.ts` settles
the active crawls and tasks of fixture workspaces only (named `Workspace <id>`),
so a test run never ends work the local app has in progress.

```bash
# from frontend/
pnpm test:api test/billing.test.ts test/catalog-authoring.test.ts   # named files
pnpm test:api --types   # regenerate src/generated/db-schema.ts after a schema change
pnpm gen                # regenerate the public API and MCP references
```

Application policy and the workspace role matrix live in native config. From the
repository root,
`node scripts/quality.mjs --mode check --scope api` needs only Node/pnpm and checks
types, schema authority, route ownership (`pnpm --filter @citeladder/api check:routes`: every
native operation declares exactly one manifest family, and one route module in
`ROUTE_MODULES` serves each family), the table-writer allowlist, and the API
complexity and duplication ratchets; CI
additionally verifies the generated types and runs the suite against PostgreSQL.

`frontend/services/api/table-writers.json` records each table's writer modules
(`src/`, `scripts/`) and the modules that write a table named by a variable.
A write from an unlisted module fails, as does a listed writer that no longer
writes. Against the PR base a table may not gain writers, and a new table
enters with one writer.
`docker compose up api-service` runs the service on `127.0.0.1:8100`. The Vite
dev server (`pnpm dev:vite`) proxies the API and consent paths in
`TYPESCRIPT_INGRESS_PATHS` to `API_SERVICE_ORIGIN` (default
`http://localhost:8100`), so run the service beside the app when working on
those screens. Lease recovery is in [backend architecture](backend-architecture.md#task-queue-contract).

A new route family needs an entry in
`frontend/packages/contracts/src/route-ownership.ts`, and its routes carry that
family as their OpenAPI tag.

### Scale-to-zero runtime

From `frontend/`, `pnpm --filter @citeladder/api runner` runs all native worker
lanes and billing recovery until idle or the shared admission budget expires.
`pnpm --filter @citeladder/api tick` runs the periodic owners once, then drains
with the remaining budget. Both commands perform real durable/provider work;
run them only against an authorized target. The Cloud Run runner job uses the
API image with `node src/runner.ts`; `tick.ts` is the local and Compose loop,
since on Cloud Run the API serves the tick (below). No HTTP server or perpetual
polling loop runs in a job. SIGTERM/SIGINT stops
new admission and lets claimed work finish before destroying the pool.

The runner's environment (`CLOUD_RUN_RUNNER_JOB`, `RUNNER_*`,
`SCHEDULER_TICK_*`, `CITELADDER_ORIGIN_TOKEN[_PREVIOUS]`) has its defaults in
`services/api/src/config/execution.ts` and its Cloud Run values in
`infra/gcp/run.tf`; the wake-up, tick and drain-lock behaviour is in
[backend architecture](backend-architecture.md#task-queue-contract).
`RUNNER_HANDOVER` is never set by hand. A forced job termination leaves leased
work for recovery. Locally, leave `CLOUD_RUN_RUNNER_JOB` unset; the Compose
`runner` loop replaces wake-up.

### Repository validation harness

The [`validate-change` skill](../.claude/skills/validate-change/SKILL.md) owns
when each tier runs. This section covers the commands.

The pre-commit hook (`vp staged`, configured in the root `vite.config.ts`) runs
`vp check --fix` on staged JS/TS/CSS/JSON files, the design-system policy
(`frontend/scripts/check-design-system.mjs`) when frontend CSS, TS/TSX or Astro
files are staged, and the source token-size limit below.

#### Source file size

An authored source file (`.ts .tsx .js .jsx .mjs .cjs .css`) stays within
6,000 tokens, counted as bytes / 4. This is the only size rule for production
source; there is no line limit. `frontend/scripts/check-token-size.mjs` judges
the staged blobs at pre-commit, and CI's classifier job reruns it on the PR's
changed files, so `--no-verify` does not bypass it.
`frontend/scripts/token-size-policy.json` holds the limit, the ignore list
(tests, codegen, migrations, marketing content, config owners, design tokens
and the MCP tool registries, each with its reason) and the baseline of files
already over the limit on 13 November 2026, with each file's recorded size. A
baseline file may not grow past its recorded size; the baseline may only
shrink, and an entry is deleted once a split brings its file under the limit.

To bring a file under the limit, split it along its seams (functions and types
that change together, a class and its collaborators, a route group, a
component's subcomponents and hooks) into sibling modules in the same owner
folder ([frontend](frontend-architecture.md), [backend](backend-architecture.md)).
Update every importer; add no barrel files, re-export shims or aliases. Move the
code unchanged, with no renames of exported symbols or behaviour changes, in its
own commit when possible. Never shrink a file by deleting comments or
compressing code, and never extend the ignore list or baseline to pass.

`pnpm check:policy` runs the design-system policy (no literal colours outside
the token stylesheet, WCAG AA contrast of token pairs, Radix only inside
`components/ui`, the app's Tailwind `@source` list) and the architecture guard,
which also fails on any type-discipline finding
(`frontend/scripts/type-discipline-checks.mjs`) and on any tracked font file.

```bash
# from frontend/; later arguments override the defaults
pnpm gate                              # affected owners, affected builds, with fixes
pnpm gate --mode check                 # the same, non-mutating
pnpm gate --builds all                 # affected owners, every production build
pnpm gate --scope all --builds all     # every owner and build (release, shared config)
```

`scripts/quality.mjs` owns these checks. `pnpm gate` passes `--scope changed`,
which takes a per-worktree lock and first runs `scripts/secrets-scan.mjs`: CI's
gitleaks version (read from `ci.yml`) and allowlist over the changed files, in
Docker (skipped with a warning without Docker). The heavy steps then wait for
one of `CITELADDER_HEAVY_CHECKS` (default 2) machine-wide slots
(`scripts/check-slots.mjs`), so parallel agent sessions queue instead of
starving each other. The affected owners are the ones
the CI classifier (`scripts/ci-changes.mjs`) selects for the branch diff against
`origin/main`, plus staged, unstaged and untracked files. With `--builds affected`,
the Astro marketing, Astro docs and Vite app builds run only when their sources
or shared build configuration changed; tsc and `vp check` still cover ordinary
TypeScript. A passing run records the tree it judged in `.git/quality-pass.json`,
and a rerun on the identical tree exits immediately; delete that file to force a
rerun. Full logs go to `.git/quality-logs/`; output shows step names, the result
and at most 60 lines per failure. The cross-platform `pnpm quality:fix` and
`pnpm quality:check` default to every owner and every build; CI passes an
explicit `--scope`.

Run focused behavior tests directly with the native runner:
`pnpm exec vp test run <test-paths>` from `frontend/`, `pnpm exec vitest run
<test-paths>` from `frontend/services/api/`, or
`node --test <test-paths>` from the root. Browser checks use
`pnpm exec playwright test --config playwright.config.ts <spec-paths>`.
Choose tests from the behavior at risk; there is no local test mapping or retry
state.

GitHub CI has one cheap classifier before the implementation jobs
(`scripts/ci-changes.mjs`, with browser specs mapped in `scripts/e2e-paths.json`;
a new spec needs a path rule or the classifier fails and skips all CI). A later
push classifies only the previous-head range when the previous owner results
are attributable and complete; otherwise it falls back to the cumulative PR
diff. A push to `main` skips full validation only when it is owner-free
(documentation or inert deploy configuration) and the same workflow passed on
the previous `main` commit. Deploys require both workflows' push runs for the
exact deployed commit to have passed.

The `CI` workflow's required status is its `CI result` job. GitHub reports an
owner skipped by its job-level condition as successful, so requiring owner jobs
by name would also pass a run whose classifier failed; `CI result` passes only
when the classifier passed and every selected owner passed. The `Compose smoke`
workflow's `Compose smoke result` job aggregates its classifier and smoke the
same way; require it alongside. Do not add
workflow-level `paths` filters to required workflows; a skipped workflow can
leave its required statuses pending.

The complexity (cyclomatic 12, test files 800 lines) and duplication policies
are CI ratchets (`pnpm check:complexity[:api]`, `pnpm check:duplicates[:api]`;
policy files `complexity-policy.json` and `jscpd-baseline.json`, in the frontend
and in `frontend/services/api/`). CI compares each policy with the PR base and
rejects higher ceilings and new exceptions; there is no rebaseline command.

Coverage is published as CI artifacts and is **not a gate**: a coverage ratio is
a target you can move without improving anything, so enforcing one produces
tests written to move the number rather than to describe behaviour.

## Project utility scripts

These commands do not authorize an operation. Obtain explicit task authorization
before resets, grants, billing changes, live-provider calls or external mutations,
and verify the target/environment first. Each command states where it runs.
Use `--help` when arguments are not shown here.

Local seed, reset and dev-login tools are not part of the repository. Each
developer keeps them, if at all, in the git-ignored
`frontend/services/api/local/` folder and runs them with `node` from there;
nothing in CI, Compose or the tests depends on them. Tests build their data
from the test fixtures (`frontend/services/api/test/fixture-workspace.ts`).

Operator commands are `pnpm --filter @citeladder/api <script>` from `frontend/`
(`entitlement:site-health`, `billing:admin`, `billing:plans`,
`provision:platform`, `acquisition:control`, `agreement:record`,
`account:manage`, `audit:reprice`); `--help` is the source for arguments. Every
mutation previews by default and commits only with `--apply`, with an explicit
target, active admin actor, reason and idempotency key. Running the `runner`
also performs billing reconciliation, which reads provider authority; use only
an authorized target.

Platform provider provisioning stores only each non-secret opaque reference.
At execution, that reference must exactly match the corresponding
`PROVIDER_PLATFORM_<TRANSPORT>_CREDENTIAL_REF` (for DataForSEO,
`DATAFORSEO_PLATFORM_CREDENTIAL_REF`), and the key comes from
`PROVIDER_PLATFORM_<TRANSPORT>_API_KEY` (DataForSEO: the `DATAFORSEO_API_*`
pair). In production the deploy workflow sets the references from `gcp-demo`
environment variables and copies the OpenAI, Google and Anthropic keys from
environment secrets into optional Secret Manager secrets
([GCP runbook](operations/GCP_RUNBOOK.md#13-github-gcp-demo-environment-variables)).
Never pass a raw provider key to the provisioning command. Creation and credential rotation
leave probe status unverified; this metadata command does not establish route
readiness. Admission remains closed until a successful provider test is recorded.

The [billing operator guide](operations/billing-operator-guide.md) owns
`billing:admin` procedures. Local fixtures are not production-provider evidence,
and the default development posture keeps checkout and the no-card campaign
disabled.

## Migrations (forward only)

Invariant 17 owns the rule (baseline plus numbered forward files, nothing else
authors DDL). `pnpm --filter @citeladder/api migrate` applies the pending files
and fails, and the deploy stops before the API rolls forward, when:

- an applied file's recorded checksum differs from the file (it was edited);
- the database recorded a version this release lacks, or skipped one;
- the database has tables but no ledger;
- a statement waits on a lock longer than `MIGRATION_LOCK_TIMEOUT_MS`
  (default 3 s) or runs longer than `MIGRATION_STATEMENT_TIMEOUT_MS` (default
  5 min). A DDL statement queued behind a serving transaction would otherwise
  queue every later query on that table behind itself. The whole apply rolls
  back, so a rerun is safe. A migration that legitimately needs longer raises
  its own bound on its first line (`SET LOCAL statement_timeout = '12min';`,
  likewise `lock_timeout`); the next file runs under the configured bounds
  again. The migrate job's 15-minute timeout (`infra/gcp/run.tf`) still caps
  the whole apply.

**Expand and contract.** A deploy migrates while the previous API revision and
any running runner execution still serve, and a rollback runs older code on the
newer schema. So a migration must work with the code already deployed:

- **Expand** (new tables, nullable columns or columns with a default, new
  indexes, relaxed constraints) ships with the code that uses it.
- **Contract** (`DROP COLUMN`, `DROP TABLE`, a rename, `SET NOT NULL`, a
  tightened constraint) ships one release after the code stops using the name:
  release N stops reading and writing it, and is deployed; release N+1 drops
  it. A rename is an expand (new name), a release that moves the code, then a
  contract (old name).

**Two database roles.** The migrate CLI connects as the schema owner
(`MIGRATION_DATABASE_URL`). Every service, operator job and the API test suite
connects as the least-privilege `citeladder_app` role (`DATABASE_URL`), created
by the baseline migration: it reads and writes rows, holds no DDL, cannot read
`schema_migrations`, and cannot UPDATE or DELETE the append-only evidence,
attempt and ledger tables (invariants 4 and 16). After migrating, the CLI sets
that role's password from `DATABASE_URL`, which must name `citeladder_app`.
New tables get the role's row grants by default privileges; a migration that
adds an append-only table also revokes UPDATE and DELETE on it from
`citeladder_app`, and `test/app-database-role.test.ts` lists those tables.
PostgreSQL grants `SELECT … FOR UPDATE` only with UPDATE privilege, so an
append-only table that the code row-locks (today the grants, ledger, payment
receipts and raw answer artifacts) keeps that privilege, loses DELETE, and
carries the `refuse_app_role_update` statement trigger, which refuses the
role's UPDATE with the same permission error.
Foreign-key cascades still remove such rows when their workspace is deleted.
Locally, `pnpm migrate` derives both URLs from `POSTGRES_*` (both roles share
`POSTGRES_PASSWORD`); explicit values win. API tests that arrange or remove
append-only rows, or run DDL, do it through `asOwner`/`ownerDatabaseUrl` in
`test/support.ts` (`API_TEST_OWNER_DATABASE_URL`).

`DB_SSL_MODE=require` encrypts the connection. `--wait-seconds N` retries the
first connection, for a database VM that is still starting. Bring the local
development database forward with the same command; verify the complete schema
from an empty disposable database:

```bash
cd frontend/services/api
MIGRATION_DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:<port>/<empty-db>" \
  DATABASE_URL="postgresql://citeladder_app:<password>@127.0.0.1:<port>/<empty-db>" pnpm migrate
TYPES_DATABASE_URL="<same database>" pnpm db:types        # regenerate Kysely types
TYPES_DATABASE_URL="<same database>" pnpm db:types:check  # CI runs this
```

---

## Site Health runtime (development)

A workspace's Site Health behavior is a runtime projection of its account's
resolved `monitored_urls` allowance (`workspace_site_health_runtime`, one row per
workspace; not a commercial source of truth, and the `FOR UPDATE` quota lock).
A workspace with no grants resolves to the zero-allowance sample policy (fail
closed: sample discovery, zero selectable monitored URLs). To grant an allowance
locally, run `entitlement:site-health` (an audited operator `override` grant;
allowances sum across grants, and revoking one is a separate audited operation).

---

## Gotchas runbook

These two environment-specific procedures are owned here. The correctness and
secret-isolation requirements remain in [`invariants.md`](invariants.md).

### Gotcha 1 — shell secrets override Docker Compose `${VAR}`

**Symptom:** `docker compose up` connects Postgres/backend with the wrong
credentials/database even though `.env` looks correct.

**Cause:** Compose resolves `${VAR}` in `docker-compose.yml` from the **shell
environment before `.env`** (`env_file:` only injects vars inside the container).
A shell that exports `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB` or
`DATABASE_URL` silently overrides the repo values.

**Fix:** unset the conflicting variable for the Compose invocation
(`env -u <VAR> docker compose …`). Native development and tests use their own
configured PostgreSQL connection.

### Gotcha 2 — tunnel double CORS header → same-origin proxying

**Symptom:** frontend network calls fail in the browser with a CORS error about **duplicate**
`Access-Control-Allow-Origin` headers — but `curl` against the same backend succeeds.

**Cause:** the preview/tunnel proxy injects its own `Access-Control-Allow-Origin: *`. An
API that also sets a specific ACAO for credentialed requests
produces **two** ACAO headers, which browsers reject. `curl` does not enforce CORS, so it
cannot reproduce the failure.

**Fix:** the browser never talks cross-origin to the backend. The Vite development proxy and the production app Worker route relative
`/api/*` to the native API, so all browser calls are **same-origin**. The API
client uses a relative base (`/api/v1`), `cache: 'no-cache'`, and
`credentials: 'include'`.

**Always test this in a real browser, not curl.** Behind a tunnel, point Vite's
`API_SERVICE_ORIGIN` at the native API and let the dev server accept the proxied host.
