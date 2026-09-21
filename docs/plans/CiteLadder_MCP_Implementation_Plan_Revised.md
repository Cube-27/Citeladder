# CiteLadder MCP: revised implementation and completion plan

**Revision:** 3 · 21 September 2026
**Supersedes:** `CiteLadder_MCP_Implementation_Audit_and_Plan.md`. This is the complete replacement plan, not an addendum.
**Change basis:** complete the public MCP connection and evidence-reading experience without adding an instruction-distribution surface.
**Audit baseline:** retained from the original 20 September 2026 review. This revision narrows the public plan and is not a new source-code or live-deployment audit.

## Decision

**Keep the hosted, account-authorized, read-only MCP and complete its evidence access and public connection guide.** Do not replace the server or clone OpenSEO’s paid research/write architecture.

The public `/docs/mcp` guide covers connection setup, a connection check, ordinary example requests, the supported MCP tool reference, data limitations, privacy, revocation and troubleshooting. Preserve the existing MCP admission and workspace policies.

Remove the previously proposed `get_skill` addition. Keep the existing native `list_skills` metadata contract accurate; do not add instruction bodies to it.

The main limitation is not the number of skills. The current MCP often gives an agent a summary and an artifact ID without a supported route to the underlying evidence. Better instructions cannot compensate for unavailable page-linked queries, answers, citations or page facts. The completion work should make those existing product records discoverable, retrievable and citable. [C01–C03]

## 1. What was inspected

| Surface | Inspected state | What this establishes |
|---|---|---|
| CiteLadder main | `3da7ad38e163e21e7e461f7ea542219a73175df5` | Registered tools, data projections, authorization code, public docs source and selected owner contracts. |
| Search Intelligence | Open PR **#117**, head `fe777180dfdc034d6a20eeed1336c2a35fecb9ab` | New product API, dataset contracts and acquisition/read separation. Not evidence of merge or production deployment. |
| MCP file in PR #117 | Same blob as main: `e08f9048f995d78ff2047aeaa9d12e3336896185` | The PR does not add MCP tools for its new datasets. |
| CiteLadder public page | `/docs/mcp` retrieved successfully through a fresh Firecrawl request | Live documentation text, including its nine-tool list and demo-access wording. Not a successful MCP authorization or tool-call test. |
| OpenSEO | Public MCP guide and eight relevant skill files | Comparison material and workflow patterns, not a requirement to copy its architecture. |
| Official client/protocol documentation | OpenAI, Claude Code and current MCP specification pages | Current documented client and wire-contract expectations. |

**Not verified:** the deployed MCP catalog, deployment environment variables, current production eligibility, successful OAuth in a real client, backend test execution, database contents, provider execution, native Windows/macOS behavior, or live model quality. Code tests were inspected, not run against CiteLadder. [C01, C04–C07, P01–P03]

A coding agent must rebase these findings onto the actual working branch. PR #117 is a dependency for its dataset adapters, not a reason to rebuild Search Intelligence in parallel.

## 2. Preserve these existing strengths

CiteLadder already has a useful security and ownership boundary: persisted-data reads, current workspace membership checks, exclusion of system workspaces, a shared read-role policy, OAuth consent, PKCE support, one-use authorization transactions/codes, token rotation/revocation, resource binding, encrypted client-secret custody and transport guards. A retry of an MCP read does not authorize a crawl or paid provider call. These are assets to preserve, not missing features. [C01–C03, C05–C07]

Keep product owners responsible for calculations and data acquisition. MCP should adapt authorized read services, not invoke the app’s REST endpoints with a browser token, duplicate SQL-based scoring, create a second crawler, or recalculate visibility inside the model.

### OpenSEO comparison: what actually improves the setup

| Area | OpenSEO reference | CiteLadder decision |
|---|---|---|
| First successful session | Its MCP guide links connection setup to Agent Skills and focused jobs. | Adopt a clear connection check and ordinary example requests; do not copy its instruction-distribution model. |
| Research surface | The guide documents live research, saved keywords, GSC and URL inspection. | Match useful evidence depth, not tool count. Expose saved CiteLadder data first; do not silently add paid acquisition. |
| Client setup | The guide separates CLI/desktop paths and includes Cursor. | Publish a tested client matrix instead of assuming identical support across clients and modes. |
| Reports and continuity | Its current skills use project context and saved reports. | Reuse context and compact handoffs now; keep cloud saving deferred until a separate authorized write exists. |

The first three rows compare the public guides; the final row comes from the inspected skill files. OpenSEO’s architecture is a reference, not a required replacement for CiteLadder’s read-only boundary. [O01–O02, O07, C04]

## 3. Findings and priorities

**P1:** required for the intended end-user growth workflows or truthful setup documentation. **P2:** reliability, operational or expansion work. These labels are delivery priorities, not vulnerability ratings.

