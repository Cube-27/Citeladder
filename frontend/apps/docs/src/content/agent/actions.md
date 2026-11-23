---
title: 'Actions and measurement'
description: 'Choose one target, review its supporting findings, and follow the work through to later evidence.'
group: 'Improve with Agent'
order: 210
updated: '2026-11-18'
---

An Action groups work around a target: an owned page, planned page, earned-source page, product, category, search query or visibility prompt. Multiple findings can support the same Action. Site Health issues are not Actions: the Actions list shows them, but you fix and track them in [Site Health **Issues**](/site-health/).

This gives your team one place to understand the diagnosis, start Agent work and track implementation.

## Choose what to work on

Open **Actions** in the sidebar. It lists everything you can act on across CiteLadder, website issues included, grouped by goal:

| Goal                    | What it holds                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Let AI read your site   | Technical website issues, page signals that regressed between crawls, and internal links                                                                             |
| Improve your own pages  | Content and AEO website issues, prompts you don't appear in, pages to improve, create or merge (including [content gaps](/content-optimization/)) and search queries |
| Get mentioned elsewhere | Cited pages that list your competitors but not you                                                                                                                   |
| Improve your products   | Products and categories                                                                                                                                              |

Each goal holds categories, and each shows how many items it holds; choose a heading to fold it. The cells above the list count each goal and take you to it. Choose a status (**New**, **In progress**, **Done** or **Declined**), narrow by **Source** or **Priority**, or group by source instead; the view stays in the page address, so you can share it. A website issue row opens that issue in Issues, where you mark it fixed. Any other row opens the Action's detail.

Every page that the Sources URL table shows as a **Gap** becomes a "Get mentioned elsewhere" Action after its next refresh, whatever kind of page it is.

Read the diagnosis, contributing evidence, recommended approach and what to avoid. The priority comes from CiteLadder's deterministic rules. An Agent explanation does not replace that ranking or create new measured facts.

Choose **Work on this** when the Action is suitable for your team. Linked chats remain visible on the Action.

## Hand the work to a developer

**Prepare developer ticket** on an Action's page writes it as Markdown your team can paste into its tracker: the issue, the affected page or pages, the dated evidence, the smallest change that fixes it and how CiteLadder will verify it. **Copy Markdown** copies it; nothing is sent anywhere.

The **Evidence** chips on the page list each record behind the Action with its date and whether it was **Observed** (a crawl, visibility run or Search Console window) or **Inferred** (a finding a rule derived from observations).

## Analyze one of your pages

Choose **Analyze a page** above the list to work on a content page that no finding has raised yet. Pick one of the articles, guides or other content pages from your latest crawl, a topic, and the topic's prompts the page should answer; only topics with prompts are listed, and all their prompts start selected. **Generate action** creates the page's Action, or reuses it if the page already has one, and opens a new chat that reads the live page first. Nothing is charged until the page has been read.

**Work with the agent** on an Action for one of your content pages opens the same kind of chat.

## Work on the page

Once the page is read, the chat opens as a workspace: the page on the left, and **Suggestions**, **Outline** and **SEO** on the right with the chat under them. On a narrow screen each of these is a tab.

- **Suggestions** lists the agent's proposed changes, grouped by the passage they belong to. Text highlighted in blue has a change ready: choose **Apply** to make it, or **Dismiss**. Text highlighted in amber needs a fact from you: **Add to context** puts the question in the chat for you to answer. **Apply all** makes every ready change that doesn't overlap another; overlapping ones are marked **Choose one** for you. Applied and dismissed suggestions stay listed, and **Revert** puts one back.
- Choose highlighted text to open its suggestion, or a suggestion to find its text on the page.
- Select text and choose **Ask AI** to quote it in the chat. Nothing is sent until you send it.
- You can edit the page directly; **Save changes** keeps your edit as a new revision.
- **Outline** lists the page's headings; choose one to go to it.
- **SEO** shows the page's title tag, meta description and structured data, and the checks Site Health ran when the page was read. Editing the page does not rerun those checks.
- **Export** copies the page as Markdown, HTML or plain text, or downloads it as a `.md` or `.html` file.

When the page is live, choose **Mark implemented** in the workspace to declare the revision on screen.

## Understand status

| Status      | Meaning                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| New         | Work CiteLadder found that nobody has accepted or declined yet                     |
| In progress | Someone chose **Accept**, or started **Work with the agent** on a New Action       |
| Done        | Someone chose **Mark implemented**; its measurement shows beside it                |
| Declined    | Someone chose **Decline**; **Restore** puts it back in New, **Accept** in progress |

A Done Action is **Measuring** until every expected check has a met reading, then **Verified**. A later conflicting observation moves verified work back to measuring; the Action stays Done.

**Accept** and **Decline** work on a New Action, **Decline** on one in progress, and **Restore** or **Accept** on a declined one. An Action in progress cannot go back to New. A chat output, such as a generated draft, never changes the status: it does not mean the work has shipped. Declining is not implementation, and Done is final.

## Declare implementation

First make the change in your website, publishing workflow or external process. Then use **Mark implemented** for the relevant Action and choose the day it went live: today or any day in the last 30 days. Readings from before that day are not counted. **What shipped it?** optionally records the release, pull request or commit.

Declaring is the Action's deployment record: the **Implementation** section shows the go-live day, who recorded it (the signed-in person, never a typed name) and what shipped it, linked when it is a web address.

When work came from the Agent, confirm the output revision that matches what you shipped. Work done outside CiteLadder can be declared without an Agent output. A document that names a different page than the chat's Action asks once before you declare: **Link to** that page's Action, or **Keep with this Action**.

CiteLadder uses the Action's findings to determine the expected checks, and the dialog shows what each finding will be measured by before you declare. Some findings, such as a product or theme with no specific prompt, have no reading that isolates your change; they are recorded but not measured automatically. An Action that never had a finding cannot be declared merely to create a measurement plan.

If a crawl has already cleared the Action's findings, you can still declare it. When that crawl came after your go-live day, the next readings decide the checks as usual. When it came on or before that day, the issue was resolved before your deployment: the declaration records that, measures nothing and never credits the change with it.

## Read the measurement result

The declaration keeps the target, baseline and expected checks tied to that implementation event. Each check is read by the evidence that can answer it:

- an internal-link check by the next crawl that reads the page;
- a prompt by the next visibility run;
- Search Console clicks per day on the page or query by each synced window that starts after the go-live day;
- a keyword gap by whether your site now appears for that search, in Search Console or in a later Keyword research dataset.

Each check keeps its own latest reading, so a crawl and a Search Console window together can complete an Action that neither completes alone.

Review each check and what its reading is waiting for. A page check that is still waiting offers **Run crawl now**. A page the crawl did not read, or an incompatible window, is a reason for limited measurement, not an observed failure. New evidence is read for 30 days after the go-live day, or 90 days for a keyword check, because a new page takes longer to rank than an edited one takes to recrawl. After that, the last reading stands.

An earned Action (a cited page that lists competitors but not you) is measured on the tracked prompts whose answers cited that page. A later improvement on those prompts is evidence to review, not proof that the listing caused it.

## Report progress honestly

Use "implemented" for the work your team shipped and "verified" for the checks supported by later evidence. Neither status proves that the change caused every movement in traffic or AI visibility.

For the actual draft history, see [Outputs and revisions](/agent/outputs/).
