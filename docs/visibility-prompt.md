# Prompts and AI Visibility

## Responsibility

This owner connects reviewed business context to a versioned prompt portfolio,
explicit measurement admission and persisted answer-engine results.
AI Visibility measures observed mention/citation share under comparable audit
conditions. It does not measure causal impact or turn Search Console impressions
into AI prompt volume. [Onboarding](onboarding.md) owns company discovery and
confirmation; [Commerce](commerce-intelligence.md) owns typed buyer targets.

## Context, topics and generation

The [prompt API](../backend/app/api/prompts.py) and
[generation service](../backend/app/domain/prompts/generation.py) authorize the
workspace/project, validate topic/cohort selection and capacity, gather confirmed
brand context and optional observed demand, call the configured model, then
recheck ownership and insert conflict-safely. Generation does not start an audit.

Onboarding topic selection runs after confirmation in its completion worker.
Existing-project generation uses existing topics; when a completed project has
none, it can recover starting topics from confirmed products/services before
generation. Missing confirmed offerings fail before provider I/O.

Offering harvest collects bounded evidence of things a customer buys, hires,
books or enrolls in. Topics select/merge/name these offerings rather than restate
the provider's category. Empty harvest is explicit; unsupported topics are not
invented. Topic evidence references must exist, names must be bounded and
brand-neutral, and admitted topics receive canonical UUIDs.

Topic distinctness uses singular-normalized token identity, not character
similarity: men's and women's departments must not merge because their spellings
are close. The provider-restatement rule rejects a name only when every token
is provider vocabulary; containment would incorrectly reject School Uniforms.
Category-restatement filtering is soft when it would remove all supported
topics. Configuration and [onboarding topic admission](../backend/app/domain/projects/onboarding/topic_admission.py)
own these decisions, not a copied vocabulary list in documentation.

Generation assigns canonical topics and short slot IDs, requested count and
cohort. The model chooses natural commercial wording and labels buyer stage and
prompt intent; code resolves legacy intent. Technical admission checks known
slots, topic ownership, allowed labels, cohort identity, normalized exact
duplicates and the shared length bound. Core queries cannot name the tracked
brand, aliases or supplied competitors; diagnostics name the brand and
comparisons also name an accepted competitor.

Commercial relevance and distinct needs are model guidance and human review
criteria, not lexical scores. There are no word-count windows, opening quotas,
fuzzy-similarity quality judges or automatic rewrite loops. Batching, bounded
technical retries and partial-result behavior remain. Concurrent sibling
batches do not coordinate their accepted text; final admission handles exact
duplicates.

Onboarding retains its configured topic-round-robin organic selection and
diagnostic/comparison cohorts. Saving/activation retains explicit user-action
boundaries. Generation evidence freezes buyer-query policy, generator, slot,
context/source and actual provider/model provenance; historical prompts are not
rewritten by a newer generator.

## Audit admission and execution

The [audit API](../backend/app/api/audits.py),
[creation owner](../backend/app/domain/audits/creation.py) and
[schedule owner](../backend/app/domain/audits/schedule_service.py) use the shared
admission path. Users select logical engines and repetitions, not transport
measurement modes. Every brand/Commerce/manual/scheduled/repaired audit uses
the approved citation-capable policy.

Admission freezes prompt text/cohorts, roster, model/retrieval identity, request
configuration and relevant versions. benchmark_mode is prompt framing, not a
provider policy. Funding/occupancy is checked by
[billing and entitlements](billing-entitlements.md). A provider-free estimate
does not authorize execution or establish measured cost.

The [audit worker](../backend/app/workers/audit_worker.py) claims PostgreSQL
tasks with leases, commits before I/O and records immutable response artifacts,
attempts and citation evidence. Cancellation, retries and reconciliation use
the existing audit/task state owners; failed answers remain failures, not
negative brand observations. Provider costs and successful-answer billing are
different projections.

## Measurement and comparisons

[Analysis](../backend/app/domain/analysis/) derives versioned persisted metrics,
source and prompt outcomes from the selected evidence.
[Visibility](../backend/app/domain/analysis/visibility.py) projects brand and
competitor rankings. Mention, citation, recommendation identity, citation URL and
rank remain distinct observations. Unsupported entity assessments are
unavailable, not absent. Source-pattern and Opportunity mapping stay in
[Opportunities](opportunities.md).

Rates use their specified eligible evidence denominators. Pagination cannot
change totals, and the browser does not recompute aggregate share of voice.
Frozen model/retrieval, prompt/cohort and scope identity determine comparison
eligibility. Changed measurement conditions cannot become unqualified movement.
Unknown, not-run, failed, partial and observed-zero states remain distinct.

## Read and UI surface

Visibility has Trends, Mentions & Citations and Query Fanout; Trends is default.
Typed URL state retains run/period, engine, cohort, baseline, history, metric and
evidence filters. The server resolves Latest to a concrete run or compatible
run set, reused by dependent requests. An invalid explicit run never falls back
to Latest; historical windows remain separate from selected measurement.

Mentions & Citations has Sources and Answers modes. Source/fanout totals are
server aggregates over the full selection; answer cursors bind filters and the
snapshot boundary. Original answers use /runs/{runId}?execution={taskId}.
Browser history restores the analytical context. Competitor suggestions remain
in Overview Facts rather than becoming measurement evidence automatically.

The [pending integrations work](plans/citeladder-integrations-audit-followups.md)
covers richer observed-state/action links and selected-search-query generation.
Existing observed-query context does not mean that selection/provenance UX is
complete. Historical evaluation numbers are retained in
[the archived generation document](archive/evaluations/visibility-prompt-history.md);
they are not current acceptance or a model recommendation.
