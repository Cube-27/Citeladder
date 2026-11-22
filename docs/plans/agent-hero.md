# Agent as the app's hero

Status: **steps 1 to 5a assigned by the owner, 2026-11-22**, built and merged
through builders and reviewers. Step 5b onward is tested locally first and
merged only on the owner's go. The owner's decisions are in
[decisions](../decisions.md#agent-mcp-and-public-api) and
[B75](../billing-decisions.md#agent-charging); this plan holds the scope, the
order and what is still open.

## Goal

A person does their project's data and analysis work from the Agent chat, the
way they would in a Claude chat, without moving between screens. The Agent
reaches every project-data and analysis action the app's buttons reach; the
person approves each change on a card.

## Rules that change

Each PR that ships a change rewrites the passages it makes untrue, in the same
PR: [invariant 10](../invariants.md#10-automation-stays-bounded) and
[invariant 13](../invariants.md#13-the-agent-is-bounded-orchestration) (the
Agent gains proposed changes; nothing executes without the person's click),
[Agent](../agents.md) and [MCP](../mcp.md#changes).

Every PR of this plan puts its schema change in one migration,
`frontend/services/api/migrations/0002_agent_hero.sql`: the first to merge
creates it and later PRs append to it, since nothing deploys until the plan is
built, an exception to [invariant 17](../invariants.md#17-schema-changes-are-forward-migrations)
(owner, 2026-11-22).

What does not change: no change executes without a click by a member whose
live role allows it; no model call or paid run happens inside a preview; a
launched job is never awaited by a turn; no sub-agents, no server-continued
turns; billing, plan, members, API keys, credentials and settings are never
proposed. MCP offers a curated subset of the Agent's kinds through one
prepare tool and `confirm_change`, with no prompt delete
([decisions](../decisions.md#agent-mcp-and-public-api)).

## Steps

| Step | Scope | Merge |
|---|---|---|
| 1 | Model and effort picker: Haiku 5.5, Sonnet 5.5, Opus 5.5 at low, medium or high, per chat; price rows per model; picker shown disabled without the entitlement | assigned |
| 2 | Action harness: the Agent proposes a change, the dry run previews it, the card's click executes it once as the clicking member with a security event. First kinds are the ones MCP already has | assigned |
| 3 | The remaining project-data and analysis actions, deletes included, and file attachments the Agent converts into an import (prompts, brand facts, product catalog) | assigned |
| 4 | Inline views: the app's existing charts and tables placed in the thread from a stored selection, read on render, each with an Open in app link | assigned |
| 5a | Skill quality pass and simple skills for features that have none | assigned |
| 5b | Skills that act and cross-feature playbooks | local testing, then the owner's go |
| 6 | Integrations connected from the chat; curated outside connectors (Slack, Jira or Linear, Notion, Google Drive and Docs, WordPress), read and write behind a card | local testing, then the owner's go |
| 7 | Sign-in lands on the Agent | last, after testing |

## Open questions

- **Trial.** B61 keeps the Agent out of the trial, so the disabled picker shows
  beside the plan refusal; whether the trial should get the Agent is the
  owner's call.
- **Playbook harness** (step 5b): undecided, except that it is not sub-agents.
- **Generative UI**: the owner will discuss it after this plan.
- **Binary uploads** (XLSX, PDF, DOCX): step 3 takes text files (CSV, TSV,
  JSON, plain text); the rest needs a decision on parsing in the browser or
  provider-side file handling.
- **Outside connectors that publish** (step 6) change the Agent's "never
  publishes or mutates externally" rule; the scope of each connector's writes
  is decided when step 6 is planned.
