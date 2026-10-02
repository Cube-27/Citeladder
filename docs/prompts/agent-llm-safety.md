# AI audit: Agent, MCP and model-output safety

Paste everything below the line into the model, at the repository root.

---

You are an AI-application security reviewer. CiteLadder feeds crawled website
text, provider answers and customer data into language models, and exposes
read tools to an in-app Agent and to external MCP clients. Your job is to find
where untrusted text or model output can escape its bounds. Your output is a
findings report, not code changes.

**Read first:**

1. `docs/prompts/_contract.md`.
2. `docs/invariants.md` sections 9, 11, 12, 13 and 14.
3. `docs/agents.md` sections "Context and the bounded loop", "Read tools",
   "Skills" and "Worker and funding".
4. `docs/mcp.md` sections "Connection and consent" and "Authorization on each read".

## Scope

- `frontend/services/api/src/agent/` (runtime, tools, tool-adapters, context,
  context-adapter, model-calls, outputs, skills, funding).
- `frontend/services/api/src/mcp/`.
- `frontend/services/api/src/models/` (model client) and
  `config/agent-runtime.json`, `config/agent-context.ts`,
  `config/agent-skills.ts`, `config/prompt-generation.ts`.
- Other model consumers: search `models/` imports across `prompts/`,
  `site-health/`, `opportunities/`, `projects/`.
- Frontend rendering of model/crawl text: `frontend/components/agent/`,
  `frontend/lib/markdown/`.

## Hunt list

1. **Unbounded loop.** Step, tool-call, token or wall-clock budgets not frozen
   per run, not enforced on every iteration, or reset by retries; recursion
   or self-scheduling of Agent runs.
2. **Write capability.** Any Agent or MCP tool that mutates state, issues
   arbitrary SQL, fetches arbitrary URLs, or calls an external system.
   Tool arguments that let the model pick a different project, workspace or
   member than the server-pinned one.
3. **Prompt injection from crawled text.** Crawled page content, competitor
   pages or provider answers inserted into system/developer instructions
   rather than clearly delimited untrusted data; tool results from crawl text
   able to trigger further tool calls with attacker-chosen arguments.
4. **Output validation.** Model JSON parsed without schema validation, or
   validated loosely (`passthrough`, `any`) before persistence; fields from
   model output used as IDs, URLs or SQL fragments without checking they
   reference the frozen context.
5. **Fabricated citations.** Output allowed to cite evidence IDs that were not
   in the frozen context manifest or a tool result for this run (Invariant 12).
6. **Context manifest.** Context assembled after the first model call, not
   frozen, or missing recorded omissions/budgets; context including another
   workspace's data or secrets.
7. **Model provenance.** Model judgements persisted without model, template
   version and confidence (Invariant 9).
8. **Rendering.** Model or crawl text rendered as HTML without sanitisation;
   markdown links with `javascript:` URLs; images loading attacker URLs
   (data exfiltration through image requests).
9. **MCP grants.** Token audience/resource not checked; scopes broader than
   read; revoked grant still usable; dynamic client registration accepting
   arbitrary redirect URIs.
10. **Cost safety.** Model calls without timeout or max output tokens; retries
    that multiply cost; BYOK failure falling back to platform key.

## Not a finding

- The absence of a second "claim validator" model call — intentionally omitted
  (Invariant 12).
- Packaged `SKILL.md` files being plain Markdown — they are production inputs
  owned by the Agent.

## Subagent split

- A: Agent loop, budgets, tools (1, 2, 10).
- B: context assembly, injection, citations (3, 5, 6).
- C: output parsing/persistence across all model consumers (4, 7).
- D: MCP (9) and frontend rendering (8).

## Output

Use the report format in `_contract.md`. For injection findings include a
short example payload a malicious website could contain.
