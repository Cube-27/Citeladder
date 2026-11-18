# Billing decision log

Current binding billing, entitlement and usage decisions, each with who decided
and the date. Only Owner decisions are listed: implementation detail lives in the
code and in [billing and entitlements](billing-entitlements.md). An entry is
deleted when a newer one replaces it or when code or an owner document fully
encodes it, and merged when two state one rule. B-numbers are never reused, so
gaps are expected; a number cited elsewhere that is missing here was an
engineering choice or was superseded, and its rule lives in the code or the
owner document. Add or change an entry as
[record owner decision](../.claude/skills/record-owner-decision/SKILL.md) says.
Entries marked "not built" are decided but not implemented.

**Money rules need an Owner entry before code (Owner, 2026-10-11).** Any rule
that decides what a customer is charged, refunded or held — what counts as
billable, how an unknown outcome is priced, rounding, markup, tax, proration,
refunds — is asked and recorded here as an **Owner** entry before it is
implemented. Engineering may propose one but not decide it. Reviewers treat a
money rule with no Owner entry as blocking.

## Principles

**B0 — Owner, 2026-10-11.** Billing is fully operational but hidden, so enabling
it is one small configuration PR. The priority is coverage, not pricing: every
feature is gated by a plan capability and every call that costs the platform
money is accounted for or explicitly exempt. Prices, allowances and rates are
configuration.

**B2 — Owner, 2026-10-11.** Billing runs hidden in production through a
per-workspace allow-list: the non-public `billing_checkout` grant issued with
`billing:admin grant`, never part of development or account-manager full access.
Razorpay test keys are accepted in production only for allow-listed workspaces,
and the public catalog reads checkout unavailable until enablement. Rejected:
live keys only; a separate staging stack.

**B4 — Owner, 2026-10-11.** BYOK and managed are one plan internally; BYOK is
only a lower price. Feature gates, prompt runs and AI credits are identical
whichever key pays.

**B5 — Owner, 2026-10-11.** Audit cadence, exports, fan-out, support tier and
`provider.*` are not plan-gated. `history_window` stays (it bounds integration
sync).

**B32 — Owner, 2026-10-11.** Managed plans are purchasable and keep the same
prompt-run allowance (B4, B8). The pricing page's BYOK/managed toggle selects the
mode; for a managed workspace the platform supplies the answer-engine and
DataForSEO keys and provider settings hide them. That is the only difference
between the modes.

**B57 — Owner, 2026-10-16.** Prompt tags and the unbranded toggle, retrieved
versus cited sources, top movers and the editable Overview with PDF export are on
every plan, the free trial included: they read persisted data only and add no
grant or credit charge.

## Prompt runs and AI credits

**B8 — Owner, 2026-10-11.** The measurement unit is the prompt run: each engine
or search-surface answer is one run, on every plan, spent whenever the customer
chooses; manual, scheduled, MCP and public-API audits all count. Only an answer
that succeeds spends a run; one that fails after its retries releases its hold.

**B12 — Owner, 2026-10-11.** Platform AI calls spend AI credits, charged on
tokens at the price of the model that served the call (never per call, never one
rate across models) plus a 30% markup; one credit is $0.001 of usage after the
markup. Customers see only credits, never token prices, markup or the credit's
money value. A model with no configured price is refused, not charged at another
model's rate.

**B13 — Owner, 2026-10-11.** The JEV judge model, Tavily and Keenable are not
charged to customers for now; their calls are still recorded so the cost is
visible.

**B19 — Owner, 2026-10-11.** The Agent custom model (customer model route) is
removed: the Agent always uses the platform gateway and spends AI credits.

**B31 — Owner, 2026-10-11.** Nothing is free: every platform AI call spends AI
credits, including prompt generation in onboarding and on the free trial.

**B40 — Owner, 2026-10-11.** Search Intelligence on a managed plan runs on the
platform's DataForSEO key and spends AI credits, the DataForSEO cost converting
like token cost (B12). On a BYOK plan DataForSEO is BYOK too: the workspace's own
key, not charged.

**B47 — Owner, 2026-10-11.** A failed request is never billed to the customer. A
managed Search Intelligence request is charged only when DataForSEO returned a
successful response CiteLadder kept; a refused, unreadable, timed-out or
unanswered request costs nothing even if DataForSEO billed the platform.