| ID | Priority | Finding and consequence | Required change |
|---|---|---|---|
| M01 | P1 | `fetch` accepts only project, opportunity and prompt records. Summaries also emit audit, crawl, snapshot and artifact references that it cannot open. The evidence chain stops early. [C02–C03] | Add an allowlisted evidence resolver and return retrievable references with every material finding. |
| M02 | P1 | GSC MCP exposes separate query/page breakdowns, not a query-page table. A real query-page reader already exists in the Demand API. [C01, C08–C09] | Expose that existing reader. Do not infer page-query joins or create another sync pipeline. |
| M03 | P1 | The visibility MCP read is a latest-audit summary; there is no dedicated answer, citation, selected-source or fanout detail reader. [C01, C03, C12] | Add bounded result/source reads using the same frozen selection as the product. |
| M04 | P1 | Site Health MCP returns scores and coverage, not an inventory of page facts, issues and contextual link evidence. [C01, C03, C10] | Add page and link readers; resolve detailed final analyses through `fetch`. |
| M05 | P1, after PR #117 | The new DataForSEO datasets are not registered in MCP. The PR’s backlink datasets are aggregates, not individual backlink edges. [P01–P03] | Expose published dataset reads and their exact granularity. Preserve reviewed acquisition outside MCP. |
| M06 | P1 | `search` items lack a canonical `url`; `fetch` is not normalized to the documented retrieval document shape. This matters for ChatGPT retrieval/citations, not merely aesthetics. [C02, W01] | Add URL-backed search results and a typed document envelope; test the intended ChatGPT mode. |
| M07 | P1 | Public docs list nine tools although the source registers thirteen and hardcode demo-only copy. [C01, C04–C06] | Generate the supported tool reference, complete the connection/check/example journey and make MCP eligibility wording match deployment policy. |
| M08 | P1 | `list_skills` returns native metadata, not instruction bodies. [C02] | Correct metadata-only descriptions; preserve the existing native contract without adding bodies and remove the proposed `get_skill`. |
| M09 | P1 | Context caps active prompts at 50 without continuation; opportunity reads provide a small non-pageable shortlist; project enumeration is unbounded. [C02–C03] | Add bounded, stable enumeration and honest completeness metadata. |
| M10 | P2, small change | MCP omits comparison/page-size arguments already handled by the performance read layer. Loose string/dict signatures also obscure allowed values and result semantics. [C01, C03] | Forward supported options and use typed public DTOs and schema tests. |
| M11 | P1 release gate | Inspected tests use the `2025-11-25` initialize flow; current official MCP documentation describes the newer `2026-07-28` lifecycle. The dependency range alone does not prove either deployed compatibility. [C07, C14, W02–W04] | Record actual locked SDK and supported protocol revisions; test each advertised client/version. Do not confuse `stateless_http=True` with proof of the new protocol lifecycle. |
| M12 | P2 | The consent page has approval but no explicit denial action; protocol revocation exists, while customer-facing connection-management coverage was not established in this audit. [C01, C05] | Add denial and verify or provide account-scoped connection listing/revocation. Do not claim revocation itself is absent. |

### Important scope corrections

**Business context is not necessarily stale merely because it uses BrandProfile.** The owner documentation says BusinessContext composes/serializes facts into that profile. The improvement is to expose review state, field provenance, locale and accepted competitors clearly, not to invent another company-context store. [C13]

**A site-health score is not indexing evidence.** Likewise, query fanout is not a citation; a competitor mentioned in an answer is not automatically present on a cited publisher page. The product’s own contracts distinguish these states. MCP and skills must preserve those distinctions. [C10–C12]

**Search Intelligence is not wholly missing from the product.** It is present on the inspected PR branch. Its MCP adaptation is missing. Its `referring_domains` and `destination_pages` are not source-page backlink records; exposing them must not manufacture edge-level fields. [P01–P03]

## 4. Target architecture

```text
Public MCP path
  /docs/mcp → OAuth connection → supported tool discovery
  → account/project authorization on every read
  → existing product read owners
  → typed, bounded evidence with frozen scope and retrievable references
  → user's ordinary request → frontier-model analysis, draft or plan
```

The MCP completion release remains **read-only**. Content drafting happens in the user's model/client. Server-side report saving, context editing, prompt activation, acquisition, publishing and outreach are not prerequisites for a high-quality read/analysis/draft workflow.

### 4.1 Common evidence contract

Add shared types under `backend/app/domain/mcp/` and keep registrations thin. Reuse existing domain DTOs where accurate; do not wrap every field in another layer. Preserve existing public fields and add compatible metadata rather than silently renaming them.

Every evidence response must make the following inspectable:

| Field | Requirement |
|---|---|
| Identity | Authorized project; snapshot/audit/crawl/dataset ID; each item’s own stable ID. |
| Observation time | Capture/import/measurement time and actual data window. Distinct from request/retrieval time. |
| Scope | Returned market, language, device, search type, engine/surface and cohort where relevant. Unsupported dimensions stay absent/unknown, not invented defaults. |
| State | Available, partial, unavailable or failed, with the product owner’s reason. Observed zero remains a number, not a missing-data state. |
| Coverage | Population/eligible denominator when known; observed count; truncation and sampling limits. |
| Pagination | `next_cursor`, `has_more`, returned count and exact total only when actually known. |
| Provenance | Source references and analyzer/extractor/formula/prompt versions when meaningful. |
| Follow-through | A resolvable `record_uri` or explicit `retrievable: false` with reason. A UUID alone is not a successful evidence fetch. |

