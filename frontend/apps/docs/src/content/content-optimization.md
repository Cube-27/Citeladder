---
title: 'Content optimization'
description: 'See the content angles AI answers cite competitor and publisher pages for, then improve the page that covers each one or plan a new page.'
group: 'Improve with Agent'
order: 215
updated: '2026-11-18'
---

Content optimization finds content you could improve or create. It starts from the pages AI answers cite: when answers to your tracked prompts cite competitor and publisher content pages on an angle, and no page of yours is cited for it, CiteLadder opens an Action.

These Actions are listed with all your other work on [Actions](/agent/actions/) (**Actions** in the sidebar), in the same priority order.

## Where the evidence comes from

After a visibility run or a Site Health crawl finishes, CiteLadder refreshes your content angles:

1. It collects the titles and addresses of competitor and publisher pages cited in successful answers to your tracked prompts, from your default market's visibility runs in the 30 days up to the newest one. These are the citations [Sources](/sources/) counts. Answers with no tracked prompt are not read. Your own pages, user-generated content, social networks, directories and marketplaces are left out.
2. It groups the pages by the topic of the prompt they were cited for, and a model gathers similar content pages into angles and names each one. Only content pages count: articles, guides, how-tos, comparisons, listicles, reviews and case studies. Product pages, category and collection listings, home pages, and search or tag pages are left out.
3. For each angle, a model picks at most one of your content pages from a shortlist of pages that share its wording, or none. Content pages are the pages your latest crawl classified as an article, guide, how-to, listicle, comparison, alternative, or case study or review.

The model only groups, names and picks. CiteLadder counts the citations, sites, competitors and prompts, and checks whether your matched page was cited, from the saved answers. An angle becomes work only when it is cited often enough across enough different sites.

Grouping and matching use no credits. If a refresh fails, the content gaps from the last successful refresh stay in Actions. When your newest visibility run is too old to use, content gaps are cleared until the next run.

## Two kinds of content work

- **Improve a page.** The angle matched one of your content pages, and that page is not cited for the angle's prompts. The Action is on your page, and its finding reads "Cited content angle your page does not win".
- **Create a page.** None of your content pages matched the angle. The Action is on a planned page named after the angle, and its finding reads "Cited content angle you have no page for".

An angle whose matched page is already cited for its prompts raises no Action. Without a Site Health crawl there are no content pages to match, so every content gap is a planned page; run a crawl before you plan new pages from these Actions.

Each page has one Action, which holds its content gaps. Its Site Health issues stay in **Issues**.

A later refresh can rename an angle and keep its Action. When a page you publish later matches an angle that had a planned page, the planned page's Action keeps its history, and the new page's Action links back to it.

In [Actions](/agent/actions/), a content-gap Action's summary names its findings in Content optimization. CiteLadder shows counts from the evidence; it gives no page a score or grade.

## Read why an Action matters

Open the Action from the Actions list. For each content gap, **Why this matters** shows:

- the angle's name;
- **Citations**, **Sites**, **Competitors** and **Prompts**, and the **Window** of visibility runs they come from;
- **Cited pages:** each page's title, linked to the page, with its site, its classification and its citation count. A competitor's site is named with the competitor. When more pages were cited, the most cited are listed with the total.
- **Prompts:** each prompt as it was worded at the last refresh, linked to the prompt. A prompt that had left your library by then reads "A prompt no longer in your library".
- **Continues the planned page for this angle**, when the page took over from a planned page's Action.

The **Diagnosis**, **Implementation** and linked chats follow, as on every Action. Other findings on the same page, such as internal links, are listed in the Diagnosis.

## Hand the work to the Agent

- **Write this page**, on a planned page, opens **New chat** with the Action and its content gap attached and **Skill: Article or guide** selected.
- **Work on this**, on an existing page, opens **New chat** with the Action and the page's URL attached and **Skill: Optimize a content page** selected.

Describe what you want and send. Work in the Agent uses AI credits like any chat, and the result is a draft for your review; see [Outputs and revisions](/agent/outputs/).

## Mark the work implemented

After you publish or update the page, use **Mark implemented** as on any Action; see [Declare implementation](/agent/actions/#declare-implementation). In the dialog, a content gap reads **Not measured automatically: no reading isolates this change.** Internal-link findings on the same page are checked by the next crawl that reads it.

## Read content gaps from MCP or the API

Content-gap Actions come with every other Action: an assistant connected with [MCP](/mcp/) reads them with `read_actions`, and the [REST API](/api/) lists them with `GET /v1/projects/{project_id}/actions`. Reading one Action returns each content-gap finding with its evidence.
