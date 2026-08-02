# Design-system hardening audit

The product surface now follows the strict ADS borderless-elevation decision: an in-flow
panel with card anatomy uses `bg-panel` + `shadow-card` and no outer hairline, including
tables and settings-style panels. Internal table rules and form-field borders remain
structural.

The audit also standardised page rhythm at 24px by default (16px only for explicitly dense
table pages), unified stat strips at `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`, removed shared
UI dependencies on marketing tokens, replaced literal white/black and numeric size escapes,
named the overlay/modal/toast z-index stack, and moved Card/Tabs/Segmented recipes to CVA
variant owners.

These decisions stand because they are now machine-enforced by `pnpm check:policy`; the
guardrail inventory and pinned counts live in `docs/design.md` §15.
