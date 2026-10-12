# Billing decision log

The single record of every billing, entitlement and usage decision, for later
audit. Each entry names who decided (**Owner** or **Engineering**), the date, the
decision and the reason. A later entry that changes an earlier one says so and
names the entry it supersedes; earlier entries are not rewritten.

**Money rules need an Owner entry before code (Owner, 2026-10-11).** Any rule
that decides what a customer is charged, refunded or held — what counts as
billable, how an unknown outcome is priced, rounding, markup, tax, proration,
refunds — is asked and recorded here as an **Owner** entry before it is
implemented. Engineering may propose one but not decide it. B47 is the example
that came too late: a failed request was coded as charged before the owner
ruled it never is. Reviewers treat a money rule with no Owner entry as blocking.

Implementation work is tracked in the [billing improvement plan](plans/billing-improvement.md);
this log is the authority for what was decided.

## Objective

**B0 — Owner, 2026-10-11.** Billing must be fully operational but hidden, so that
enabling it later is one small configuration PR. The priority is **coverage, not
pricing**: every feature is gated by a plan capability and every call that costs
the platform money is accounted for, or explicitly exempt. Prices, allowances
and rates are configuration and can change at any time.

## Delivery

**B1 — Owner, 2026-10-11.** Three PRs, built one at a time: each merges and
`main` is synced before the next branches. Discussion finishes before coding
starts.

## Hidden operation

**B2 — Owner, 2026-10-11.** Billing runs hidden in production through a
per-workspace allow-list: a non-public `billing_checkout` grant issued with
`billing:admin grant`. Razorpay test keys are accepted in production only for
allow-listed workspaces. The public catalog reads checkout unavailable until
enablement. Rejected: live keys only; a separate staging stack (extra hosting
cost).

## Plans and gates

**B3 — Owner, 2026-10-11.** Plans stay as configured: Starter, Growth and Scale,
plus the separate Enterprise contact plan. Prices and limits are unchanged except
where an entry below says otherwise.

**B4 — Owner, 2026-10-11.** BYOK and managed are one plan internally; BYOK is only
a lower price. Each plan has one bundle, and feature gates, prompt runs and AI
credits are identical whichever key pays.

**B5 — Owner, 2026-10-11.** Audit cadence is not gated. `audit_cadence`,
`exports`, `fanout`, `support_tier`, `serp_tasks_per_period` and `provider.*` are
removed from the entitlement registry; exports and fan-out are available to
every plan. `history_window` stays as it is (it bounds integration sync).
Supersedes an earlier same-day choice to enforce cadence.

**B6 — Engineering, 2026-10-11.** Every paid plan bundle grants
`workspace_access`, `team_members` and `project_deletion`. Without
`workspace_access`, a public customer who buys a plan is locked out, because the
paid bundle displaces the trial bundle; without the other two, invitations and
project deletion are refused on every plan.

**B7 — Engineering, 2026-10-11.** New capabilities `commerce` and
`search_intelligence`, granted by every paid plan and absent from the trial.
These features had no plan gate.

## Prompt runs

**B8 — Owner, 2026-10-11.** The measurement unit is the **prompt run**: each
engine or search-surface answer is one run. Every plan, BYOK and managed, has a
monthly allowance, spent whenever the customer chooses (all at once or spread
out). Manual, scheduled, MCP and public-API audits all count. This replaces the
managed-only `audit_credits` and the trial's separate `successful_answers`.

**B9 — Engineering, 2026-10-11.** Answer analysis (perception, the Commerce shelf
and fact verification) is included in the prompt run, not charged separately,
following B8 ("charged irrespective of model calls").

**B10 — Engineering, 2026-10-11.** Starting allowances, from the existing managed
answer allowances: trial 20 runs in total (its current value), Starter 1,000,
Growth 3,000 and Scale 6,000 per month. Configuration; change freely.

## AI credits

**B11 — Owner, 2026-10-11.** Platform AI calls outside onboarding spend AI
credits at **cost plus 30%**. Onboarding calls (project research, brand
discovery, the first prompt draft) consume no credits and no limits.

