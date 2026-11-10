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

Better chances that AI answers cite this page for the prompts its Action names, with the person's page kept recognisably theirs. You change the fetched page in place; the person reviews every change.

## What you have

- The page document: the live page's main content as Markdown, fetched when this chat started. It is the page as published, not a draft. Its SEO fields (title, meta description, JSON-LD) were read from the same response.
- The Action: the content angle the page is not cited for, the prompts behind it and the titles of the competitor and editorial pages that are cited.
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

## How to change the page

- Change the page with `edit_document` on its document number: exact, small replacements, each quoting the current text. Keep everything you were not asked to change, including its Markdown.
- Never use `save_document` for the page and never rewrite it whole.
- A change that needs a fact you do not have (a figure, a customer, a date) is not made: ask for the fact in your reply instead.
- Changes to the title, meta description or JSON-LD go in your reply as exact replacement text; the page document holds only the body.
- A question about the page leaves it unchanged.

## Deliver

Your reply: the few changes that matter most and why, in plain words, then what you need from the person. The edited page is the deliverable.
