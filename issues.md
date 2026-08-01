Add validation/normalization for account.billing_country before using it in addon/topup intent resolution; return a controlled error when missing/invalid.

## Description
**Billing country used for pricing without validation/normalization**

- Description: `_purchase_country()` returns `account.billing_country` verbatim and is used to resolve add-on/top-up intents; if `billing_country` is unset or contains unexpected values, it can drive incorrect pricing/region selection and potentially bypass intended catalog constraints.
- PR Git Diff Pointer:
```diff
@@
 def _purchase_country(account: BillingAccount) -> str:
@@
-    return account.billing_country
+    return account.billing_country
```
- Evidence: `post_addon` and `post_topup` call `resolve_addon_intent(... country_code=_purchase_country(account) ...)` / `resolve_topup_intent(... country_code=_purchase_country(account) ...)` and there is no guard in these routes before intent resolution.
- How to Fix: Validate `billing_country` as ISO alpha-2 (and normalize uppercase) before using it for any purchase intent, and fail with a controlled 409/422 when missing/invalid.

## Location
File: c:\Projects\Searchify\backend\app\api\billing.py

Audit billing mutation routes for consistent idempotency/replay behavior; ensure retries return stable status codes and semantics across operations.

## Description
**Idempotent replay helper requires `response` but older call sites may still call `replay_intent` directly**

- Description: The branch introduces `_replayed_activation(..., response: Response)` and updates three routes, but any other commercial mutation route still calling `replay_intent` directly will now miss the status-code projection behavior and may return 200/202 inconsistently on retries.
- PR Git Diff Pointer:
```diff
@@
+async def _replayed_activation(
+    session: AsyncSession,
+    *,
+    account: BillingAccount,
+    operation: str,
+    catalog_key: str,
+    quantity: int,
+    credential_mode: str,
+    idempotency_key: str,
+    response: Response,
+) -> ActivationResponse | None:
@@
-        replayed = await replay_intent(
+        replayed = await _replayed_activation(
```
- Evidence: Only `post_subscription`, `post_addon`, and `post_topup` are updated in the diff shown; the module contains other mutations (`DELETE /billing/subscription`, `DELETE /billing/addons/{key}`) that currently `del idempotency_key` and don’t replay, so retry semantics differ across mutations.
- How to Fix: Standardize idempotency/replay semantics across all billing mutations (either require replay everywhere or explicitly document/encode which operations are naturally idempotent and return stable status codes).

## Location
File: c:\Projects\Searchify\backend\app\api\billing.py

Ensure idempotent replay restores any contract-relevant headers (or explicitly guarantee none are required) so retries are byte-equivalent beyond status code/body.

## Description
**Replay path sets status code but may omit headers needed by clients**

- Description: `_replayed_activation` sets `response.status_code` based on stored activation status, but does not restore any headers that might have been set on the original response (e.g., cache-control, location, or provider redirect hints), risking client-side retry behavior differences.
- PR Git Diff Pointer:
```diff
@@
     if replayed is None:
         return None
     response.status_code = _activation_status_code(replayed.response)
     return replayed.response
```
- Evidence: The helper only projects status code; there is no mechanism shown to persist/replay response headers alongside the stored response body.
- How to Fix: If headers are part of the contract, persist and replay them with the intent record; otherwise ensure the API contract guarantees headers are invariant/unused for these responses.

## Location
File: c:\Projects\Searchify\backend\app\api\billing.py

Check for tests/callers matching GA4 error message text; prefer structured error_code matching or keep message stable if required.

## Description
**GA4 error message string change may break tests or client-side matching**

- Description: The GA4 pagination error message was changed from a concatenated string to a single f-string; if any tests or client code match the exact message, this can cause brittle failures.
- PR Git Diff Pointer:
```diff
@@
         raise Ga4ApiError(
-            "GA4 property list exceeded "
-            f"{GA4_ACCOUNT_SUMMARIES_MAX_PAGES} pages",
+            f"GA4 property list exceeded {GA4_ACCOUNT_SUMMARIES_MAX_PAGES} pages",
             error_code=ERROR_PROVIDER_API,
         )
```
- Evidence: The exception message is part of the raised error; without a stable error code-only contract, string matching is a common pattern in tests.
- How to Fix: Ensure callers/tests rely on `error_code` (or a structured code) rather than message text, or keep message text stable if it’s part of an API surface.