Use object results for broad client compatibility. Typed return models should drive output schemas; inspect the actual SDK’s wire result to confirm matching `structuredContent` and JSON text compatibility. A Python `dict[str, Any]` does not itself prove that structured content is missing, but it gives little schema guidance. [W01, W04]

Recommended transport bounds for new list adapters: default 50 rows, maximum 200, capped lower when the existing owner is stricter; configure these centrally. Use existing cursor owners where present. Add stable ID tie-breakers and freeze selection identities. Protect serialized responses with a configured byte bound; if a record exceeds it, return explicit completeness information and server-generated part references rather than silently cutting text or relying on client truncation. These are proposed engineering bounds, not SEO rules.

Keep successful “not yet measured/not imported” responses distinct from invalid requests and execution failures. Never make an unavailable exact range silently fall back to another window. Reject invalid cursor/scope combinations. Treat expired authorization through the established auth path; do not let an agent retry it as missing data. Preserve non-disclosing not-found behavior for foreign records.

### 4.2 Evidence resolver and citation documents — M01/M06

Extend `fetch_business_record` into an explicit registry of safe record serializers. Each resolver authorizes the record’s own workspace/project before reading it. Do not implement arbitrary URLs, arbitrary table names, SQL, filesystem paths or a generic provider proxy.

Support the record families actually emitted by the new readers: project, prompt, opportunity, demand/query-evidence snapshot and row, site snapshot/crawl/page-analysis/issue, visibility audit/answer/citation, earned source-page snapshot, traffic snapshot and Search Intelligence run/dataset/row. Exact internal model names and wire IDs must come from the relevant owner; these labels are the target resolver vocabulary, not a claim that every model already uses them.

Some raw integration/provider artifacts may contain fields unsuitable for clients. For them, return a redacted evidence projection or explicitly mark the reference non-retrievable. Never expose credentials, confidential transport payloads or unrelated tenant data merely to make every UUID fetchable.

Normalize retrieval documents to:

```json
{
  "id": "<server-returned record URI>",
  "title": "<record-specific readable title>",
  "text": "<complete bounded evidence document, not a fabricated narrative>",
  "url": "<verified authenticated application permalink>",
  "metadata": {
    "project_id": "<authorized project>",
    "record_type": "<allowlisted type>",
    "observed_at": "<actual timestamp or null>",
    "complete": true
  }
}
```

This JSON is a proposed format example, not real evidence. Keep the structured domain record available in metadata or the dedicated detail result without making clients parse prose for numerical analysis.

Search results should carry `id`, `title` and usable `url`, plus an optional bounded snippet. Preserve a results envelope. OpenAI’s current retrieval guide describes this shape and uses nonempty URLs for citation metadata; merely having tools named `search` and `fetch` is insufficient evidence that ChatGPT retrieval citations work. This is a client-specific contract to test, not a blanket claim of MCP noncompliance. [W01]

Use existing authenticated application deep links when they identify the correct record. Where none exists, add one thin authenticated evidence-detail route, backed by the same resolver and session authorization. Do not link project analytics to the public homepage, invent a permalink, embed a token in a URL, or make evidence public to enable citations. A reader still needs authorized access to open the link.

### 4.3 Complete the read catalog

**The eight names below are proposed read additions, not currently registered tools.** Keep all thirteen existing tool names. `get_skill` is removed from this revision. Avoid a single generic query tool with arbitrary JSON and avoid dozens of provider-specific wrappers.

