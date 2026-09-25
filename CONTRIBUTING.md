# Contributing to CiteLadder

[AGENTS.md](AGENTS.md) owns the implementation workflow, test admission and
validation policy for contributors and coding agents.
[The documentation index](docs/README.md) routes to the smallest applicable
feature owner and [invariants](docs/invariants.md). Read the affected contracts,
not every document. Archived plans are history, not implementation instructions.

## Preparing a change

Create a scoped branch such as `feat/<description>`, `fix/<description>`,
`docs/<description>` or `refactor/<description>`. Inspect the existing owner and
its callers before proposing another abstraction. Extend that owner and apply
[the replacement gate](docs/invariants.md#replacement-and-retirement) when
superseding behavior. Stage explicit paths rather than `git add -A` when other
work exists in the tree.

[Backend architecture](docs/backend-architecture.md) and
[frontend architecture](docs/frontend-architecture.md) own layering and contracts.
Backend schemas are the wire-contract source; update affected frontend schemas,
API functions, query keys, fixtures and UI states together. Browser API calls use
same-origin `/api/v1`; proxy/runtime details belong to the frontend owner, not a
second framework-specific recipe here.

Use [Development](docs/DEVELOPMENT.md) for setup and command examples. Its command
catalog is not a checklist to execute after every edit. Follow
[the documentation maintenance rules](docs/README.md#maintaining-documentation)
when a contract or procedure changes; repair links when retiring a document.

## Configuration and industry knowledge

Tunable policy belongs to the config owners described in
[the configuration invariant](docs/invariants.md#2-product-policy-is-configuration).
The shared industry registry is reviewed product data; project/customer evidence
never mutates it. A generalized change requires its registry version, any needed
migration note, validation and labelled evaluation coverage. Do not create
industry-specific tables or service branches when the shared core/profile can
represent the concept.

For industry-profile work, retain registry validation, onboarding fallback,
labelled classification/gap and FAQ fixture coverage, and before/after verification.
Use the current owner and version policy; this is not permission to create another
registry or migration history.

## Evidence and migrations

[Invariants](docs/invariants.md) own immutability, provenance, unknown states,
authorization, bounded generation and approval boundaries. The [Agent](docs/agents.md)
returns reviewable deliverables, not automatically validated facts or published content.
Raw chat and generated bodies are not approved memory; promotion requires its
explicit, audited transition. Grounding instructions do not certify factual
correctness; the Agent owner defines the review boundary.

The [single-baseline migration policy](docs/invariants.md#17-the-migration-baseline-remains-singular)
remains in force. Follow [the migration procedure](docs/DEVELOPMENT.md#migrations-single-greenfield-baseline)
only against explicitly authorized disposable data. Never downgrade or reset a
shared, staging or production database.

## Pull requests and verification

Use conventional, scoped commit messages. Include a concise change summary,
removals or intentional coexistence, and a `## Testing` section with exact
commands, exit results, checks not run and unresolved limitations.
[AGENTS.md](AGENTS.md#validation) defines when validation is required;
[Review.md](Review.md) defines the review procedure. A file edit alone does not
justify a new test, and a passing happy path does not excuse an invariant violation.
Live sites, provider APIs and connected analytics remain explicitly authorized
acceptance sources, not ordinary CI prerequisites.

## Release preparation

Releases are maintainer-owned and occur only after merge. Do not create a tag,
GitHub release or package publication from a feature branch. Follow
[release acceptance](docs/release-checklist.md), update [CHANGELOG.md](CHANGELOG.md),
and obtain release-owner approval for the exact candidate commit before creating
release artifacts.

## Reporting issues

Include reproduction steps, expected/actual behavior, versions and safe logs or
screenshots. Disclose secret-handling and other security issues privately.
Contributions are licensed under the [MIT License](LICENSE).
