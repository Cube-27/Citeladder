---
title: 'Connection setup'
description: 'Authorize your client, confirm project access, and check which saved datasets are available.'
group: 'Connect with MCP'
order: 310
---

Use a compatible remote MCP client and the hosted server URL:

```text
https://citeladder.com/mcp
```

The connection uses browser OAuth with the read scope `citeladder:read`. Do not paste a provider API key or a CiteLadder session cookie into the client.

## Connect your client

1. Add a remote MCP server in the client’s MCP or connector settings.
2. Name it **CiteLadder** and enter the endpoint above.
3. Start the client’s authentication flow.
4. Sign in to the intended CiteLadder account in the browser.
5. Review the requested read access and explicitly approve or deny it.
6. Return to the client and check its reported connection status.

The grant follows the account’s authorized workspaces. It is not restricted to the project currently visible in your browser. Choose the project explicitly when you begin analysis.

Client menus and command syntax vary by version. Use the installed client’s remote HTTP MCP instructions; the required endpoint and OAuth flow remain the same.

## Check the connection

Send a minimal request first:

```text
List the CiteLadder projects I can access. Do not analyze them or run anything yet.
```

If the project list works, choose one project and ask:

```text
For the project I choose, list the saved datasets that are available.
Include their observation dates, scope, coverage and limitations.
Do not refresh, acquire or change anything.
```

This separates a working connection from a missing dataset.

## Begin a focused read

Ask for one audit, date window or saved dataset rather than everything at once. Follow the returned pagination cursors when you need more rows.

For exact query evidence, use an available saved window. A missing requested window does not silently fall back to a nearby period.

## If authorization fails

Confirm the signed-in account and whether your client supports the required browser OAuth flow. Restart authorization when a transaction is denied or expired.

If connection succeeds but a project is absent, review workspace membership. See [Access and troubleshooting](/mcp/access/).