## Location
File: c:\Projects\Searchify\backend\app\connectors\integrations\ga4.py

Consider moving complexity_baseline.json updates to a dedicated chore PR or CI-generated artifact to reduce merge conflicts and noise.

## Description
**Complexity baseline JSON updated; risk of frequent merge conflicts and stale metrics**

- Description: Updating `backend/scripts/complexity_baseline.json` in feature branches tends to create noisy diffs and merge conflicts, and can become stale if not regenerated consistently in CI.
- PR Git Diff Pointer:
```diff
diff --git a/backend/scripts/complexity_baseline.json b/backend/scripts/complexity_baseline.json
@@
-      "execute_intent": 5,
+      "execute_intent": 3,
```
- Evidence: The baseline file contains many function CC/LOC entries and is sensitive to unrelated refactors; this branch updates multiple entries.
- How to Fix: Regenerate/update complexity baselines only in a dedicated chore PR (or in CI artifacts) and keep feature PRs focused on functional changes unless the baseline is a required gate.

## Location
File: c:\Projects\Searchify\backend\scripts\complexity_baseline.json

Fix audits events endpoint to read SSE resume cursor from the standard Last-Event-ID header by adding Header(alias="Last-Event-ID").

## Description
**SSE resume header likely not parsed because `Header()` alias is missing**

- Description: `last_event_id` is declared as `Header()` without `alias="Last-Event-ID"`, so FastAPI will look for a `last-event-id` header (derived from the parameter name) rather than the SSE-standard `Last-Event-ID`, causing resume cursors to be silently ignored and potentially replaying more events than intended.
- PR Git Diff Pointer:
```diff
@@
 async def list_events_endpoint(
@@
-    last_event_id: Annotated[uuid.UUID | None, Header()] = None,
+    last_event_id: Annotated[uuid.UUID | None, Header()] = None,
 ) -> list[AuditEventResponse] | StreamingResponse:
```
- Evidence: The docstring explicitly states support for `Last-Event-ID` (“`Last-Event-ID` (the SSE resume cursor)”), but the parameter does not specify an alias, unlike other headers in this PR (e.g., `Header(alias="Idempotency-Key")`, `Header(alias="X-Razorpay-Signature")`).
- How to Fix: Change to `Header(alias="Last-Event-ID")` (and keep the type `uuid.UUID | None`) so the standard SSE header is honored.

## Location
File: c:\Projects\Searchify\backend\app\api\audits.py

Reintroduce strict ISO alpha-2 validation for the public /billing/catalog country query param before calling public_catalog.

## Description
**Public billing catalog removed country validation, enabling unexpected inputs into pricing/region logic**

- Description: `GET /billing/catalog` no longer validates that `country` is alphabetic and exactly 2 chars, but still forwards it into `public_catalog(country)`, which can lead to unexpected behavior or downstream injection-like issues if `public_catalog` uses the value in lookups/logging without strict normalization.
- PR Git Diff Pointer:
```diff
@@
 @router.get("/billing/catalog", response_model=BillingCatalogResponse)
 async def get_catalog(
-    country: Annotated[str | None, Query(min_length=2, max_length=2)] = None,
+    country: Annotated[str | None, Query(max_length=2)] = None,
 ) -> BillingCatalogResponse:
-    if country is not None and not country.isalpha():
-        raise HTTPException(status_code=422, detail="Invalid country")
-    return catalog(country)
+    return public_catalog(country)
```
- Evidence: The previous implementation enforced `min_length=2` and `isalpha()`; the new one allows `""`, `"1"`, or non-alpha 2-char strings and relies entirely on `public_catalog` to handle it, but the PR text frames this endpoint as “public preview catalog (no auth)”, increasing exposure.
- How to Fix: Restore strict ISO-3166 alpha-2 validation at the API boundary (min_length=2, max_length=2, `isalpha()` + uppercase normalization) before calling `public_catalog`.

## Location
File: c:\Projects\Searchify\backend\app\api\billing.py

Replace PEP695 generic function syntax in projects/prompts API modules with TypeVar-based typing to maintain compatibility with the repo's Python runtime.

## Description
**New generic function syntax `def f[T]` will crash on Python < 3.12**

