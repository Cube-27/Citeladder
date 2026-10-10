---
title: 'Connect with MCP'
description: "Use CiteLadder's saved evidence in an external AI assistant, and let it make changes you confirm."
group: 'Connect with MCP'
order: 300
---

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard that lets AI assistants use tools from other products. CiteLadder's hosted MCP server lets a compatible assistant read the CiteLadder records your account is authorized to access, so you can investigate a project, review results or prepare a report in the assistant you already use. If you allow it, the assistant can also make changes, each shown to you and confirmed by you first.

The hosted endpoint is **https://api.citeladder.com/mcp**. One address works for every client. The docs subdomain hosts these guides; it is not the protocol server.

## Connect in three steps

1. **Connect.** Use the **Connect** button in CiteLadder, or add the endpoint as a custom connector in your assistant.
2. **Sign in and approve.** Sign in to CiteLadder, choose the workspaces the connection may use and decide whether to tick **Allow changes**. There is no API key to copy.
3. **Ask a question.** For example: "List my CiteLadder projects, then summarize the latest AI visibility results for one of them."

[Connection setup](/mcp/connect/) has the steps for each client.

## What you can read

The server exposes project discovery, business context, prompts, visibility results and sources, Actions, the AI Shelf, Site Health and crawler access, AI traffic and crawl logs, connected-data status, performance, AI referrals, search demand and saved Search Intelligence datasets.

Use the [tool reference](/mcp/tools/) for the registered catalog and [example requests](/mcp/examples/) for practical starting points.

## What you can change

With **Allow changes**, in workspaces where you are a Member or above, the assistant can add and edit topics and prompts, archive prompts, add competitors, launch and cancel audits, create audit schedules, update an Action's status and declare an Action implemented.

Small edits, such as renaming a topic, run when the assistant calls them. Larger changes (adding or archiving prompts, launching an audit, creating a schedule, declaring an Action implemented) work in two steps: the assistant shows you a preview, such as the prompts to be added or the audit credits an audit can use, and the change happens only after you agree. Added prompts are active at once. [Access](/mcp/access/#changes-and-confirmation) explains the rules.

## How it differs from the Agent

The in-app [Agent](/agent/) works inside a project-pinned chat with saved deliverables and revisions, and it only reads. MCP supplies read access, and confirmed changes if you allow them, to an external client, which controls its own conversation and outputs.

The Agent reads evidence through the same catalogue of read tools, limited to its chat's project. MCP does not expose the Agent's skill methodologies, its chats or its saved outputs.

## What the connection cannot do

MCP cannot make a change you did not allow or confirm. It cannot start a crawl, sync a provider, buy a Search Intelligence dataset, generate through CiteLadder's Agent runtime, publish content, delete projects or change billing, members or credentials.

If evidence is stale or unavailable, refresh or acquire it through the appropriate CiteLadder workflow, then ask the client to read again.

## Before you connect

You need:

- A CiteLadder workspace with an active trial or subscription. The assistant reads project evidence, so set up a project first; the approval page links to setup if you have none.
- A client that supports remote Streamable HTTP MCP with browser OAuth. [Setup](/mcp/connect/) covers Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code and Codex.

Assistants decide which plans and regions can add custom connectors, so availability can differ between accounts.

Your client receives the records you ask it to read. Check your team's policy and the client's handling of that data before using sensitive information.

Continue to [Connection setup](/mcp/connect/).
