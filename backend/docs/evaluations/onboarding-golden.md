# Onboarding golden evaluation

The golden corpus is the repeatable acceptance check for location-aware
onboarding research: the resolved business context and the suggested
competitors. It is isolated from production onboarding; its known-brand
competitor sets are a test oracle, never facts to insert into a customer
workspace.

Onboarding generates no prompts, so the corpus carries no prompt expectations
and nothing here scores prompts. Prompt quality is evaluated with the Generate
prompts path under the [prompt generation plan](../../../docs/plans/citeladder-prompt-generation-v2.md).

- [`evaluations/onboarding_cases.py`](../../evaluations/onboarding_cases.py)
  assembles the commerce and service cases.
- [`evaluations/onboarding_golden.py`](../../evaluations/onboarding_golden.py)
  provides `evaluate_context` (category, business model, market scope, buyer type
  and jobs-to-be-done coverage) and `evaluate_competitors` (identity-aware
  precision and recall).

Run the offline checks from `backend/`:

```powershell
uv run pytest tests/unit/test_onboarding_golden_eval.py -q
```

The live scorecard makes real site requests and model calls, so it is an opt-in
developer tool and never runs in CI:

```powershell
uv run python -m scripts.run_onboarding_eval --case feedonomics-united-states
uv run python -m scripts.run_onboarding_eval --baseline --out .git/onboarding-eval.json
```
