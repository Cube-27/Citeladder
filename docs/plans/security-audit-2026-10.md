# Security audit, 2026-10

This records what a source-only security audit of CiteLadder found and how the
fixes ship. The audit ran the Cloudflare `security-audit` skill in its deep
profile on 2026-10-11 and 2026-10-12. Hunters covered the client, infrastructure,
billing, DoS, LLM/Agent, SSRF, API/MCP, tenancy and auth. A second wave covered
logos, bootstrap/CLI, analysis pipelines, workers, lifecycle, crawl logs and
provider cost. Final-clean critics then looked for uncovered units until none
remained. An independent verifier checked every candidate. No code ran against
live systems.

The same pass validated an earlier external report written at revision
`137485b` (2026-10-07).

## External report validation

| # | Report claim | Verdict | Outcome |
|---|---|---|---|
| 1 | Brand discovery has no per-workspace admission | Confirmed, low | Fixed in PR 1 |
| 2 | Authenticated SSE streams can exhaust instance capacity | Partly confirmed, low | Audit stream deadline in PR 1; per-user stream cap in PR 2 |
| 3 | An Admin can seize ownership | **Disproved** | `transfer_ownership` is Owner-only, rechecked under the workspace lock; owner targets are refused |
| 4 | A cancelled host-pacer waiter strands the queue | Confirmed, low | Fixed in PR 1 |
| 5 | Crawl include/exclude globs allow ReDoS | Confirmed, medium | Fixed in PR 1 |

## PR 1: fixes that need no owner decision

| Finding | Severity | Fix |
|---|---|---|
| Crawl glob ReDoS (`site-health/url-admission.ts`) | Medium | Linear-time wildcard matcher, compiled once per scope |
| Entity alias regex ReDoS (`analysis/entity-assessment.ts`) and the spelling-pattern variant | Medium | Separator disjoint from the token alphabet; alias lists bounded |
| Password recovery left MCP grants and API keys alive | Medium | Reset, change and operator reset revoke the person's MCP grants and the keys they created (`credential_reset`) |
| API keys kept working while their creator was disabled | Medium | `apiKeyAuth` refuses a key whose creator is inactive or unverified |
| Pending invitations outlived their issuer's authority | Medium | Removal, departure or demotion revokes the invitations that member issued; a resend re-owns the link |
| Members could bind any property on the Admin's provider grant | Medium | Saving or disabling an integration mapping needs `manage_credentials` |
| The workspace CLI could reset an Owner's or platform admin's password | Hardening | Refused for the Owner, the operator and platform roles; records `auth.password_reset` |
| Brand discovery, competitor discovery, internal-link analysis and the prompt quality judge had no daily window | Low | Per-workspace active cap and daily windows in `config/abuse.ts` |
| Host pacer abort | Low | Abortable wait that forwards a wake it cannot use |
| Audit SSE never ended | Low | `AUDIT_SSE_MAX_DURATION_SECONDS` deadline (300 s) |
| Brand discoveries survived project deletion | Low | `ON DELETE CASCADE` in the baseline |
| A crawl-log idempotency replay re-read and decoded the body | Low | The stored receipt answers before the body is read |
| The brand-logo cache was keyed by registrable domain (`*.github.io` shared) | Low | Keyed by private-suffix host; fetches only that host's homepage |
| An aborted logo fetch was cached as a shared 24-hour failure | Informational | Aborted fetches are not recorded |
| The raw origin key was sent on every Worker request | Owner-approved hardening | The Workers sign each request with an HMAC instead (see below) |
| Trials could be farmed with address aliases | Owner decision B49 | One trial per mailbox |

### Origin signing

The owner asked for the option that adds no cost. The Workers keep the existing
`ORIGIN_TOKEN` secret but never send it. Each upstream request now carries an
HMAC-SHA256 over its timestamp, method, public host, path with query and visitor
address. The API accepts a signature within ±60 seconds under the current or
previous key. A captured header therefore cannot be replayed to another route,
host or client address, or after it expires. Restricting Cloud Run ingress would
need a load balancer, which costs money, so the audit did not choose it.

**The API and all three Workers must be deployed back-to-back.** The old and new
schemes do not interoperate, and there is no compatibility shim.

### Operational notes for PR 1

- `0001_baseline.sql` changed (the brand-discovery cascade). Only the owner can
  reset the local database, so the cascade assertion in
  `test/discovery.test.ts` fails locally until that reset. It passes in CI.
- New admission limits (`config/abuse.ts`, overridable as `ABUSE_<KEY>`):
  3 active and 20 daily brand discoveries, 50 competitor discovery targets,
  10 internal-link analyses and 500 judge calls per workspace per day.

## PR 2: items for the owner

PR 1 shipped as #384. The [decisions record](security-audit-2026-10-decisions.md)
lists every item that needs the owner, each with a recommendation. These include the refund and dispute details (B50, B51),
Cloud Run ingress and deploy-identity scope, a per-user SSE cap, sign-out and
member-removal side effects, and the remaining hardening. Items move to the
[backlog](backlog.md) once the owner decides them. PR 2 changes no runtime
behaviour.
