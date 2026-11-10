---
title: 'Content optimization'
description: 'See the content angles AI answers cite competitor and publisher pages for, then improve the page that covers each one or plan a new page.'
group: 'Improve with Agent'
order: 215
updated: '2026-11-10'
---

Content optimization lists the work on your content pages and on the pages you could create. It starts from the pages AI answers cite: when answers to your tracked prompts cite competitor and publisher pages on an angle, and no page of yours is cited for it, CiteLadder opens an Action.

Open **Content** in the sidebar, directly below **Actions**, in Agent mode or in the Dashboard's **Act** group. The count beside it is the screen's open and in-progress work. Content optimization and [Actions](/agent/actions/) never list the same Action.

## Where the evidence comes from

After a visibility run or a Site Health crawl finishes, CiteLadder refreshes your content angles:

1. It collects the titles of competitor and publisher pages cited in successful answers to your tracked prompts, from your default market's visibility runs in the 30 days up to the newest one. These are the citations [AI Visibility](/visibility/) counts. Your own pages, user-generated content, social networks, directories and marketplaces are left out.
2. It groups the titles by the topic of the prompt they were cited for, and a model gathers similar titles into angles and names each one.
3. For each angle, a model picks at most one of your content pages from a shortlist of pages that share its wording, or none. Content pages are the pages your latest crawl classified as an article, guide, how-to, listicle, comparison, alternative, or case study or review.

The model only groups, names and picks. CiteLadder counts the citations, sites, competitors and prompts, and checks whether your matched page was cited, from the saved answers. An angle becomes work only when it is cited often enough across enough different sites.

Grouping and matching use no credits. If a refresh fails, the content gaps from the last successful refresh stay listed.

## Two kinds of content work

- **Improve a page.** The angle matched one of your content pages, and that page is not cited for the angle's prompts. The Action is on your page, and its finding reads "Cited content angle your page does not win".
- **Create a page.** None of your content pages matched the angle. The Action is on a planned page named after the angle, and its finding reads "Cited content angle you have no page for".

An angle whose matched page is already cited for its prompts is not listed. Without a Site Health crawl there are no content pages to match, so every content gap is a planned page; run a crawl before you plan new pages from this list.

Each content page has one Action. Its Site Health findings and content gaps share it, so a content page appears here with its Site Health work even when it has no content gap. Those issues still appear in **Issues**.

A later refresh can rename an angle and keep its Action. When a page you publish later matches an angle that had a planned page, the planned page's Action keeps its history, and the new page's Action links back to it.

## Read the list

Rows follow the same priority order as Actions.

| Column            | What it shows                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Page**          | The page's URL, or the angle's name for a planned page, over a summary such as "Planned page · 1 finding in Content optimization" |
| **Angle**         | The page's most cited angle; "Lead angle · 2 more angles" when it has others                                                      |
| **Prompts**       | Tracked prompts whose answers cited pages on the lead angle                                                                       |
| **Cited sources** | Competitor and publisher sites cited for the lead angle, with how many of them are competitors                                    |

A content page with no content gap shows not applicable in the last three columns, with the reason "No content gap on this page". The list shows counts from the evidence; it gives no page a score or grade.

Use **Status** to choose **Open and in progress** (the default), **Open**, **In progress**, **Implemented**, **Measuring**, **Done** or **Dismissed**. Each choice shows its count, and in the default view a row that is not Open names its status beside the page. Each status means what it means on [Actions](/agent/actions/#understand-status).

## When the evidence is not current

The list says which case applies:

- **Content gaps not computed yet:** no refresh has succeeded yet. Content gaps appear after a visibility run completes.
- **Content gap evidence is out of date:** your newest visibility run is too old to use, so no content gaps are listed. Run a visibility audit to refresh it.
- **No content work matches this status:** there is content work, but none with the chosen status.
- **No content gaps:** your latest visibility runs show no angle that competitor or publisher pages are cited for and your site lacks.

When the first two apply and the list still has rows, the notice appears above them; those rows are Site Health work on your content pages.

## Read why an Action matters

Open a row to see its Action. For each content gap, **Why this matters** shows:

- the angle's name;
- **Citations**, **Sites**, **Competitors** and **Prompts**, and the **Window** of visibility runs they come from;
- **Cited pages:** each page's title, linked to the page, with its site, its classification and its citation count. A competitor's site is named with the competitor. When more pages were cited, the most cited are listed with the total.
- **Prompts:** each prompt as it was worded at the last refresh, linked to the prompt. A prompt that had left your library by then reads "A prompt no longer in your library".
- **Continues the planned page for this angle**, when the page took over from a planned page's Action.

The **Diagnosis**, **Implementation** and linked chats follow, as on every Action. Site Health findings on the same page are listed in the Diagnosis.

## Hand the work to the Agent

- **Write this page**, on a planned page, opens **New chat** with the Action and its content gap attached and the **Article or guide** workflow selected.
- **Work on this**, on an existing page, opens **New chat** with the Action and the page's URL attached and the **Refresh an existing page** workflow selected.

Describe what you want and send. Work in the Agent uses AI credits like any chat, and the result is a draft for your review; see [Outputs and revisions](/agent/outputs/). A content page with only Site Health findings offers **Work on this with the agent**.

## Mark the work implemented

After you publish or update the page, use **Mark implemented** as on any Action; see [Declare implementation](/agent/actions/#declare-implementation). In the dialog, a content gap reads **Not measured automatically: no reading isolates this change.** Site Health findings on the same page are checked by the next crawl that reads it.

## Read the list from MCP or the API

An assistant connected with [MCP](/mcp/) reads this list with `read_actions` and `surface` set to `content`. Each item lists its content-gap angles with their counts, and its link opens the Action in Content optimization. The [REST API](/api/) lists it with `GET /v1/projects/{project_id}/actions?surface=content`. Both also say whether the content-gap evidence is current, out of date or not computed yet.
