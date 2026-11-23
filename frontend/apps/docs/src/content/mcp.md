---
title: 'Connect with MCP'
description: "Use CiteLadder's saved evidence in an external AI assistant."
group: 'Connect with MCP'
order: 300
updated: '2026-11-18'
---

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard that lets AI assistants use tools from other products. CiteLadder's hosted MCP server lets a compatible assistant read the CiteLadder records your account is authorized to access, so you can investigate a project, review results or prepare a report in the assistant you already use.

The hosted endpoint is `https://api.citeladder.com/mcp`. One address works for every client. The docs subdomain hosts these guides; it is not the protocol server.

## Connect in three steps

1. **Connect.** Use the **Connect** button in CiteLadder, or add the endpoint as a custom connector in your assistant.
2. **Sign in and approve.** Sign in to CiteLadder, choose the workspaces the connection may use and approve. There is no API key to copy.
3. **Ask a question.** For example: "List my CiteLadder projects, then summarize the latest AI visibility results for one of them."

[Connection setup](/mcp/connect/) has the steps for each client.

## What you can read

The server exposes project discovery, business context, prompts and their metrics, visibility results by topic, sources, query fanouts, competitors and their suggestions, answer perception, fact checks, ads in AI answers, Actions, content comparisons, product metrics from Commerce, Site Health and crawler access, AI traffic and crawl logs, connected-data status, performance, AI referrals, search demand and saved Keyword research datasets.

`read_ai_shelf` returns each product's visibility, appearances, win rate, position, mentioned and catalog price and merchants over a window of days, the same numbers as the [Products table](/commerce/#read-the-products-table); given one product, it returns that product's page.

Use the [tool reference](/mcp/tools/) for the registered catalog and [example requests](/mcp/examples/) for practical starting points.

## Changes happen in CiteLadder

The connection is read-only. To add prompts, launch audits, start crawls or update Actions, use the CiteLadder app; the assistant can link you to the right page.

## How it differs from the Agent

The in-app [Agent](/agent/) works inside a project-pinned chat with saved deliverables and revisions, and it only reads. MCP supplies read access to an external client, which controls its own conversation and outputs.

The Agent reads evidence through the same catalogue of read tools, limited to its chat's project. MCP does not expose the Agent's skill methodologies, its chats or its saved outputs.

## What the connection cannot do

MCP only reads. It cannot change prompts, audits or Actions, start a crawl, sync a provider, buy a Keyword research dataset, generate through CiteLadder's Agent runtime, publish content, delete projects or change billing, members or credentials.

If evidence is stale or unavailable, refresh or acquire it through the appropriate CiteLadder workflow, then ask the client to read again.

## Before you connect

You need:

- A CiteLadder workspace with an active trial or subscription. The assistant reads project evidence, so set up a project first; the approval page links to setup if you have none.
- A client that supports remote Streamable HTTP MCP with browser OAuth. [Setup](/mcp/connect/) covers Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code and Codex.

Assistants decide which plans and regions can add custom connectors, so availability can differ between accounts.

Your client receives the records you ask it to read. Check your team's policy and the client's handling of that data before using sensitive information.

Continue to [Connection setup](/mcp/connect/).
