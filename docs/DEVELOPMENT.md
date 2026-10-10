# Development guide — CiteLadder

Setup, validation commands and local troubleshooting.
[AGENTS.md](../AGENTS.md) owns workflow and test admission;
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

### Versions

| Tool                               | Version        | Notes                                                                                                                                |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js                            | 26+            | Frontend and TypeScript services. 26 is the supported minimum and CI version; protected production delivery uses Cloudflare Workers. |
| pnpm                               | Repository pin | Use the exact `packageManager` version in [`frontend/package.json`](../frontend/package.json).                                       |
| PostgreSQL                         | 15+            | Via Docker or local                                                                                                                  |
| Docker + Compose                   | latest         | Local stack                                                                                                                          |

## API setup

```bash
cd frontend
pnpm install
export DATABASE_URL="postgresql://postgres:<password>@localhost:5432/citeladder"
pnpm --filter @citeladder/api migrate   # applies the SQL baseline to an empty database
pnpm --filter @citeladder/api start
```

### Dependency license inventory

`docs/operations/dependency-licenses.json` records resolved production packages,
not deployed artifact or legal acceptance. Its `sources` record the package-manager
commands used to refresh it; no repository-specific generator exists. Frontend
license metadata comes from `pnpm licenses list --prod --json` after frozen install.
Local optional packages depend on the installation platform; confirm the actual
Linux image and Worker artifacts separately for release notices.

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
pnpm fonts:pull             # Switzer + Sentient from the private font repo
pnpm dev                    # Local marketing Worker: http://127.0.0.1:3000
pnpm dev:vite               # Vite authenticated SPA: http://127.0.0.1:3001/login
```

`API_SERVICE_ORIGIN` is **server-only**. The browser calls relative `/api/*`.
Vite proxies these paths to the API service. Marketing Worker requests use
its protected upstream configuration.

The workspace pins a pnpm patch for Astro 7.3.5's Windows directory-cleanup
fallback, which uses `fs.rmSync` for Node 26 compatibility. Frozen installs
apply `frontend/patches/astro@7.3.5.patch`; Docker dependency stages copy the
patches alongside the workspace manifest. Remove the patch when upgrading to
an Astro release containing [the upstream fix](https://github.com/withastro/astro/pull/18193).

Fonts come only from the private `Cube-27/cube27-fonts` repo (some faces there
are licensed for self-hosting, not redistribution). `pnpm fonts:pull` uses your
`gh` login to copy the ones in use into the gitignored `public/fonts/`, and
`check:policy` fails if any font file is ever tracked. Without them the UI
renders in metric-matched system fallbacks.

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

Vite proxies `/api/*`, `/mcp`, `/mcp/*`, the OAuth protocol endpoints, and
their well-known metadata paths. Browser `/register` stays in the SPA; dynamic
MCP registration is `/mcp/register`.

## Browser automation for coding agents

CiteLadder's pinned frontend Playwright dependency also provides the
token-efficient Playwright Agent CLI. The repository-local skill is under
`.agents/skills/playwright-cli`; use the root command below so no global npm
install is required:

```powershell
# Start an isolated, headless browser session against a local app.
pnpm run playwright:cli -- open http://127.0.0.1:3000

# Follow the element refs from the CLI snapshot, then end the session.
pnpm run playwright:cli -- snapshot
pnpm run playwright:cli -- close
```

The first CLI use provisions its workspace under `.playwright/` and downloads
its browser only when a suitable installed browser is unavailable. CLI session
artifacts are local-only (`.playwright-cli/`). This agent interface is separate
from, and does not replace, the Playwright Test runner used by `pnpm test:e2e`.

## Running the full stack with Docker Compose

The Compose path is the clean-clone workflow. From the repository root, it builds and starts
PostgreSQL, applies the migration baseline once, then starts the native API, the
`runner` loop and the three Workers under `wrangler dev`. Do not run host-side
migrations or `pnpm dev` alongside this stack.

```bash
cp .env.example .env

# Use the env -u workaround (gotcha 1) and select the copied env file — verbatim:
env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)" \
  docker compose --env-file .env -f docker-compose.yml \
  up -d --build --force-recreate

curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:8100/health
```

Each Worker runs exactly as production serves it, on its own loopback port:
marketing at `http://127.0.0.1:3000`, the app at `http://127.0.0.1:3001` and
the documentation at `http://127.0.0.1:4322`. The app Worker proxies relative
`/api/*` requests to the API container, and the marketing Worker proxies the
apex MCP and protocol paths. Compose sets `FRONTEND_URL` to the app port.
Compose builds bake those origins, so marketing, app and docs links stay
local; other builds link production. Local Compose enables disposable
Worker-to-API HTTP transport with the `LOCAL_WORKER_ORIGIN` binding, and only
for its `api-service:8100` upstream. Production always requires HTTPS and the
origin token. The app Worker serves direct SPA refreshes from its built
`index.html` with `no-store`; missing chunks return 404 instead of application
HTML.

The API is also published at `http://127.0.0.1:8100`. Inspect readiness with the
same `env -u` wrapper (gotcha 1); every Compose invocation resolves `${VAR}`
from the shell first, not just `up`:

```bash
env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)" \
  docker compose --env-file .env -f docker-compose.yml ps
```

The one-shot `migrate` service must have completed successfully. See
`docker-compose.yml` for the executable process list and
[`release-checklist.md`](release-checklist.md) for clean-clone release verification.

## Testing

Select tests for the behavior at risk, following
[AGENTS.md](../AGENTS.md#what-earns-a-test). Replace the quoted placeholder paths
in the examples with real affected files or test identifiers. Full selected
owner suites belong to CI; ordinary documentation edits do not launch them.

### Frontend

The first command runs selected tests. The remaining entries are a command
reference for the relevant debugging or acceptance task; the repository harness
already owns static/contract completion checks. Do not run this entire list per edit.

```bash
cd frontend
pnpm exec vp test run "<test-path>" # targeted Vitest via Vite+; network mocked with MSW
pnpm lint             # Oxlint via Vite+ (`vp lint`; React/TypeScript/a11y rules)
pnpm check            # vp check: format + lint; warnings and unused-disable directives fail
pnpm check:policy     # architecture, design-token, CSS/TSX/SVG, contrast and type-discipline guards
pnpm check:dead-code  # Knip module-graph/dependency gate
pnpm exec tsc --noEmit # type check (Vite+ type-aware lint stays off; see vp-shared-config.ts)
pnpm build            # Astro marketing SSR build
pnpm build:vite       # Vite+ authenticated SPA build
pnpm test:e2e         # Playwright (needs a browser + a running stack)
```

The default Playwright suite uses mocked browser fixtures. Its `app` project
targets Vite on 3100; its `marketing` project targets Astro on 3101. It is not
evidence of live provider acceptance; those checks remain explicit release work.

For browser enforcement of production Worker CSP, build `pnpm build:app` and
`pnpm build:marketing` with explicit public origins and the disposable marketing
analytics ID `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-CONSENTTEST`, then run `pnpm test:workers`
from `frontend/`. This separate suite starts local HTTPS Workerd on ports
8793/8794, checks built HTML and hydration, and proves injected inline scripts
are blocked. It also runs the existing authenticated Performance and analytics
consent checks against the built Workers. It uses disposable upstream settings and mocks analytics requests;
it does not enable or test a live checkout/provider.

### API service (TypeScript)

`frontend/services/api` is a pnpm workspace package; `pnpm install` in `frontend/`
installs it. Its suite writes and deletes fixture rows: point `API_TEST_DATABASE_URL`
at a **disposable** database that `pnpm migrate` has migrated, never the development
database. Tests never read `.env` (`test/environment.ts` sets
`CITELADDER_DISABLE_DOTENV`), and the schema, bootstrap and seed tests create and
drop their own `citeladder_*_test_*` databases on that server.
The API bootstrap refuses inherited provider credentials, including
`DEFAULT_AGENT_API_KEY`, `DEFAULT_AGENT_BASE_URL` and `DEFAULT_AGENT_MODEL`.
Clear these before running tests; dotenv loading is disabled.

```bash
cd frontend/services/api
DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:<port>/<disposable-db>" pnpm migrate
API_TEST_DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:<port>/<disposable-db>" pnpm test
TYPES_DATABASE_URL="<same disposable database>" pnpm db:types   # regenerate Kysely types after a schema change
```

Application policy and the workspace role matrix live in native config. From the
repository root,
`node scripts/quality.mjs --mode check --scope api` needs only Node/pnpm and checks
types, schema authority and route ownership (`pnpm check:routes`: every
native operation declares exactly one manifest family); CI
additionally verifies the generated types and runs the suite against PostgreSQL.
Site Health, analytics, discovery and integration lanes recover their own
expired leases and run their backstops on every runner pass, including a pass
over an empty queue. Tick also runs native queue recovery, so recovery survives
an owner that is not currently draining. `docker compose up api-service` runs
the service on `127.0.0.1:8100`. `pnpm dev` proxies the API and protocol paths
in `TYPESCRIPT_INGRESS_PATHS` to `API_SERVICE_ORIGIN` (default
`http://localhost:8100`), so run the service beside the app when working on
those screens.

A new route family needs an entry in
`frontend/packages/contracts/src/route-ownership.ts`, and its routes carry that
family as their OpenAPI tag.

### Scale-to-zero runtime

From `frontend/`, `pnpm --filter @citeladder/api runner` runs all native worker
lanes and billing recovery until idle or the shared admission budget expires.
`pnpm --filter @citeladder/api tick` runs the periodic owners once, then drains
with the remaining budget. Both commands perform real durable/provider work;
run them only against an authorized target. They use the API image with commands
`node src/runner.ts` and `node src/tick.ts` from its service working directory.
No HTTP server or perpetual polling loop runs in a job. SIGTERM/SIGINT stops
new admission and lets claimed work finish before destroying the pool.

| Environment variable               | Scope                                   | Default / requirement                                                                                                  |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `CLOUD_RUN_RUNNER_JOB`             | API                                     | Unset disables wake-up; otherwise `projects/<project>/locations/us-central1/jobs/<job>`                                |
| `CITELADDER_ORIGIN_TOKEN`          | Cloud Run API                           | Existing secret matching both Workers' `ORIGIN_TOKEN`; at least 32 characters                                          |
| `CITELADDER_ORIGIN_TOKEN_PREVIOUS` | Cloud Run API                           | Optional previous token during rotation                                                                                |
| `RUNNER_BUDGET_SECONDS`            | Runner/tick                             | 300; 1–3600 seconds, shared across phases and lanes                                                                    |
| `RUNNER_DB_POOL_SIZE`              | Runner/tick and API with configured job | 4; 1–4 pooled connections, independent of legacy pool/overflow sizes; a draining execution also holds one lock session |
| `RUNNER_WAKE_TIMEOUT_MS`           | API                                     | 5000; 1–30000 milliseconds for metadata plus job-start requests                                                        |
| `RUNNER_WAKE_MIN_INTERVAL_MS`      | API                                     | 5000; 1–60000 milliseconds between job-start attempts per instance                                                     |

The API's service account needs permission to execute that runner job
(`roles/run.invoker` on the job); no new static Google key is needed. Metadata
credentials and the fixed Google Run API destination are used only for wake-up.
Runner/tick receive the existing configuration and credentials required by all
their native owners. Billing remains disabled/unavailable unless already
configured; the runner does not enable checkout or provision providers.

Terraform (`infra/gcp/run.tf`) sets these on Cloud Run. `K_SERVICE` is
supplied by Cloud Run and makes a missing origin secret a startup error. The
runner and tick are separate jobs over the same image, and Cloud Scheduler
starts the tick job. Each job's timeout allows in-flight work to finish beyond
the admission budget; a forced termination leaves leased work for recovery.
The API skips wake-up while the PostgreSQL drain lock is held and coalesces
launch attempts within the configured per-instance interval. Tick recovers
work arriving as a drain ends. Only one execution drains at a time (a PostgreSQL advisory lock). A later
execution waits up to 15 seconds and then leaves the work to the active drain,
so a burst of writes cannot open one pool per execution. Locally, leave
`CLOUD_RUN_RUNNER_JOB` unset; the Compose `runner` loop replaces wake-up.

### Repository validation harness

[AGENTS.md](../AGENTS.md#validation) owns when each tier runs. This section
covers the commands.

These commands are available tools, not a per-edit checklist. Small styling or
layout edits use the staged format/lint hook and a focused visual inspection
when needed. Run native tests for changed behavior; use the repository harness
only for the higher-risk changes specified in AGENTS.md. Its cumulative branch
scope can include earlier dependency edits, so it must not be used as the
default validator for a small follow-up on that branch.

The pre-commit hook (`vp staged`, configured in the root `vite.config.ts`) runs
`vp check --fix` on staged JS/TS/CSS/JSON files, the design-system policy
(`frontend/scripts/check-design-system.mjs`) when frontend CSS, TS/TSX, Astro or
SVG files are staged.

The design-system policy ratchets its stylesheet, TSX geometry and SVG colour
rules against `frontend/scripts/design-system-baseline.json`: a file's count per
rule may fall but never rise, and a new file starts at zero. When a count falls,
lower the baseline with `node scripts/check-design-system.mjs --write-baseline`
from `frontend/`; never raise it to make a change pass. The generated value
tables in `docs/design.md` are refreshed with
`node scripts/audit-design-tokens.mjs --write` (quality fix mode runs it).

The same run ratchets the type-discipline rules
(`frontend/scripts/type-discipline-checks.mjs`) against
`frontend/scripts/type-discipline-baseline.json`, over browser, package and API
service source. They count the casts and assertions reviews kept finding:
`Object.keys(...)`/`Object.entries(...)` cast to a key type, a non-null
assertion on an indexed element (`list[0]!`, `list.at(-1)!`; a `split` part is
exempt), and a cast inside an `onValueChange` handler outside `components/ui`,
whose generic controls already hand the handler the option type.
`--write-baseline` lowers both baselines. Both `frontend/tsconfig.json` and the
API service's set `noUncheckedIndexedAccess`, so an indexed read is
`T | undefined` until it is checked.

```powershell
.\scripts\check.ps1            # affected owners, affected builds, with fixes
.\scripts\check.ps1 -CheckOnly # the same, non-mutating
.\scripts\check.ps1 -Build     # affected owners, every production build
.\scripts\check.ps1 -All       # every owner and build (release, shared config)
```

`scripts/quality.mjs` owns these checks. The PowerShell entry point holds a
worktree lock and passes `--scope changed`. The affected owners are the ones
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

GitHub CI has one cheap classifier before the implementation jobs. On an
initial pull-request run it classifies the complete PR diff. A later push uses
the previous-head range only when the previous owner results are attributable
and complete; missing, ambiguous, cancelled, or incomplete evidence falls back
to the cumulative PR diff, which includes every failed or unexecuted owner from
the PR. Schema-only and frontend-only pushes do not repeat unrelated
successful suites, and ordinary frontend edits do not automatically launch
browser E2E. Browser-sensitive paths run only the specs mapped in
`scripts/e2e-paths.json`; the complete default Playwright suite is reserved
for `main`, merge-queue validation, unknown shared paths, and changes to
Playwright's global configuration. Shared, configuration, and
contract paths select native API/browser checks; the SQL baseline selects the
native API owner and the Compose smoke. The clean-clone Compose smoke runs
on application/Compose-sensitive PR
changes, merge queue validation, and every push to `main`.

Require every job status from the `CI` and `Compose smoke` workflows. The
classifier jobs must pass; each selected owner must pass; and GitHub reports an
owner skipped by its job-level condition as successful. Requiring the jobs
directly avoids a final runner-only aggregation job after all useful work has
finished. Do not add workflow-level `paths` filters to required workflows; a
skipped workflow can leave its required statuses pending.

Static-analysis commands, pinned by the frozen locks:

```powershell
# From frontend/. These production checks are CI ratchets; the test scan is advisory.
pnpm check:complexity
pnpm check:duplicates
pnpm check:dead-code
pnpm report:duplicates:tests
```

The frontend complexity policy has its own ceilings. The exception lists are empty and should stay that way, and there
is no rebaseline command: CI compares the policy with the PR base and rejects
higher ceilings, higher exceptions, and newly added exceptions. Roots may be
_added_ (widening the gate is a tightening) but never removed.

### Coverage

Coverage is measured and published whenever its owning CI suite is selected and
is **not a gate**, in either the repository-wide or the changed-lines form. A
coverage ratio is a target you can move without improving anything, so enforcing
one reliably produces tests written to move the number rather than to describe
behaviour.

Choose tests from credible behavioral regressions in the changed owner's callers
and contracts. CI runs full selected owner suites; `scripts/e2e-paths.json`
only selects browser specs for browser-sensitive paths. Production scripts and
migrations remain covered by static policy gates.

## Project utility scripts

These commands do not authorize an operation. Obtain explicit task authorization
before resets, grants, billing changes, live-provider calls or external mutations,
and verify the target/environment first. Each command states where it runs.
Use `--help` when arguments are not shown here.

Seed local demo data (**development or disposable database only**):

The host-side seeder requires Node 26 and installed frontend dependencies. It
uses the native identity, project, prompt, provider, audit, integration, Site Health
and Opportunity owners with explicit recorded transports. It requires a local
development database and clears inherited provider credentials. No separately
running worker is needed. Repeated static seeding preserves the same identities
and rows; execution appends fresh evidence. The agency workspace has its own
Owner and grants; the demo identity joins it as Admin.

From `frontend/`:

```bash
pnpm --filter @citeladder/api seed:dev
pnpm --filter @citeladder/api seed:dev --static-only
```

Provision a local development login, or grant a Site Health allowance:

From the repository root in PowerShell:

```powershell
# The PowerShell provision-dev-login wrapper manages production only.
# Local provisioning remains available through the native CLI, with the password on stdin:
pnpm --dir frontend --filter @citeladder/api provision:dev --email <email> --password-stdin --counter-allowance <allowance>
# Native local-only login admission and catalog initialization; an existing login must authenticate.
# Run the following native commands from frontend/:
pnpm --filter @citeladder/api entitlement:site-health --actor <admin-email> --workspace-id <workspace-uuid> --account-id <account-uuid> --reason "local allowance" --idempotency-key <key> --monitored-urls <allowance> --valid-from <ISO-date> # add --apply after preview
```

Billing/operator utilities (from `frontend/`):

```bash
pnpm --filter @citeladder/api billing:admin --help
pnpm --filter @citeladder/api billing:plans --help
```

Bounded identity/acquisition/provider operators are native. From `frontend/`:

```bash
pnpm --filter @citeladder/api provision:platform --actor <admin-email> --credential-ref openai=vault://platform/openai --dry-run
pnpm --filter @citeladder/api acquisition:control --actor <admin-email> --domain <domain-or-*> --reason <reason>
pnpm --filter @citeladder/api agreement:record --actor <admin-email> < local-reference.json
pnpm --filter @citeladder/api account:manage --actor <owner-or-admin-email> --workspace-id <uuid>
```

Acquisition, agreement and platform provisioning commands roll back unless
`--apply` is supplied. Platform provisioning also accepts explicit `--dry-run`
preview; combining it with `--apply` is refused. Platform provisioning
requires an active platform administrator, accepts only opaque references and
makes no provider calls. Agreement reference JSON is read from bounded stdin
(PowerShell: `Get-Content -Raw local-reference.json | pnpm --filter
@citeladder/api agreement:record --actor <admin-email>`). The account manager
requires an interactive terminal for passwords and confirmation for mutations.
The API image also supports these entrypoints via
`node src/cli/<entrypoint>.ts`, including the migrate job's `migrate.ts` and
`bootstrap-account.ts`.

Execution repricing is native: from `frontend/`, run
`pnpm --filter @citeladder/api audit:reprice --help`. Preview is the default;
applying a versioned cost projection requires an explicit operator action.

Billing reconciliation is TypeScript-owned and runs as the runner's billing
lane. From `frontend/`, `pnpm --filter @citeladder/api runner` performs one
bounded sweep with every other lane. It reads provider authority and can settle
commercial evidence; use only an explicitly authorized target.

Platform provider provisioning stores only each non-secret opaque reference.
At execution, that reference must exactly match the corresponding
`PROVIDER_PLATFORM_<TRANSPORT>_CREDENTIAL_REF`; the deployment secret manager
injects the key into `PROVIDER_PLATFORM_<TRANSPORT>_API_KEY`. Never pass a raw
provider key to the provisioning command. Creation and credential rotation
leave probe status unverified; this metadata command does not establish route
readiness. Admission remains closed until a successful provider test is recorded.

`billing:admin` mutations are dry-run by default and require an explicit target,
active admin actor, reason, and idempotency key; repeat the reviewed command with
`--apply` to commit. Use the
[billing operator guide](operations/billing-operator-guide.md) for exact catalog
publication/forward-recovery, campaign controls, grant correction, evidence
inspection, reconciliation, webhook rotation, and incident switches. Local
fixtures are not production-provider evidence, and the default development
posture keeps checkout and the no-card campaign disabled with card trial
unavailable.

From the repository root, reset and recreate the database named by
`DATABASE_URL` (**never against shared, staging, or production data**):

```bash
./scripts/reset-db.ps1
```

The wrapper runs `pnpm --filter @citeladder/api reset:db`: it authorizes the
explicit target once, drops and recreates it and applies the SQL baseline
(`src/cli/reset-schema.ts`), then sequences bounded native login/catalog
provisioning with the same environment. Dotenv-disable admission applies to both
stages. Failures stop the sequence.

The reset runs without an extra token only when `APP_ENV` is a development
value and `DATABASE_URL` targets `localhost`, `127.0.0.1`, or `::1`. A remote
host is refused even under `APP_ENV=development`; the exceptional case requires
the explicit `RESET_CONFIRM_DESTRUCTIVE=drop-and-recreate` token.

## Migrations (single greenfield baseline)

The schema is one SQL file,
[`frontend/services/api/migrations/0001_baseline.sql`](../frontend/services/api/migrations/0001_baseline.sql),
and nothing else authors DDL (invariant 17). `pnpm --filter @citeladder/api migrate`
(`src/cli/migrate.ts`) applies it under an advisory lock in one transaction and
records its SHA-256 in `schema_migrations`. A rerun on a current database is a
no-op. The command fails, and the deploy stops before the API rolls forward, when:

- the recorded checksum differs from the file (the baseline changed);
- the database carries only an Alembic `alembic_version` stamp (created before
  Python was retired);
- the database has tables but no ledger.

Each message says to redeploy with `reset_database`
([GCP runbook](operations/GCP_RUNBOOK.md)). Locally, `./scripts/reset-db.ps1`
replaces a development database the same way. `DATABASE_URL` must be explicit;
`DB_SSL_MODE=require` encrypts the connection. `--wait-seconds N` retries the
first connection, for a database VM that is still starting.

CiteLadder is greenfield and keeps one complete baseline. Fold every schema
change into the SQL file, reset only disposable databases, and verify the
complete schema from scratch. Do not introduce additive migration files while
this policy is in effect. Verify against a disposable database only:

```bash
cd frontend/services/api
DATABASE_URL="postgresql://postgres:<password>@127.0.0.1:<port>/<empty-db>" pnpm migrate
TYPES_DATABASE_URL="<same database>" pnpm db:types        # regenerate Kysely types
TYPES_DATABASE_URL="<same database>" pnpm db:types:check  # CI runs this
```

---

## Site Health runtime (development)

Site Health behavior is a **runtime projection** of the account's resolved
`monitored_urls` entitlement allowance, stored one row per workspace in
`workspace_site_health_runtime`. The row is not a commercial source of truth: it
carries the neutral crawl policy (discovery mode, discovery/sample caps, monitored-URL
limit, count-disclosure flag) plus resolver provenance, and it doubles as the `FOR
UPDATE` quota-serialization lock.

A workspace with no grants resolves to the **zero-allowance sample policy** (fail-closed:
sample discovery, zero selectable monitored URLs, no count disclosure). To grant a
monitored-URL allowance locally, use the native operator command from `frontend/` with
`DATABASE_URL` pointing at the target database:

```bash
cd frontend
pnpm --filter @citeladder/api entitlement:site-health --actor <admin-email> --workspace-id <workspace-uuid> --account-id <account-uuid> --reason "local allowance" --idempotency-key <key> --monitored-urls <allowance> --valid-from <ISO-date> # add --apply after preview
```

The command issues an audited operator `override` grant through the append-only write
service (`services/api/src/entitlements/grants.ts`), re-projects the
workspace runtime row, and emits a single audit-safe log line (no secrets). Allowances
SUM across grants — a second grant adds to the first; revoking earlier grants is a
separate audited operation.

---

## Gotchas runbook

These two environment-specific procedures are owned here. The correctness and
secret-isolation requirements remain in [`invariants.md`](invariants.md).

### Gotcha 1 — shell secrets override Docker Compose `${VAR}`

**Symptom:** `docker compose up` connects Postgres/backend with the wrong
credentials/database even though `.env` looks correct.

**Cause:** this machine exports `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, and
`DATABASE_URL` into **every shell**. Compose resolves `${VAR}` in `docker-compose.yml` from
the **shell environment before `.env`** (`env_file:` only injects vars _inside_ the
container, not into `${VAR}` interpolation). The shell values win and silently override the
repo values.

**Workaround (verbatim):**

```bash
env -u POSTGRES_PASSWORD -u POSTGRES_USER -u POSTGRES_DB -u DATABASE_URL \
  POSTGRES_PASSWORD=<repo-.env-value> \
  docker compose --env-file .env -f docker-compose.yml \
  up -d --build --force-recreate
```

Unset the four inherited vars for the Compose invocation and re-supply the repo `.env` value
explicitly. `docker-compose.yml` carries this note as a baked-in comment.

(This gotcha applies to the recommended Compose stack. Native development and tests use
their own configured PostgreSQL connection.)

### Gotcha 2 — tunnel double CORS header → same-origin proxying

**Symptom:** frontend network calls fail in the browser with a CORS error about **duplicate**
`Access-Control-Allow-Origin` headers — but `curl` against the same backend succeeds.

**Cause:** the preview/tunnel proxy injects its own `Access-Control-Allow-Origin: *`. An
API that also sets a specific ACAO for credentialed requests
produces **two** ACAO headers, which browsers reject. `curl` does not enforce CORS, so it
cannot reproduce the failure.

**Fix:** the browser never talks cross-origin to the backend. The Vite development proxy and the production app Worker route relative
`/api/*` to the native API, so all browser calls are **same-origin**. The API
client uses a relative base (`/api/v1`), `cache: 'no-store'`, and
`credentials: 'include'`.

**Always test this in a real browser, not curl.**

## Web preview (running the stack behind a tunnel)

When previewing the app behind a tunnel/proxy:

1. Point Vite's `API_SERVICE_ORIGIN` at the running native API.
2. Ensure the Vite dev server accepts the proxied host so the preview
   host isn't rejected.
3. Confirm every browser network call hits relative `/api/*` (same-origin) — not a
   cross-origin backend URL. This is what avoids the gotcha-2 double-CORS failure.
