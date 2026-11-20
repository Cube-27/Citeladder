---
name: run-agents
description: CiteLadder's settings and rules for running agents with the orchestrate skill - run folder, orch.json, which role takes which task, the shared local database, production steps and how a run ends. Use together with orchestrate whenever the owner asks for agents in this repo, including a new session picking up work.
---

# Running agents on CiteLadder

The procedure, roles and scripts are the user-level `orchestrate` skill's (`~/.claude/skills/orchestrate`,
roles in `~/.claude/agents`). This skill holds only what is specific to this repo.

## Picking up

A new session starts from GitHub and the code, not from notes: `gh pr list --repo Cube-27/Citeladder`
(open PRs and their checks), `tmux ls` and its windows (agents still running), `git worktree list`
(worktrees in `~/projects/citeladder-worktrees`), `docs/plans/ACTIVE.md` and the backlog. A run's scratch
folder, if one still exists, is `~/citeladder-runs/<run>/` (`state.md`, `markers.log`).

## Setup

`~/citeladder-runs/<run>/orch.json`:

```json
{"repo": "/home/abhineet/projects/Citeladder", "gh": "Cube-27/Citeladder", "worktrees": "/home/abhineet/projects/citeladder-worktrees", "session": "0", "branchPrefix": "agent/", "lockfile": "frontend/pnpm-lock.yaml"}
```

GitHub: plain git as the logged-in account, no `GH_TOKEN`, every `gh` call with `--repo Cube-27/Citeladder`.

## Which role

- **designer** for any task with frontend design: a new or changed screen, a mockup to build, a design
  review of a UI PR, a design round (`design-climb`). A mixed API and UI task can split: builder for the
  API PR, designer for the UI PR.
- **builder** for everything else that changes code; **reviewer** after `PR OPEN` (XL, migrations,
  billing, auth, concurrency); **reviewer + simplifier** report-only for a feature-wide review;
  **explorer** before planning when the answer needs a wide search.

## Rules for every run here

- **Shared local database.** One Postgres serves every worktree (`validate-change`'s shared-database
  rule). Schema changes go in through CI's fresh database; an agent never resets or re-creates the shared
  one. While the owner keeps a single baseline (`docs/decisions.md`), schema changes edit
  `0001_baseline.sql`.
- **Production is the owner's.** Resets, deploys, provisioning (`local-env`, "Production accounts") and
  any prod database session: the agent reports the exact command and the owner runs it.
- **Owner words.** Each task quotes the owner verbatim and lists every ask; reference images are copied into
  the run folder and their paths given.

## Ending a run

Before deleting `~/citeladder-runs/<run>/`: owner decisions are in `docs/decisions.md` or `docs/design.md`
(`record-owner-decision`), lessons in `docs/engineering-guidelines.md` or a skill, follow-ups in
`docs/plans/backlog.md`, and every worktree, branch and window of the run is gone.