| Proposed tool | Inputs and returned evidence | Reuse / acceptance condition |
|---|---|---|
| `read_prompt_portfolio` | Project, optional prompt-set/cohort filter, cursor and limit. Returns prompt ID/text, topic, cohort, active state, generation evidence and version/provenance where persisted. | Existing prompt owner and frozen prompt-set relationships. A 51+ prompt fixture is enumerable without keyword search or omitted rows. |
| `read_query_evidence` | Project, required `window_start`/`window_end`; supported `query`, `site_url_id`, `resolution_outcome`, cursor and limit. Returns snapshot and actual page-linked query rows. | `domain/demand/query_evidence_reads.py` as used by `api/demand.py`. Preserve exact/resolved/ambiguous/unresolved page identity. [C08] |
| `read_site_pages` | Project, optional concrete crawl, supported page-kind/issue/query filters, cursor and limit. Returns page identity, final analysis reference, applicability, observed issues, page metadata and content/coverage references. | Site Health’s existing final-result readers. Selecting a crawl freezes dependent page reads. Do not claim full HTML: the owner stores bounded normalized facts. [C10] |
| `read_site_links` | Project, concrete crawl, optional source/destination page and placement filters, cursor and limit. Returns persisted source/destination/anchor/region evidence and any observed link metrics. | Existing link/architecture projection. If placement was not captured, return unknown; do not classify contextual links from counts alone or recompute the graph on read. [C10] |
| `read_visibility_results` | Project and concrete audit; supported prompt/engine/cohort filters, cursor and limit. Returns frozen prompt, actual answer or its complete part references, result status, engine/surface, timestamps, entity outcomes, citations and fanout/retrieval observations when captured. | Existing audit/analysis result owners; never rerun an answer or synthesize missing retrieval telemetry. [C12] |
| `read_visibility_sources` | Project and concrete audit/selection; `level` domain or URL; supported engine/cohort filters and cursor. Returns owner-computed usage/denominators, source/page classification and earned-page detail references. | Existing Sources projection. Keep answer co-occurrence, citation occurrence and inspected on-page brand presence separate. [C11–C12] |
| `read_search_intelligence` | Project and optional explicit run; return readiness plus bounded published-dataset descriptors, target/market/date/coverage and current acquisition status. Add a cursor for historical run/dataset enumeration when needed. | PR #117’s authorized persisted read paths. No review creation, preference write, confirmation, repair or acquisition. [P02] |
| `read_search_dataset` | Project, actual `dataset_id`, cursor, limit, supported sort and direction. Returns descriptor, rows and next cursor. | `dataset_page` and existing pagination in `domain/demand/search_intelligence/`; preserve all eight existing dataset kinds and their own schemas. [P02–P03] |

**Do not invent filters the existing owner cannot answer.** In particular, query-page country/device filtering must be supported by the persisted grain; independently aggregated country and device tables cannot manufacture it. Register only the supported subset and describe omitted dimensions.

The Site Health and Visibility owner documents establish richer persisted evidence, but this review did not exhaust every internal read function. Before adding an adapter, resolve the direct reader behind its current UI/API. Extract a small shared read method inside that owner if necessary. Do not duplicate calculations or bypass authorization because an exact helper name is absent from this report.

#### Extend current tools instead of adding more

- `list_projects`: optional bounded pagination, stable ordering and project/workspace identity. Preserve default behavior for existing small accounts.
- `get_project_business_context`: expose reviewed versus inferred fields, locale, accepted competitor identities, owned domain and continuation to the prompt portfolio. Add an `available_datasets` inventory whose descriptors identify the owning read tool, availability state, observation date and material limitation; use `read_integration_status` and `read_search_intelligence` for detail. Add optional section selection; omit expensive unrelated aggregates in focused work. Keep a summary default. Do not establish a second editable context database. [C02, C13]
- `read_opportunities`: preserve the current ranked-first experience; add cursor/status filtering, stable item IDs and per-item evidence references. A query that fetches only one extra row proves `has_more`, not the exact number of omitted opportunities. [C03]
- `read_visibility_audit`: add explicit audit selection and a completed-baseline selector. Preserve visibility of the most recent in-progress/failed run instead of hiding it. An explicit unknown ID must not fall back to Latest. Return timestamps, frozen measurement identity and result/source continuation. [C03, C12]
- `read_performance`: forward the existing comparison-window options through validated arguments, retaining the owner’s exact-window semantics. `read_performance_table`: forward supported `page_size` and `compare_snapshot_id`. Keep cursors bound to snapshot, dimension, filters and sort. Do not aggregate dimensional rows into GSC headline totals. [C01, C03, C09]
- `read_ai_referrals`: attach available persisted provenance and formula/window identity. Preserve the attribution limitation; referral sessions are not all AI-influenced visits. [C03, C09]

### 4.4 Paid acquisition and write actions

No new paid calls or writes are included in this completion release. The PR already separates review, explicit confirmation, execution and persisted dataset reads; reuse that boundary. Reading a cached dataset, catalog or connection status must never repair/retry an uncertain paid request. [P02–P03]

Document the public data handoff as: “This dataset is missing or stale; refresh/acquire it in CiteLadder, then retry your request.” Where the project already has a valid result, use it with its actual date. Do not make users buy the same data because an agent could not discover its dataset ID.

A later action-capable MCP can separately expose a review/confirm flow with different scope, explicit cost approval, target/data-depth binding, idempotency, entitlement and uncertain-dispatch safeguards. It is **deferred**, not required to release this read/analysis/draft setup. Report saving and context editing would also be separate write contracts, not hidden side effects of analysis.

## 5. Public `/docs/mcp` redesign and replacement content

### 5.1 Page structure

Keep the existing Astro route and marketing components. Use Geist and the existing typography/spacing tokens. The page is a complete **MCP connection and usage guide**.

| Section | Content |
|---|---|
| Start | Endpoint with copy button, read-only scope, connection status when applicable, and “Connect → check access → ask a question.” |
| Connect | Codex first, then Claude Code, then other clients with verified instructions/status. Show terminal commands separately from in-chat commands. |
| Check connection | One read-only project/coverage check and expected output, not a broad audit. |
| Example requests | Short, ordinary requests for business context, search performance, AI visibility and evidence-backed drafting. |
| Data and tools | Generated supported tool reference, evidence granularity, timestamps and read-only behavior. The existing native `list_skills` entry describes metadata only. |
| Access and privacy | Account/project boundary, scopes, no provider secrets, client trust boundary and verified revoke path. |
| Troubleshooting | Authentication, missing project, missing/stale data, unavailable tool or date window, and client-mode support. |

