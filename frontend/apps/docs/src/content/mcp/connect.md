---
title: 'Connection setup'
description: 'Add CiteLadder to your AI client, approve workspace access and check which saved datasets are available.'
group: 'Connect with MCP'
order: 310
---

Every client connects to the same hosted server:

```text
https://citeladder.com/mcp
```

The connection uses browser sign-in (OAuth) with the read scope `citeladder:read`. Do not paste a provider API key or a CiteLadder session cookie into the client.

The quickest route is the **Connect** button in the CiteLadder app under **Settings → MCP connections**, or on the MCP product page. It opens the chosen client with CiteLadder's name and URL ready where the client supports it. The steps below cover the same setup by hand.

Client menus change between versions and plans. If a label differs, look for the client's custom connector or remote MCP server setting; the URL and sign-in flow stay the same.

## Add CiteLadder to your client

### Claude

1. In Claude, open **Customize → Connectors** and choose **Add custom connector**. The Connect button opens this dialog with the name and URL filled in.
2. Confirm the name **CiteLadder** and the URL, then add it.
3. Select **Connect** and sign in to CiteLadder.

On Team and Enterprise plans, an owner may need to add the connector in admin settings before members can connect.

### ChatGPT

1. Open [chatgpt.com/plugins](https://chatgpt.com/plugins) and select **+**.
2. Choose the option to add a custom MCP server.
3. Enter the name **CiteLadder** and the URL, and choose **OAuth** for authentication.
4. Acknowledge the custom server warning and select **Create**, then sign in to CiteLadder.

Depending on your plan, you may need to turn on developer mode first. Workspace admins can block custom servers.

### Gemini

1. Open [gemini.google.com/apps](https://gemini.google.com/apps), then go to **Settings → Connected Apps → Custom apps**.
2. Choose **Add a custom app**, paste the URL and select **Next**.
3. Approve the sign-in to CiteLadder.

Google currently limits custom apps to some accounts and regions.

### Cursor

1. Use the Connect button to open Cursor's install link, and approve the install in Cursor.
2. Sign in to CiteLadder when Cursor prompts you.

To configure it manually, add the server to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "citeladder": { "url": "https://citeladder.com/mcp" }
  }
}
```

### Grok

1. Open [grok.com/connectors](https://grok.com/connectors) and select **New Connector → Custom**.
2. Paste the URL and sign in to CiteLadder.

On Business and Enterprise plans, an admin may need to enable connectors first.

### Claude Code

Add the server, then run `/mcp` inside Claude Code to sign in:

```bash
claude mcp add --transport http citeladder https://citeladder.com/mcp
```

### Codex

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.citeladder]
url = "https://citeladder.com/mcp"
```

Then sign in:

```bash
codex mcp login citeladder
```

## Approve workspace access

Every client finishes in the same browser consent step:

1. Sign in to CiteLadder. If you do not have an account, create one; a new account gets a trial workspace. Finish project setup and you return to the approval page.
2. Select the workspaces this connection may read.
3. Review the read-only access and select **Approve**.

The connection reads only the workspaces you selected. Joining another workspace later does not add it; connect again to share it. Losing membership of a selected workspace removes access to it.

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

Confirm the signed-in account and that your client supports remote MCP with browser sign-in. Restart authorization when a request is denied or expired.

If a project is absent, check that its workspace was selected at approval and that you are still a member. See [Access and troubleshooting](/mcp/access/).