**B12 — Owner, 2026-10-11.** Credits are charged on **tokens**, at the price of
the model that served the call, never per call and never one shared rate across
models. The default Agent gateway model is priced at Claude Haiku 5.5 rates
($0.10 input, $0.01 cached input, $0.50 output per million tokens) until its own
price is configured.

**B13 — Owner, 2026-10-11.** The JEV judge model, Tavily and Keenable are **not
charged for now**. Their calls are still recorded so the cost is visible.

**B14 — Engineering, 2026-10-11.** One credit is $0.001 of usage after the 30%
markup, so the ledger stays in whole credits. A call costs
`ceil(tokens × model price × 1.3 ÷ $0.001)` credits: rounding adds at most
$0.001. At Haiku 5.5 prices, 10k input and 2k output tokens cost $0.002 and are
charged 3 credits. A model with no configured price is refused, not charged at
another model's rate. Reason: the owner asked for accounting that is simple to
code and read; the previous $0.025 credit would need fractions.

**B15 — Engineering, 2026-10-11.** Credits are reserved before the call (the
call's maximum tokens at its price) and settled once to actual usage; unreadable
usage settles at a fixed fallback no larger than the reservation. A failed call
that reports no usage is not charged.

**B16 — Owner and Engineering, 2026-10-11.** Allowances, rescaled to the $0.001
credit so their money value is unchanged: AI top-up 25,000 credits for $25
(available on every paid plan, not the trial); Growth 12,500 and Scale 37,500
per month. The owner set the free trial at 200 old credits ($5): 5,000 credits
in total, no top-ups. Engineering gave Starter the same 5,000 per month, because
prompt generation is the core feature and must not require Growth.
Configuration; change freely.

**B23 — Owner, 2026-10-11.** Internally, usage is calculated from **tokens** at the
serving model's price (B12, B14). Customers see only **AI credits**: balances,
allowances, top-ups and per-action spend in credits. The conversion (token
prices, the 30% markup and the credit's money value) is internal configuration
and is never shown in the app, API, MCP, receipts or marketing.

## Coverage

**B17 — Engineering, 2026-10-11.** Every call that costs the platform money,
with its gate and charge. `workspace_access` gates every row.

| Feature / call | Provider | Gate | Charge |
|---|---|---|---|
| Audit answers (ChatGPT, Claude, Gemini) | OpenAI, Anthropic, Google | `prompt_slots` | 1 prompt run per answer |
| AI Overview / AI Mode | DataForSEO | `prompt_slots` | 1 prompt run per answer |
| Answer perception, Commerce shelf, fact verification | Model gateway | `commerce` / `fact_checking` where applicable | Included in the run |
| Prompt generation (after onboarding) | Model gateway | — | AI credits on tokens |
| Prompt quality judge | JEV judge model | — | Not charged now (B13) |
| Commerce buyer prompts | Model gateway | `commerce` | AI credits on tokens |
| Commerce competitor discovery | Tavily, Keenable | `commerce` | Not charged now (B13) |
| Internal-link judge | JEV judge model | — | Not charged now (B13) |
| Agent | Model gateway | `agent` | AI credits on tokens |
| Search Intelligence | DataForSEO (customer key) | `search_intelligence` | None |
| Site Health crawl | Self-fetch | `monitored_urls` | Page-fetch allowance |
| Onboarding research, brand discovery, first prompt draft | Model gateway, Keenable | — | Exempt (B11) |
| Source-page inspection, logo refresh | Self-fetch | — | Exempt (abuse limits) |
| Email | Resend | — | Exempt |
| Search Console / GA4 sync | Google | `history_window` | None |
| Crawl-log pulls | Customer GCP | `crawl_logs` | None |

**B18 — Engineering, 2026-10-11.** Charging is enforced at choke points so a new
feature cannot bypass it: the model gateway requires a metering context
(workspace, feature, payer) and records every call with its tokens and cost; the
provider layer charges prompt runs for every answer-engine and search-surface
dispatch. Tavily and Keenable move behind the same context. A test fails when a
model or provider call is made without one.

## Removals

**B19 — Owner, 2026-10-11.** The Agent custom model (customer model route) is
removed; the Agent always uses the platform gateway and spends AI credits.

## Managed plans

**B20 — Owner, 2026-10-11.** Managed (funded) plans are kept and finished: they
use the same prompt-run allowance (B4, B8), and the funded monthly budget settles
to recorded spend.

## Engineering implementation choices

**B21 — Engineering, 2026-10-11.** Billing tests build their catalog from the
authored launch catalog instead of a frozen JSON copy, so the bundles customers
buy are the ones tested. The frozen copy hid the lockout in B6.

**B22 — Engineering, 2026-10-11.** The checkout SDK name is one literal in the
shared API contract (`razorpay-checkout`), so the API and the browser cannot
drift. They had drifted: every checkout would have shown "unsupported".

## Commercial lifecycle (PR 1)

**B24 — Engineering, 2026-10-11.** A halted subscription (the provider's
retries exhausted) is cancelled at the provider by the next subscription sweep.
Until that is confirmed the row stays current, so a second base plan cannot be
bought and a later charge cannot go unseen. A subscription that resumes before
the sweep is left renewing. Reason: halted was treated as ended locally while
the provider could still charge.

**B25 — Engineering, 2026-10-11.** A declined attempt never fails an order; only
abandonment ends an unpaid one. Razorpay orders cannot be cancelled or expired,
so a capture after abandonment still settles, and a signed checkout callback
reopens the abandoned order for one recovery probe. An add-on or top-up paid
once no base period is live keeps its receipt, grants nothing and is logged for
an operator refund; no automatic refund is issued. Supersedes the plan's "abandoned
orders expire at the provider", which the provider does not support.

**B26 — Engineering, 2026-10-11.** A new access state, `subscription_lapsed`:
the workspace's paid-plan access took effect and has ended. It is never shown as
an expired trial, so trial purge cannot select a former customer. Its message
says "Contact support" until PR 3 routes it to `/billing`.

**B27 — Engineering, 2026-10-11.** After a downgrade, the workspace's prompts
beyond `prompt_slots` are kept, read as `over_plan_limit` ("Not measured") and
excluded from audits. The newest prompts go over first, counting every prompt
whatever its status, the same rule as slot admission. An audit that names an
over-limit prompt explicitly is refused (403 `occupancy_limit_exceeded`).

**B28 — Engineering, 2026-10-11.** The checkout kill switch does not block a
downgrade: it charges nothing and needs only the provider that already bills the
subscription. A checkout callback is accepted after its quote expired, because
the payment is still the customer's.

**B29 — Engineering, 2026-10-11.** A fully refunded payment remains evidence
of the period it paid for; the refund settles as its own record. It previously
broke reconciliation of that subscription on every sweep. This holds only for a
payment Razorpay captured: an authorization that lapsed and was auto-refunded
moved no money and grants nothing.

**B30 — Engineering, 2026-10-11.** An add-on or top-up grants only if it was
paid inside the base subscription's current period, from start to end. One paid
during a gap between periods keeps its receipt and is flagged for an operator
refund, even if a later period is live when it settles. When the provider
refuses to cancel an expiring base checkout, the sweep re-reads it and activates
it if the customer paid meanwhile.

## Plans, AI credits and enforcement (PR 2)

**B31 — Owner, 2026-10-11.** Nothing is free. Every platform AI call spends AI
credits, including prompt generation in onboarding and on the free trial, which
has its own total credits (B16). Supersedes B11's onboarding exemption and its
row in B17. Engineering reads "nothing" as including onboarding research and
brand discovery.

**B32 — Owner, 2026-10-11.** Managed plans are purchasable. The pricing page's
BYOK/managed toggle selects the mode. For a managed workspace the platform
supplies the answer-engine and DataForSEO keys internally, and provider settings
hide them; a BYOK workspace sees and manages its own. That is the only
difference between the two modes (B4). Extends B20.

**B33 — Owner, 2026-10-11.** Only an answer that succeeds spends a prompt run.
An answer that fails after its retries releases its hold.

**B34 — Engineering, 2026-10-11.** Prompt runs are held per answer at admission,
for every audit and every mode, and spent only on a recorded answer (B8, B33).
They replace the trial's separate per-prompt success limit: the trial has 20
runs in total and nothing else. Answer analysis is included in the run (B9).

**B35 — Engineering, 2026-10-11.** One metering owner charges AI credits. A
charged call commits a hold before network I/O, sized as every input byte plus
the output cap (a token is never fewer than one byte), and settles once to the
reported tokens. A call that succeeded with unreadable usage, or a hold a crash
left open for 15 minutes, settles at a 10-credit fallback, never above the hold.
Every platform call (gateway, JEV, Tavily, Keenable) is recorded in
`platform_calls`, and those clients refuse a call made outside a metering scope;
that refusal is the test B18 asks for. Token prices are configuration, not
catalog data. The Agent keeps its per-step dispatch records but uses the same
prices and ledger.

**B36 — Engineering, 2026-10-11.** The managed monthly budget admits a launch
while the month's recorded platform spend is below the ceiling (B20). The
estimate it used before had no configured expected costs, so it would have
refused every managed audit. Prompt runs bound the volume; one launch can
overshoot the ceiling by its own cost.

**B37 — Engineering, 2026-10-11.** A plan carries BYOK and managed prices per
region, each with its own Razorpay plan (keyed `plan:mode:region`). Grants are
identical in both modes (B4). A managed workspace is one whose live base
subscription is managed; the plan decides, never the request. Add-on and
top-up prices follow the subscription's mode. The configured managed price of
"Extra 10 prompts" stays $99 although it no longer adds answers; prices are
configuration (B0).

**B38 — Engineering, 2026-10-11.** Occupancy fails closed everywhere: no grant
means an allowance of zero for projects and prompts, as for markets and API
keys. Commerce and Search Intelligence gate new work only; data already
collected stays readable after a downgrade.

**B39 — Engineering, 2026-10-11.** Removed with the Agent custom model (B19):
provider app routes and their disclosure records, and the customer-destination
probe path. Removed as vestigial: the card-trial quote route,
`trial_requested`, `checkout_url`, `redirect_url` and the hosted-redirect flow,
`credit_price`, 88 unreferenced contract keys and three unused HTTP settings.
`billing:backfill` is now `billing:provision-workspace`, which is what it does.

## Operational but hidden (PR 3)

**B40 — Owner, 2026-10-11.** Search Intelligence on a managed plan runs on the
platform's DataForSEO key and spends AI credits: the DataForSEO cost converts
to credits exactly as token cost does (B14: cost × 1.3 ÷ $0.001, rounded up).
On a BYOK plan DataForSEO is BYOK too: the workspace's own key, not charged
(B17). Answers the open question raised with B38.

**B41 — Engineering, 2026-10-11.** A managed analysis shows its estimate in
credits at review. Confirming it holds that estimate; an exhausted balance
refuses the confirmation and nothing is fetched. When the analysis ends, it is
charged the DataForSEO cost of every request that succeeded (the reported cost,
or the request's estimate when DataForSEO reports none), never more than the
hold, and the rest is released. A failed, refused or unanswered request is never
billed (B47). The review's existing cost ceiling still stops the run
before it can pass the estimate. Dollar amounts are never shown for a managed
analysis (B23).

**B42 — Engineering, 2026-10-11.** The allow-list (B2) is the `billing_checkout`
flag, non-public, issued with `billing:admin grant` and never part of
development or account-manager full access. `BILLING_CHECKOUT_AUDIENCE` is
`allow_list` (default) or `everyone`; the enable PR sets `everyone`. Test keys
are accepted in production, but a test-mode checkout there serves allow-listed
workspaces only, even with the audience set to everyone. The public catalog
never reads a workspace and so never offers checkout before enablement; the app
reads a workspace catalog with the same rules, so marketing and in-app billing
show the same availability. While no self-serve plan is open, in-app billing
lists no prices, as the pricing page does. In-app plan choice offers both modes.

**B43 — Engineering, 2026-10-11.** A workspace whose trial or plan ended keeps
exactly the path to buying a plan: the workspace catalog, its billing state, a
new subscription and that subscription's checkout and verification. The
ended-access screen offers the plans to an Owner or Admin. Add-ons, top-ups,
plan changes, usage and invoices stay behind access.

**B44 — Engineering, 2026-10-11.** Limit refusals say what the plan includes in
plain words, never a registry key, and every refusal a bigger plan can lift
links to billing.

**B45 — Engineering, 2026-10-11.** Seller identity defaults to the values the
owner recorded on 24 September (legal name, address, email, GSTIN and state);
SAC, the LUT reference and the GST approval reference stay owner inputs. The
GST rate has one authority: it is frozen with each India catalog price, plans
and items alike, and quotes use that rate, never the setting it was authored
from.

**B46 — Owner, 2026-10-11.** A customer can resume a scheduled cancellation.
Razorpay cannot undo a cancellation it has received, so CiteLadder holds it
and sends it only shortly before renewal; resuming clears it until then.
Engineering: the lead is `BILLING_CANCELLATION_SEND_LEAD_SECONDS` (two days, so
it lands before any UPI AutoPay pre-debit notice), the subscription sweep
retries the send every reconciliation interval, and the send is committed
before the provider call so a resume cannot race it. Gap: if every send in that
window fails, Razorpay renews once; the customer keeps that paid month and the
cancellation applies at its end. Refunding that renewal is an operator Dashboard
refund today, not automatic.

**B47 — Owner, 2026-10-11.** A failed request is never billed to the customer.
Engineering: a managed Search Intelligence request is charged only when
DataForSEO returned a successful response that CiteLadder kept and did not later
mark failed. A refused, unreadable, timed-out or unanswered request costs
nothing, even when DataForSEO may have billed the platform for it; the hold
releases that share.

**B48 — Engineering, 2026-10-11.** Fixes from the review of PRs 1–3; no money
rule changes.
- In-app billing lists add-ons and top-ups at the workspace's credential mode,
  the mode its purchase is quoted in, so a managed workspace sees the managed
  price. Anonymous readers see the BYOK price.
- A settlement that fails after a charged call returns never replaces the call's
  outcome. The hold stays open and settles as a crash-left hold (B35).
- An audit's prompt runs are held in one ledger pass per audit, under one
  capacity lock, and still as one hold per answer (B34). If the allowance cannot
  cover every answer, the whole audit is refused.
- A downgrade the provider refused lapses when a period starts on or after its
  effective date.
- A charged feature must bound its call size. Without bounds the hold would
  floor at one credit and cap the charge there, so the call is refused.
- The audit-launch ceiling is `max_attempts`, compared with the estimate's
  `maximum_attempt_count`. It bounds provider attempts, not spend.
- Resuming a plan with no scheduled cancellation answers `nothing_to_resume`.
- B18's "charges prompt runs for every … dispatch" is superseded by B33 and B34:
  only a recorded answer spends a prompt run.

## Security audit (2026-10-12)

**B49 — Owner, 2026-10-12.** One mailbox gets one free trial, whatever alias
it signs up under ("Normalize email aliases"). Engineering: the mailbox is the
lowercased address with any `+tag` dropped, and for Gmail the dots ignored and
`googlemail.com` read as `gmail.com`. A public signup whose mailbox already
had a trial inherits that trial's exact window, as a person's second workspace
already does, so a lapsed trial cannot be restarted under an alias. Signups
for the same mailbox are serialized. The global daily trial budget is
unchanged.

**B50 — Owner, 2026-10-12.** A refund cancels the subscription it refunds
("Refund cancels sub"). Not yet implemented: before code, the owner confirms
whether only a full refund cancels, and whether access ends at once or at the
end of the paid period.

**B51 — Owner, 2026-10-12.** Payment disputes (chargebacks) stay on the
backlog to decide later. Today a dispute is neither revoked nor alerted on;
an operator handles it in the Razorpay Dashboard.

**B52 — Owner, 2026-10-12.** Completes B50. Only a full refund of a payment
for the subscription's current period cancels the subscription. It cancels at
once, and the plan grants for that period are revoked when the refund settles.
A partial refund changes nothing.

## Owner inputs still required

Not decisions; needed only for India checkout and live enablement: GST rate,
SAC, GST approval reference, LUT reference, Razorpay test and live keys and
webhook secret.
