---
title: 'Connect with MCP'
description: "Use CiteLadder's saved evidence in an external AI assistant through a read-only connection."
group: 'Connect with MCP'
order: 300
---

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard that lets AI assistants use tools from other products. CiteLadder's hosted MCP server lets a compatible assistant read the CiteLadder records your account is authorized to access, so you can investigate a project, review results or prepare a report in the assistant you already use.

The hosted endpoint is **https://citeladder.com/mcp**. One address works for every client. The docs subdomain hosts these guides; it is not the protocol server.

## Connect in three steps

1. **Connect.** Use the **Connect** button in CiteLadder, or add the endpoint as a custom connector in your assistant.
2. **Sign in and approve.** Sign in to CiteLadder and choose the workspaces the connection may read. There is no API key to copy.
3. **Ask a question.** For example: "List my CiteLadder projects, then summarize the latest AI visibility results for one of them."

[Connection setup](/mcp/connect/) has the steps for each client.

## What you can read

The server exposes project discovery, business context, prompts, visibility results and sources, Site Health, connected-data status, performance, AI referrals, demand, opportunities and saved Search Intelligence datasets.

Use the [tool reference](/mcp/tools/) for the registered catalog and [example requests](/mcp/examples/) for practical starting points.

## How it differs from the Agent

The in-app [Agent](/agent/) works inside a project-pinned chat with saved deliverables and revisions. MCP supplies read access to an external client, which controls its own conversation and outputs.

MCP does not expose the Agent's private skill methodologies or its Agent-only Action reads.

## What the connection cannot do

MCP cannot start an audit or crawl, sync a provider, buy a Search Intelligence dataset, activate prompts, generate through CiteLadder's Agent runtime, publish content or make another product mutation.

If evidence is stale or unavailable, refresh or acquire it through the appropriate CiteLadder workflow, then ask the client to read again.

## Before you connect

You need:

- A CiteLadder workspace with an active trial or subscription, and at least one project.
- A client that supports remote Streamable HTTP MCP with browser OAuth. [Setup](/mcp/connect/) covers Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code and Codex.

Assistants decide which plans and regions can add custom connectors, so availability can differ between accounts.

Your client receives the records you ask it to read. Check your team's policy and the client's handling of that data before using sensitive information.

Continue to [Connection setup](/mcp/connect/).