- Description: `_map_occupancy[T]` and `_map_prompt_mutation[T]` use PEP 695 type parameter syntax, which is only valid in Python 3.12+; on earlier runtimes the module will fail to import, breaking the API.
- PR Git Diff Pointer:
```diff
@@
-async def _map_occupancy[T](call: Callable[[], Awaitable[T]]) -> T:
+async def _map_occupancy[T](call: Callable[[], Awaitable[T]]) -> T:
@@
-async def _map_prompt_mutation[T](call: Callable[[], Awaitable[T]]) -> T:
+async def _map_prompt_mutation[T](call: Callable[[], Awaitable[T]]) -> T:
```
- Evidence: These functions are in `backend/app/api/projects.py` and `backend/app/api/prompts.py`, which are imported by FastAPI at startup; a syntax error prevents the app from starting.
- How to Fix: Replace with `TypeVar`-based generics (`T = TypeVar('T')`) and standard annotations compatible with the project’s Python version.

## Location
File: c:\Projects\Searchify\backend\app\api\projects.py

Verify whether site health entitlement view performs writes; if so, restore commit or refactor seeding to an explicit write path to avoid inconsistent entitlement state.

## Description
**Removing `session.commit()` may stop persisting the “fail-closed Free seed” entitlement state**

- Description: `get_entitlements_endpoint` no longer commits after `service.get_entitlement_view`, but the removed comment indicates the call previously relied on committing to persist a seed row; without it, subsequent reads may repeatedly reseed or return inconsistent entitlement projections.
- PR Git Diff Pointer:
```diff
@@
 async def get_entitlements_endpoint(
@@
-    view = await service.get_entitlement_view(session, workspace_id=ctx.workspace_id)
-    await session.commit()  # persist the fail-closed Free seed on first use
-    return EntitlementResponse.model_validate(view)
+    view = await service.get_entitlement_view(session, workspace_id=ctx.workspace_id)
+    return SiteHealthEntitlementResponse.model_validate(view)
```
- Evidence: The deleted line explicitly states it persisted a “fail-closed Free seed on first use”, implying `get_entitlement_view` may write; removing the commit changes behavior from write-through to read-only.
- How to Fix: Ensure `get_entitlement_view` is truly read-only, or reintroduce a commit (or move seeding into an explicit write endpoint/transaction) so first-use seeding is persisted deterministically.

## Location
File: c:\Projects\Searchify\backend\app\api\site_health.py

Align normalized usage key naming for search count across parsers and scoring; consider emitting both search_requests and legacy web_search_requests during migration.

## Description
**Normalized usage serializes `search_requests` but scoring aggregation reads `web_search_requests`**

- Description: `normalized_usage_dict()` emits `"search_requests"`, but `parse_anthropic_message` and `parse_interaction` previously used/expect `"web_search_requests"`, and `_aggregate_token_usage` in scoring does not include either key; this mismatch risks losing search counts in persisted artifacts and downstream reporting.
- PR Git Diff Pointer:
```diff
@@
 def normalized_usage_dict(usage: NormalizedUsage) -> dict[str, int | None]:
@@
-        "search_requests": usage.web_search_requests,
+        "search_requests": usage.web_search_requests,
```
- Evidence: In `anthropic_parser.py`, the normalized usage is now persisted via `normalized_usage_dict(usage)` and `search_used=bool(usage.web_search_requests)`, but the dict key is `search_requests` while older code/comments refer to `web_search_requests`, increasing the chance other readers still look for the old key.
- How to Fix: Either emit both keys (`search_requests` and legacy `web_search_requests`) during migration, or update all downstream readers to use the new canonical key consistently.

## Location
File: c:\Projects\Searchify\backend\app\connectors\answer_engines\normalization.py

Harden provider_cost_microusd parsing to avoid truncation/zeroing on non-int representations; consider Decimal parsing and validation.

## Description
**Provider cost parsing truncates floats/strings and may undercount costs**

