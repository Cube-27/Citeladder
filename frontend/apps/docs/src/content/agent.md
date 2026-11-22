---
title: 'Meet the Agent'
description: "Work through a question or Action and turn your project's saved evidence into a reviewable deliverable."
group: 'Improve with Agent'
order: 200
updated: '2026-11-22'
---

The Agent is CiteLadder's in-app assistant. It can investigate saved project evidence, apply a skill and help you refine a plan, diagnosis, page edit or content draft.

Switch from **Dashboard** to **Agent** to open its workspace. You will find **New chat**, **Skills**, **Context** and your saved chat history. [Actions](/agent/actions/) sits in the Dashboard sidebar; each Action's **Work with the agent** opens a chat here.

## Start with the work you need done

There are four useful entry points:

- **New chat:** describe a question and the outcome you want.
- **Work on this:** start from an Action, with its target and diagnosis attached.
- **Ask agent:** carry selected references from a supported evidence screen into a new conversation.
- **Agent panel:** on a Dashboard screen, open the Agent from the top bar to chat beside what you are viewing. On Keyword research, the rows you are viewing are attached for you; on a Site Health issue, the panel starts with a question about that issue. Choose **Open in Agent** to continue the same chat in the full workspace.

Before sending, inspect the composer's reference chips. Remove anything that should not be part of the task. The Agent resolves those references against the saved data you can access.

**Attach files** adds a CSV, TSV, JSON, NDJSON, Markdown or plain-text file, or drop one on the composer; save a spreadsheet or PDF as CSV or paste its text instead. The Agent can turn the rows into an import of prompts, brand facts (as drafts) or products, proposed as a card that says how many rows it adds, skips and rejects.

Beside the composer you choose the model and the effort for the chat. The model is set once the chat has a reply; start a new chat to use another. Effort can change on any message.

## Ask a focused question

A useful request names the target, the evidence and the deliverable.

> Review this page's confirmed Site Health findings and the attached demand signal. Prepare a short edit plan. For each recommendation, show the supporting evidence, say what is still unknown, and explain how we could check the result.

For a visibility investigation:

> Explain the latest selected audit for this project. Keep brand mentions, owned citations and competitor appearances separate. Identify the saved answers that support the main findings.

You can choose a [skill](/agent/skills/) yourself or let the Agent select one suitable for the task.

## Work beside the output

A chat has one deliverable. The conversation helps you refine it; the output pane keeps the current version available for review, editing, copying and Markdown export.

Follow-up messages revise the same deliverable. Start a new chat when you want a different kind of output or another project.

The Agent writes the whole deliverable straight away; ask for an outline first if you want to agree the structure. See [Outputs and revisions](/agent/outputs/).

## Watch it work

While a turn runs, the activity line shows what the Agent is doing. When it needs several pieces of data, it reads them at the same time and lists each read. Open **Thinking** to see a short summary of its reasoning. The reply and the document fill in as they are written.

A reply can show up to four of the app's own charts and tables under its text: the visibility trend, the competitor ranking, cited sources, Site Health scores, AI traffic and keyword research rows. Each reads saved data and has **Open in app** to see it on its page.

The Agent remembers the chat: a follow-up builds on what it already read and wrote in earlier turns, so it does not repeat that work. Your own edits to the document are always passed on to it.

When a reply is saved, its run summary shows how many model calls and data reads the turn used, and **Sources** shows the data it read in that turn.

## Know the boundary

The Agent reads saved CiteLadder evidence. It does not browse the live web, publish content or contact publishers.

It never changes your project by itself. When you ask for a change to project data, such as prompts, topics, competitors, brand details or products, or for work such as an audit, a crawl, a probe or a keyword research run, it proposes the change as a card under its reply. The card shows what will change and what it can spend; nothing happens until you choose **Confirm**, and **Dismiss** drops it. Billing, plan, members, API keys, credentials and settings change only in CiteLadder's own screens.

It also cannot declare an Action implemented on your behalf. You make the external change and then explicitly record implementation.

## If a turn stops

Queued, running, cancelled, failed and stopped-at-limit are different outcomes. Use **Stop** while a turn is active if you no longer want it to continue.

A turn that reaches its limit answers from what it has read so far and does not save a partial deliverable as a finished output. Narrow the request if needed, and start a follow-up only when you want another turn. Earlier saved revisions remain available.
