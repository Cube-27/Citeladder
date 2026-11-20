---
name: design-climb
description: Run a CiteLadder design round - blind rubric review of the seeded app by a fresh designer, a design plan, the owner gate with mockups, then builders - until the rubric's stop rule is met. Use when the owner asks for a design climb, a design round or a rubric review of the app.
---

# Design climb

The round's process, rubric and design rules are the `design-head` skill's ("Running a round",
`references/rubric.md`); the owner invokes that skill, and the designer reads its files. This skill adds
CiteLadder's mechanics. Agents run through the `orchestrate` skill (tmux mode); the run folder is scratch
and is deleted when the round closes.

## A round

1. **Serve main** with seeded data (`local-env` skill).
2. **Blind review.** `node frontend/services/api/local/env/make-review.mjs <run>/review <empty|seeded>`
   from the main checkout writes the review folder and its `task.md`. Launch a fresh designer on it:
   `launch.mjs review designer <run>/review/task.md --cwd <run>/review -- --add-dir <run>/review --mcp-config <run>/review/playwright-mcp.json`.
   The owner decides whether a second, empty-data review is needed.
3. **Plan.** Launch a designer (report-only, `--cwd <run>`) with the review, the owner's notes for the round
   verbatim, and `docs/design.md` (the owner's design decisions). It writes the plan: one ruling per
   finding, workstreams in waves (tokens and shared components first), and the specs per workstream
   (`design-head` `references/builder-spec.md`), plus "Skill updates" for `design-head`.
4. **Owner gate.** Show scores, plan and open questions; each question has a recommended option, one
   alternative and "none". A visible change needs a before/after HTML mockup from the real tokens; motion
   fixes don't. Record answers in `docs/design.md` (`record-owner-decision`); apply "Skill updates" to
   `design-head` in `~/projects/home`.
5. **Build.** One designer (UI-heavy) or builder per workstream, its spec as the task; FIFO merge queue.
6. **Close.** Main green, agents and servers stopped, worktrees removed, the run folder deleted.

## Blind review method

The designer reads only its review folder (`env.md`, `route-urls.txt`) and the rubric, plus the app's code
read-only to locate causes. It runs no git and reads no docs, plans, memory or earlier reviews.

1. Bulk work goes in scripts written to `./scripts/` and run with one `node` call: one Playwright script
   loops every route × theme × viewport × state the rubric requires, saves `./shots/<route>--<theme>--<width>[--state].png`
   and writes the rubric's measurements to `./measurements.json`.
2. Rating fans out at most 4 Sonnet subagents, one per route group, each with the rubric's visual checks,
   its screenshots and its measurements; the designer confirms each finding on the screenshots and owns
   the scores.
3. Outputs: `./review.md` in the rubric's format and `./scores.json`
   (`{"categories": {...}, "mean": <2 dp>, "min": <lowest>, "holistic": <score>}`).