- Description: `_reported_cost_usd` casts `provider_cost_microusd` to `int`, so a string/float micro-USD value (or a decimal string) will be truncated or rejected, potentially undercounting provider-reported costs.
- PR Git Diff Pointer:
```diff
@@
 def _reported_cost_usd(usage: dict[str, Any]) -> float:
@@
     if usage.get("provider_cost_microusd") is not None:
         try:
-            return int(usage["provider_cost_microusd"]) / MICRO_USD_PER_USD
+            return int(usage["provider_cost_microusd"]) / MICRO_USD_PER_USD
         except (TypeError, ValueError):
             return 0.0
```
- Evidence: The new typed usage contract allows nullable fields and JSON serialization; if any provider returns micro-USD as a float or decimal string, `int()` truncates silently (e.g., `"123.4"` raises, returning 0.0).
- How to Fix: Accept `Decimal`/float-like strings safely (e.g., `Decimal` parsing) and only coerce to int when the value is integral; otherwise treat as invalid and log/flag rather than returning 0.0.

## Location
File: c:\Projects\Searchify\backend\app\analysis\scoring.py

Add a guard ensuring billing_country is set before addon/topup purchases (or derive it safely), returning a controlled HTTP error instead of relying on a non-null field.

## Description
**Add-on/top-up purchases assume `account.billing_country` is always set**

- Description: `_purchase_country` returns `account.billing_country` without null/empty handling, but the new design makes base subscription purchase the “single writer” of billing country; accounts without a prior base purchase may hit add-on/top-up flows and crash or misprice.
- PR Git Diff Pointer:
```diff
@@
 def _purchase_country(account: BillingAccount) -> str:
@@
-    return account.billing_country
+    return account.billing_country
```
- Evidence: `post_addon` and `post_topup` call `resolve_*_intent(... country_code=_purchase_country(account) ...)` and do not validate presence; the docstring states only base purchase writes the country, implying it can be unset for some accounts.
- How to Fix: Enforce a precondition (e.g., require base subscription / persisted country) with a clear 409/422, or default to a safe preview region only for catalog display (not purchases).

## Location
File: c:\Projects\Searchify\backend\app\api\billing.py

Reduce duplication of finish-reason fields between provider_metadata and AnswerEngineResponse to avoid drift; keep a single source of truth.

## Description
**Duplicate finish-reason fields in provider metadata increase drift risk**

- Description: Anthropic parser stores both `stop_reason` and `raw_finish_reason` in `provider_metadata`, while also setting `raw_finish_reason` on the response; this duplication increases the chance of inconsistent values and complicates downstream consumers.
- PR Git Diff Pointer:
```diff
@@
         provider_metadata={
@@
-            "stop_reason": payload.get("stop_reason"),
-            "raw_finish_reason": raw_finish_reason,
+            "stop_reason": payload.get("stop_reason"),
+            "raw_finish_reason": raw_finish_reason,
         },
@@
-        raw_finish_reason=raw_finish_reason,
+        raw_finish_reason=raw_finish_reason,
```
- Evidence: `AnswerEngineResponse` now has first-class `finish_reason` and `raw_finish_reason`, so duplicating the same concept inside `provider_metadata` is redundant and can diverge if later refactors change one path.
- How to Fix: Keep the raw token only on `AnswerEngineResponse.raw_finish_reason` (and optionally one provider-native key like `stop_reason`), and document a single source of truth for consumers.

## Location
File: c:\Projects\Searchify\backend\app\connectors\answer_engines\anthropic_parser.py

Check whether ModelProvenance import is needed at runtime; consider future annotations or TYPE_CHECKING guard to avoid unused import/lint issues.

## Description
**Potential unused imports in exports module after provenance additions**

- Description: `ModelProvenance` is imported in `backend/app/analysis/exports.py` but only used for typing in `_provenance_label`; if type checking is not enforced at runtime, this may be fine, but it can become an unused import depending on tooling and Python version.
- PR Git Diff Pointer:
```diff
@@
 from app.domain.audits.schemas import (
     ModelProvenance,
     execution_frozen_provenance,
     model_provenance_for,
 )
```
- Evidence: `_provenance_label(item: ModelProvenance)` uses it only as an annotation; if `from __future__ import annotations` is not enabled in this file, the import is required at runtime, otherwise it may be unused.
- How to Fix: Add `from __future__ import annotations` to the module (if consistent with repo) or keep the import but ensure lint config matches; alternatively use `typing.TYPE_CHECKING` guard.

## Location
File: c:\Projects\Searchify\backend\app\analysis\exports.py