Use a desktop contents rail and a simple mobile contents disclosure. Keep headers and descriptions in balanced columns where the current layout calls for two columns; do not create narrow text blocks separated by excessive empty space. Commands need readable code type and horizontal overflow. Numeric values in any data table should be centered, text left-aligned, with stable column widths. Reuse existing copy-button primitives. No new component framework or dependencies are needed.

Keep the guide focused on connection and ordinary MCP usage; do not add unrelated commercial calls to action.

### 5.2 Fix the catalog and connection eligibility

The four source-registered tools missing from the original public list are `read_performance`, `read_performance_table`, `read_ai_referrals` and `read_integration_status`. Add them subject to deployment verification. [C01, C04]

Generate an allowlisted **MCP tool-reference** artifact from the server registrations/typed metadata during build or CI, not by querying an authenticated production server from the marketing page. Check agreement between registered documented tools and rendered documentation. Include the server release version and supported data semantics, not merely a tool count.

For the existing `list_skills` tool, use an accurate description such as: “Inspect metadata for native content formats and supported read capabilities.” Preserve its wire name for compatibility and do not add instruction bodies.

The code supports a configured demo restriction **and** a non-demo mode; actual live settings were not inspected. Use generic signed-in-account wording and, where necessary, an accurate deployment-owned MCP status. Do not silently relax admission. [C05–C06]

Suggested connection access copy:

> Sign in with your CiteLadder account and approve read access. The assistant can read projects available through your current workspace memberships. If authorization is denied, check the account and connection permissions with your workspace administrator.

When a deployment is explicitly demo-only, accurately identify that MCP connection status. Do not use “sign in with the demo account” in general setup steps.

### 5.3 Page-ready core copy

Insert the generated tool reference after verifying deployed capabilities.

<!-- BEGIN PUBLIC COPY -->

# Connect your AI assistant to CiteLadder

Use your company's saved search, site-health and AI visibility evidence to research opportunities, write content and build action plans in your AI assistant.

**Server endpoint**

```text
https://citeladder.com/mcp
```

CiteLadder's hosted MCP is read-only. Your assistant can analyze the data it receives and create drafts in its own workspace. MCP reads do not start crawls, run visibility prompts, refresh provider data, activate prompts or publish content.

## Connect Codex

Run these commands in a terminal:

```bash
codex mcp add citeladder --url https://citeladder.com/mcp
codex mcp login citeladder
codex mcp list
```

Complete the browser sign-in and approve access. Your client or workspace administrator may control which MCP connections are allowed. CiteLadder does not ask you to paste an OpenAI API key into this connection.

## Connect Claude Code

To make this connection available across your projects:

```bash
claude mcp add --transport http --scope user citeladder https://citeladder.com/mcp
```

Then open Claude Code, run `/mcp`, select CiteLadder and complete authentication. For a connection limited to the current project context, choose the appropriate client scope instead of `user`.

## Check the connection

Paste this into your connected assistant:

```text
Check my CiteLadder connection only. Discover the exposed tools and list my
projects. Select the project for [domain], asking me only if several match.
Read its business context and integration status, then call
read_search_intelligence to enumerate its saved datasets. Show the available
evidence, actual observation dates and important limitations. Do not run a full audit,
refresh data or call paid providers.
```

The result should identify the project, available datasets, their observation dates and any limitations. A missing projection is not a measured zero.

## Example requests

**Review business context**

```text
Read the business context for [project/domain]. Summarize its offers,
audience, market and available evidence. Distinguish reviewed facts from
inferences and identify missing information before recommending changes.
```

**Review search performance**

```text
Review the saved search performance for [project/domain]. Show the actual
date range and coverage, explain material changes supported by comparable
data, and cite the records behind your findings.
```

**Investigate AI visibility**

```text
Review the latest completed AI visibility results for [project/domain].
Explain the main gaps using the answers and sources you can actually read.
Keep missing evidence explicit and recommend the most relevant next action.
```

**Draft content from evidence**

```text
Using the available CiteLadder evidence for [project/domain], draft
[content type] for [audience and purpose]. Use supported company facts,
identify anything requiring verification, and provide the complete draft.
Do not claim it was saved in CiteLadder or published.
```

## Understand the data

MCP reads saved CiteLadder evidence, not a live search engine. Tool availability depends on the deployed version; dataset availability also depends on the project's completed runs and connected sources.

The tool reference below shows what this release exposes. A summary does not imply access to the underlying raw records. Separate GSC query and page breakdowns are not a page-linked query report. Referring-domain summaries are not individual backlink edges. AI citation counts, brand mentions and inspected publisher-page presence describe different observations.

## Access and privacy

The connection requests `citeladder:read`. Each protected read rechecks access through your current workspace memberships. The hosted read tools do not return provider credentials. Your AI client receives the records you ask it to read; review that client's data policies and your company's rules before using sensitive information.

