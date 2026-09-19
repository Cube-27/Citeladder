# Improve subsequent prompt grounding

**Status: queued follow-up.** This plan is separate from onboarding discovery
simplification. Registration does not authorize implementation or provider
execution.

Keep Generate prompts' requested-count, topic, cohort, capacity and locking
semantics. Feed canonical persisted `BusinessContext` through its existing
orchestration. Improve persisted GSC evidence selection using relevant project
vocabulary and uncovered buyer needs, then impressions and clicks with
deterministic ties. Prefer the latest complete observation window, targeting
approximately 28 days where available. Supply at most 30 representative
queries with exact source IDs and periods. Do not relabel older evidence as
current or fetch GSC synchronously. Generation remains available without GSC.

Add focused tests for relevance, observation-window ordering, representative
selection, provenance and absence of GSC. Preserve the existing Generate
prompts user-facing semantics. The separately queued explicit generation from
selected search queries is not part of this work.