**B53 — Owner, 2026-10-12.** Internal cost is calculated at the serving
provider's published rates, token class by token class: cache writes at the
published cache-write rate, cache reads at the cached-input rate, thinking tokens
at the output rate, and Agent web searches at the published per-search rate
(`search_fee_microusd` in `config/costs.json`). Customers pay a subscription that
includes AI credits; changing plan prices or credit amounts never changes the
internal cost calculation. Verified rates are in the
[provider rate card](operations/CiteLadder_Launch_Config.md#7-provider-rate-card-internal-cost).

**B54 — Owner, 2026-10-12 (not built).** Claude Sonnet 5.5 is offered in the
Agent on Growth and Scale, not on the free trial or Starter. It lives in plan
configuration and may change.

**B55 — Owner, 2026-10-12.** Add-on and top-up prices, quantities and purchase
frequency, and plan allowances (prompt runs, AI credits), are set after testing,
sized from internal cost (B53). Until then documentation states only what each
add-on and top-up can include, never its price or frequency; the values in
`billing-authoring.ts` are placeholders. Top-ups are for paid plans only.

**B61 — Owner, 2026-11-06.** The public trial gets 500 AI credits for its whole
length, no top-ups; Agent access stays excluded.

**B68 — Owner, 2026-11-07.** Included and uncharged platform calls are bounded by
a $25-per-UTC-day internal-cost ceiling across all workspaces
(`platform.daily_uncharged_ceiling_microusd`, `config/costs.json`), and each
feature declares its own gateway output cap (16,000 tokens for prompt generation
and project research, 8,000 for the rest, `config/model-gateway.json`).

**B73 — Owner, 2026-11-10.** Content optimization's model work is split.
Content-angle clustering and owned-page matching are included and uncharged
(bounded by the B68 ceiling; a refused call fails the run and the last
successful run's gaps stay). Generating page suggestions is an Agent turn funded
by AI credits. Optimizing a URL outside the crawl's content pages is a later paid
add-on, not priced yet.

## Agent charging

**B58 — Owner, 2026-11-04 and 2026-11-07.** A failed Agent turn that ends with
nothing saved is not charged (append-only refunds return its debits). A turn the
person stops is cancelled, not failed, and is charged. A turn that saved a
document is charged and succeeds: when funding is refused after a document was
written (B60), or when the browser closes the turn after a document streamed
(B69), the document is saved with a fixed reply. Stop on a turn whose lease
already expired settles like recovery, with the refund. Credit holds must never
refuse work the balance can actually pay for (hold sizing is in
[Agent](agents.md#worker-and-funding)).

## Subscriptions and refunds

**B46 — Owner, 2026-10-11.** A customer can resume a scheduled cancellation.
Razorpay cannot undo a cancellation it has received, so CiteLadder holds it and
sends it only shortly before renewal; resuming clears it until then.

**B49 — Owner, 2026-10-12.** One mailbox gets one free trial, whatever alias it
signs up under (`+tag` dropped; Gmail dots ignored; `googlemail.com` read as
`gmail.com`). A signup for a mailbox that had a trial inherits that trial's exact
window.

**B51 — Owner, 2026-10-12.** Payment disputes (chargebacks) stay on the backlog;
today an operator handles one in the Razorpay Dashboard.

**B52 — Owner, 2026-10-12 and 2026-11-07.** A refund cancels the subscription it
refunds, and a cancellation is just a cancellation; refunds are issued manually
by an operator and there is no partial-refund concept. A full refund of a payment
for the current period (an upgrade payment included) cancels the subscription at
once and revokes that period's grants, so no scheduled upgrade survives. The row
reads `cancelled` but stays current until the sweep's immediate provider
cancellation is confirmed.

**B71 — Owner, 2026-11-07.** Money collected for a period the subscription no
longer grants: a base checkout paid while the abandon sweep cancels it is granted
the paid period's bundle until the paid end; a renewal charged after a B52
cancellation leaves the subscription cancelled, records the receipt, grants
nothing and is flagged for an operator refund.

## Decided, not built

**B74 — Owner, 2026-11-11 (not built).** A platform call whose provider request
failed and whose settlement then also failed is released and never charged; it
does not settle at the 10-credit crash fallback. The change is in the pre-launch
tier of the [backlog](plans/backlog.md) and lands before payments are enabled.
