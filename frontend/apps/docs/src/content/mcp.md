---
title: 'Connect with MCP'
description: 'Use CiteLadder’s saved evidence in an external AI assistant through a read-only connection.'
group: 'Connect with MCP'
order: 300
---

MCP lets a compatible AI client read CiteLadder records that your account is authorized to access. Use it to investigate a project, review results or prepare a report in your preferred assistant.

The hosted endpoint is **https://citeladder.com/mcp**. The docs subdomain hosts these guides; it is not the protocol server.

## What you can read

The server exposes project discovery, business context, prompts, visibility results and sources, Site Health, connected-data status, performance, AI referrals, demand, opportunities and saved Search Intelligence datasets.

Use the [tool reference](/mcp/tools/) for the registered catalog and [example requests](/mcp/examples/) for practical starting points.

## How it differs from the Agent

The in-app [Agent](/agent/) works inside a project-pinned chat with saved deliverables and revisions. MCP supplies read access to an external client, which controls its own conversation and outputs.

MCP does not expose the Agent’s private skill methodologies or its Agent-only Action reads.

## What the connection cannot do

MCP cannot start an audit or crawl, sync a provider, buy a Search Intelligence dataset, activate prompts, generate through CiteLadder’s Agent runtime, publish content or make another product mutation.

If evidence is stale or unavailable, refresh or acquire it through the appropriate CiteLadder workflow, then ask the client to read again.

## Before you connect

You need a CiteLadder account with access to the relevant workspace and a client that supports remote Streamable HTTP MCP with browser OAuth.

Your client receives the records you ask it to read. Check your team’s policy and the client’s handling of that data before using sensitive information.

Continue to [Connection setup](/mcp/connect/).