Disconnect through the client and use CiteLadder's published revocation procedure where available. Removing a local configuration entry is not, by itself, proof that a server-side OAuth grant has been revoked.

## Troubleshooting

| Problem | What to check |
|---|---|
| Authorization fails | Confirm the exact endpoint, signed-in account, connection availability and administrator restrictions. Complete a new OAuth login if the previous grant expired or was revoked. |
| A project is missing | List projects again and confirm the account and current workspace membership. Do not guess project IDs. |
| Data is missing or old | Read integration status and actual coverage dates. Complete the necessary sync, crawl or audit in CiteLadder. Repeated MCP reads do not acquire data. |
| A request needs an unavailable tool | Use the runtime tool catalog. Request the missing scoped data or use the supported partial analysis; never invent evidence. |
| A custom date window is unavailable | Use an existing persisted window or materialize the requested range through CiteLadder's normal workflow. Do not silently substitute another date range. |
| A client cannot connect | Check its supported remote MCP transport, OAuth setup and administrator settings against the tested client guidance. |

<!-- END PUBLIC COPY -->

**Publication gate:** verify the endpoint and commands against the deployed/client versions; render only the generated supported tool reference; replace general revocation guidance with the actual shipped UI/procedure; add only client steps tested or explicitly labelled documented-but-unverified. Do not publish proposed capability names as already available.

### 5.4 Publication and client support

The public release updates **the existing `/docs/mcp` route only** for connection setup, tool documentation and ordinary usage.

Keep public client support focused on the connection: transport, OAuth, tool calls, evidence links and tested client modes. Prioritize **Codex CLI and Claude Code** for acceptance. Add other clients only with a distinct status: tested, documented but not tested, or not supported by this release. A supported OAuth transport does not prove every client mode supports MCP prompts, resources or deep-research citation rendering. Do not state client-plan entitlements from memory; use the current client's official setup documentation. [W01, W05, W07]

## 6. Protocol, authorization and operations

### Protocol compatibility — M11

The inspected dependency declaration is `mcp>=2,<3`; the test fixture sends a `2025-11-25` initialize request. Current official documentation describes a changed `2026-07-28` lifecycle, including per-request version/capability metadata rather than that handshake. This is a compatibility test requirement, not proof that the deployed server is broken. [C07, C14, W03]

Record the resolved SDK version from the lockfile/runtime, supported revisions and tested client versions. Exercise the old handshake only for revisions that use it and the newer discovery/request flow only when supported. Do not hand-patch protocol state or force an SDK major upgrade merely to advertise “latest.” Keep the existing valid clients working, and gate additional claims on conformance plus real-client acceptance.

The current authorization specification prefers Client ID Metadata Documents and retains dynamic registration for compatibility. CiteLadder currently uses dynamic registration. Retain it for current clients; assess SDK-supported metadata-document registration as a separate compatibility enhancement, with validated URLs and SSRF protections if added. Do not call OAuth wholly missing or automatically remove the working registration endpoint. [C05, W02]

### Consent and revocation — M12

Keep the account-scoped grant, membership rechecks and `citeladder:read` scope. Clarify on consent that access spans projects available to this account, including changes in membership; do not imply a project-limited grant when none exists.

Add a Deny action that terminates the specific pending transaction safely and returns the standard denial to its previously validated redirect. Retain CSRF protection and no-store behavior on both actions. Never accept a new return URL from the form.

Verify existing account settings for OAuth grant management. If absent, add a small authenticated connection list with client name, created time, status and revoke action backed by the existing grant owner. Only the account owner can manage their grants. Return no token material. Test that revocation invalidates access and refresh tokens and that removed workspace membership blocks reads without waiting for token expiry.

The source already rotates refresh tokens. Replay-family invalidation and concurrent-refresh policy require an explicit test before claiming robust reuse detection; this audit did not demonstrate a bypass. Treat any required replay hardening as a focused auth task, not a speculative reported exploit. [C05–C07]

### Operational controls

Inspect existing application/edge middleware before adding new infrastructure. Ensure the MCP and registration paths are covered by request-body limits, bounded execution, registration/authorization abuse controls, authenticated read-rate limits and sanitized error handling. This audit did not establish their deployed values or prove they are absent.

Use existing observability for tool name, request ID, authorized scope, duration, returned count/bytes, state and error class. Avoid logging tokens, raw answers, sensitive keyword lists or full customer content by default. Record repeated unavailable-range reads so unusable workflows can be fixed without guessing.

Treat returned page text, competitor text and retrieved documents as untrusted content. Do not let them trigger tool actions or change permissions. Preserve the app’s redaction and third-party inspection boundaries; MCP is not an authenticated-web scraping bypass.

## 7. What to adopt from OpenSEO

