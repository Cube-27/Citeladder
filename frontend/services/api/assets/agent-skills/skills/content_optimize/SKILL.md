---
id: content_optimize
label: Optimize a content page
group: content
order: 13
version: 1
output_kind: page
description: Improve one of the project's live content pages so AI answers can cite it, editing the fetched page in place. Use when a chat holds a fetched page document; it never writes a new page.
---

# Optimize a content page

## Goal

Better chances that AI answers cite this page for the prompts its Action names, with the person's page kept recognisably theirs. You propose changes to the fetched page; the person reviews and applies each one.

## What you have

- The page document: the live page's main content as Markdown, fetched when this chat started. It is the page as published, not a draft. Its SEO fields (title, meta description, JSON-LD) were read from the same response.
- The page's suggestion list: each suggestion already made on it, with its id and status (open, applied, dismissed or stale).
- The Action: the content angle the page is not cited for, the prompts behind it and the titles of the competitor and editorial pages that are cited.
- Sometimes `target_prompts`: the topic and the prompts the person chose for this page. When it is present, aim your suggestions at those prompts first.
- Site Health findings on the page: the crawl's, and the page-local checks re-run on the fetched page (`fetched_page`). A finding that needs the whole crawl (robots, rendering, sitemaps, links, duplicates) stays as of the crawl.
- The business facts the person reviewed, and anything they tell you in this chat.

## What good looks like

These are options grounded in what tends to get cited, never a grade of the page.

- Answer first: each section opens with the direct answer to the question it covers, in one or two sentences.
- Question-style headings where the reader has a question, each followed by its answer.
- Self-contained passages: a section start never leans on "this" or "it" from the section before.
- Lists or tables for steps and comparisons; break walls of text.
- Specific facts instead of vague claims, each from the page, the business facts or the person; time-sensitive facts carry their date.
- Cover what the cited pages cover for the angle's prompts when it fits this page's purpose; never copy their wording.
- Title, H1 and meta description agree with each other and with the page.
- Structured data only for what the page visibly says.
- Do not re-judge a Site Health finding; explain it and say how to fix it.

## How to propose changes

- Propose changes with `suggest_edits`; the person applies or dismisses each one beside the page. Each suggestion is small and exact: `old_string` quotes text from the current page body once, with its Markdown, and `new_string` is its replacement. Keep everything around it.
- For the title, meta description or JSON-LD, name the `field` instead of `old_string`; `new_string` is the whole new value.
- Give each one a `category`, the `rule_id` of the rule it applies, and a `rationale` of one or two plain sentences. Phrase recommendations and heuristics as options.
- A change that needs a fact you do not have (a figure, a customer, a date, a source) has no `new_string`: ask for the fact in `needs_input`. Never fill it in yourself. When the person answers, suggest the ready change and name the earlier one in `replaces`.
- When a judgement reads more than the quoted text, say so in `depends_on`: its `section`, the whole `body`, or a field such as `title` for title/H1/meta consistency. A later change there makes the suggestion stale.
- A Site Health finding the page's suggestion list already holds (a missing title or meta description) is written by suggesting that field with the same `rule_id`; it replaces the finding's advice.
- Suggestions alternative to each other may overlap; the person chooses one. Do not repeat one that is already open.
- Change the page directly with `edit_document` only when the person asks you to make the change yourself. Never use `save_document` for the page and never rewrite it whole.
- A question about the page leaves it unchanged.

## Deliver

Your reply: the few suggestions that matter most and why, in plain words, then what you need from the person. The suggestions are the deliverable; do not list each one again.
