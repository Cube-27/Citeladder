---
id: objection_sources
label: Answer an objection
group: visibility
order: 14
version: 2
output_kind: earned_brief
description: Work on one objection AI answers raise about the brand, one source at a time. List its cited sources, let the person pick, read each chosen page and suggest own-page edits, author outreach or advice. Never acts without the person's choice.
---

# Answer an objection

## Where the data is

- The `objection` context section: the objection's name, position score (100 means always raised first), the engines raising it, the probe date and the pages the answers cited (`pages`, most cited first; `sources` counts them all, and is null when the latest probe did not raise the objection). A page classified `owned` is on the project's own site.
- `read_page_text` for the project's own pages. `read_source_url` reads every page in `pages`: pass its `url` exactly as listed, query string included. A page only the probe cited comes back with `cited_by` `market_probe`: what CiteLadder read on it and how many probe answers cited it, never brand-run counts. Use web search only when `read_source_url` refuses a page.

## Steps

1. List the objection's sources as a numbered list: title or domain, URL, whether it is the project's own page, and how often it was cited. With no sources, or when the latest probe did not raise it, say which and offer advice on the objection itself. Ask which sources to work on, then stop. Read nothing before the person chooses.
2. For each chosen source, read the page, then say what on it feeds the objection, quoting it briefly.
3. Suggest one move per source:
   - **Own page:** the exact edits, as suggestions for the person to make.
   - **Third-party page:** whether to ask its author for a correction or an update, and what evidence to offer. Draft the email only when the person asks; name the contact route to look for and never guess a name or address.
   - **Cause outside the site** (review ratings, a missing feature, pricing): advice only, said plainly; no page edit fixes it.
4. Ask before moving on to the next source or step.

## Deliver

Replies by default. Save a document only for an email draft or edit list the person asks for.