| Pattern inspected | CiteLadder adaptation | Not adopted |
|---|---|---|
| Project setup before research | Read reviewed context first; ask only for task-critical gaps; retain a clearly labelled local handoff. [O02] | Automatic cloud updates when CiteLadder exposes no write tool. |
| Distinct market and named-competitor workflows | Modes within `citeladder-search-opportunities`, not more skills. [O04–O05] | Broad landscape calls for a single competitor task. |
| Keyword clustering | Buyer-intent-to-page map with keep/refresh/create/defer and observed existing destinations. [O03] | Treating overlapping query impressions as proof of harmful cannibalization. |
| Link prospecting | Asset-first qualification; public contact-path source/date; separate citation and backlink evidence. [O06] | Guessed email addresses, bulk outreach and invented backlink edges. |
| Report delivery | Short decision summary, specific evidence, material rejected candidates and usable downstream handoff. [O07] | Refusing analysis because an HTML renderer or cloud report-save tool is missing. |
| Isolated skill evaluation | Frozen instructions, fresh sessions, neutral tasks, holdouts and retained failure traces. [O08] | Production no-auth mode, automatic paid evaluation runs or assuming static assertions prove model quality. |
| Research reuse | Match identity, scope, window, grain, depth and decision-sensitive freshness. [O02–O05] | A blanket 30-day freshness rule for every dataset or fact. |

## 8. Implementation sequence

### Slice 1 — contracts and evidence follow-through

Owners: `domain/mcp/server.py`, `domain/mcp/data.py`, `domain/agent/tools.py`; new focused MCP schema/serializer modules as needed.

Implement typed results, citation-compatible search/fetch envelopes, allowlisted record resolution, proper item IDs, pagination/completeness and the small performance argument-forwarding fixes. Keep aliases/fields used by existing clients. Add tests around the real serialized MCP result rather than only calling Python functions.

**Done:** each supported summary reference can be opened or is explicitly non-retrievable; foreign IDs fail closed; generated catalog equals registration; no provider or write path is invoked by reads.

### Slice 2 — high-value detailed evidence

Add prompt portfolio, query-page evidence, site pages/links and visibility results/sources adapters. Reuse the product owners and their immutable selection IDs. Add source-page inspection detail through the same evidence resolver, preserving coverage and roster identity.

**Done:** the GSC, technical, internal-link and visibility skills can traverse a fixture’s evidence chain end to end without inference from unrelated aggregates or titles. Missing capture remains unavailable.

### Slice 3 — Search Intelligence read parity

Apply after or together with the accepted PR #117 implementation on the actual branch. Add overview/dataset reads using its existing services, dataset-specific DTOs and pagination. Do not create reviews or invoke acquisition from these tools. Expose stored citation-match evidence only if a persisted read projection exists; its POST derivation is not a read.

**Done:** an authorized agent can enumerate saved datasets, select exact rows and cite them with target/market/date/grain. It cannot infer source-link URLs from referring-domain summaries or trigger a paid refresh.

### Slice 4 — public connection docs and client acceptance

Update the public Astro page using Section 5 only: connection, connection check, ordinary example requests, generated tool reference, data semantics, privacy and troubleshooting. Keep the native `list_skills` metadata description accurate and do not add `get_skill`.

Add denial/revocation UX where missing. Run the supported client/protocol matrix before advertising connection compatibility.

**Done:** an eligible MCP user can connect, discover their project, enumerate available datasets with observation dates and limitations, read supported evidence, make an ordinary request and revoke access.

**Out of scope:** new provider pipelines, individual-backlink acquisition, GSC URL Inspection ingestion, a report CMS, scheduling, website publishing, autonomous outreach, prompt activation and a new MCP write scope.

## 9. Acceptance matrix

Prefer focused parameterized tests and integration fixtures over many trivial one-line tests. Reuse the existing authorization and owner fixtures. A clean formatter/linter run is not a client acceptance test.

| Test family | Required proof |
|---|---|
| Catalog/docs parity | All documented registered tools, input/output shapes and read-only behavior are accurate. The existing `list_skills` description is native metadata only. |
| Tenant safety | Every new list, detail, cursor, record part and permalink refuses foreign project/workspace IDs; system workspaces excluded; role/membership revocation effective immediately. |
| Read purity | Spy/fail provider, model, enqueue and mutation boundaries for all new reads. Unavailable data does not write/refresh. Auth bookkeeping remains separate from product mutations. |
| Evidence follow-through | Summary → concrete item → underlying evidence/part → valid authenticated permalink. Explicit inaccessible-reference state where raw data is intentionally not exposed. |
| GSC correctness | Same query across different pages; unresolved page mapping; exact custom window absent; empty vs missing; pagination; incompatible country/device scope; no dimensional sum presented as a headline. |
| AI correctness | Completed, partial, running and failed audits; explicit ID not found; differing prompt/model/cohort identity; answer citation vs query fanout; source co-occurrence vs inspected page presence. |
| Site correctness | Final vs initial analysis; truncated facts; page-kind applicability; incomplete crawl; unknown link region; no definite orphan or indexing claim without supporting evidence. |
| Search Intelligence | All eight kinds; exact target/market/depth; published vs partial/empty/unavailable; cursor/sort mismatch; no raw-edge claims from aggregates; zero provider calls. |
| Pagination | More than 50 prompts, more than 10 opportunities, many projects; no duplicate/skipped items under stable selection; unknown totals stay unknown. |
| OAuth/client wire | Actual supported revision flow, discovery metadata, audience binding, expired tokens, consent denial, refresh behavior and revocation; repeated failed login does not start a tool action. |
| End-user outcomes | An eligible user completes the connection/check/request/revocation path, receives the available-dataset inventory with dates and limitations, and gets supported partial analysis rather than invented evidence when data is missing. |

Run repo-owned checks for changed code: Ruff, mypy, the existing frontend lint/type/format commands and focused tests, then the normal CI gate. Resolve command names from the current `AGENTS.md` and package scripts rather than adding duplicate check runners. No live provider tests, production resets or deployment under the authority of this document alone.

## 10. Completion standard

This setup is complete when the product, deployed read catalog and public connection guide agree on the evidence an assistant can read and the actions it cannot perform. An eligible user can connect, select a project, enumerate available datasets with dates and limitations, inspect evidence, obtain an analysis or draft, and revoke access. The workflow does not depend on invented metrics, hidden paid refreshes or pretending a local draft was saved or published.

## Source register

The source register is retained from the original audit. Repository links are pinned where used as implementation evidence; external documentation can change. This revision did not re-fetch those sources or retest client commands. Source-derived facts remain attributed to the original audit baseline, not asserted as a fresh deployment inspection. Proposed tool names and engineering choices are requirements, not claims of shipped capabilities.

- **C01** — [MCP registrations, consent page and dispatch](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/domain/mcp/server.py)
- **C02** — [MCP account authorization, context, search/fetch and skill catalog](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/domain/mcp/data.py)
- **C03** — [Agent persisted evidence projections](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/domain/agent/tools.py)
- **C04** — [Public MCP Astro route](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/frontend/apps/marketing/src/pages/docs/mcp.astro)
- **C05** — [OAuth provider](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/domain/mcp/oauth_provider.py)
- **C06** — [MCP configuration and admission](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/core/config/mcp.py)
- **C07** — [MCP component tests inspected, not executed](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/tests/component/test_mcp.py)
- **C08** — [Demand API and query-page read delegation](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/app/api/demand.py)
- **C09** — [First-party integration/performance/demand contract](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/docs/integrations-traffic-analytics.md)
- **C10** — [Site Health evidence owner](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/docs/site-health.md)
- **C11** — [Earned-source inspection and presence owner](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/docs/earned-sources.md)
- **C12** — [Prompts and Visibility contract](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/docs/visibility-prompt.md)
- **C13** — [Onboarding and reviewed company facts](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/docs/onboarding.md)
- **C14** — [Backend dependency declaration](https://github.com/Cube-27/Citeladder/blob/3da7ad38e163e21e7e461f7ea542219a73175df5/backend/pyproject.toml)
- **P01** — [Search Intelligence PR #117, open at inspection](https://github.com/Cube-27/Citeladder/pull/117)
- **P02** — [PR Search Intelligence API](https://github.com/Cube-27/Citeladder/blob/fe777180dfdc034d6a20eeed1336c2a35fecb9ab/backend/app/api/search_intelligence.py)
- **P03** — [PR Search Intelligence dataset/response contracts](https://github.com/Cube-27/Citeladder/blob/fe777180dfdc034d6a20eeed1336c2a35fecb9ab/backend/app/domain/demand/search_intelligence/schemas.py)
- **O01** — [OpenSEO MCP guide](https://openseo.so/docs/mcp)
- **O02** — [OpenSEO project setup](https://github.com/every-app/open-seo/blob/main/.agents/skills/seo-project-setup/SKILL.md)
- **O03** — [OpenSEO keyword clustering](https://github.com/every-app/open-seo/blob/main/.agents/skills/keyword-clustering/SKILL.md)
- **O04** — [OpenSEO competitive landscape](https://github.com/every-app/open-seo/blob/main/.agents/skills/competitive-landscape/SKILL.md)
- **O05** — [OpenSEO named competitor analysis](https://github.com/every-app/open-seo/blob/main/.agents/skills/competitor-analysis/SKILL.md)
- **O06** — [OpenSEO link prospecting](https://github.com/every-app/open-seo/blob/main/.agents/skills/link-prospecting/SKILL.md)
- **O07** — [OpenSEO report skill](https://github.com/every-app/open-seo/blob/main/.agents/skills/seo-report/SKILL.md)
- **O08** — [OpenSEO isolated skill-evaluation workflow](https://github.com/every-app/open-seo/blob/main/.agents/skills/evaluate-skill/SKILL.md)
- **W01** — [OpenAI retrieval-server search/fetch and citation contract](https://developers.openai.com/api/docs/mcp)
- **W02** — [MCP authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- **W03** — [MCP 2026-07-28 release and lifecycle changes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- **W04** — [MCP tools and structured result schemas](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- **W05** — [Official Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- **W07** — [Official Claude Code MCP setup](https://code.claude.com/docs/en/mcp)
