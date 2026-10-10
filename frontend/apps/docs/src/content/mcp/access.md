---
title: 'Access and troubleshooting'
description: 'Resolve connection and data problems while keeping account access and client data handling clear.'
group: 'Connect with MCP'
order: 340
---

The MCP grant is bound to your CiteLadder account and to the workspaces you selected when you approved the connection. Each read checks that you are still a member, so losing membership removes access even before a token expires. Joining another workspace later does not add it to an existing connection.

## Understand what is shared

Every connection reads through `citeladder:read`. Tools return authorized product evidence, not your provider credentials.

## Changes and confirmation

A connection can change data only if you ticked **Allow changes** when you approved it, which adds `citeladder:write`. The box is unticked by default, and a connection approved without it never lists or runs change tools. To add changes later, revoke the connection and connect again.

Each change uses your current role in the project's workspace: a Viewer cannot change anything, and a demotion takes effect at once. Settings shows each connection as **Read** or **Read and change**.

Larger changes need your confirmation in the conversation. The assistant first prepares the change and shows you a preview; CiteLadder runs it only when the assistant confirms that same preview after you agree. A confirmation works once, for ten minutes, and only for the connection that prepared it. If something changed in between, such as your prompt allowance filling up, the change is refused with the reason. A connection can make 30 calls to change tools a minute, within its 120 tool calls.

Once an external client reads a record, it receives that data. Review its provider, retention and workspace policies. Disconnecting later cannot recall information already delivered to the client.

## Revoke access

Open **Settings → MCP connections** in the CiteLadder app to review and revoke connections. A workspace Owner or Admin can also remove a connection's access to their workspace.

You can also remove the connector in the client. Removing it only from a client's local configuration may leave the server-side grant in place, so revoke it in CiteLadder as well.

Removing workspace membership independently blocks reads for the affected workspace. For broader account concerns, contact your workspace administrator.

## Troubleshoot the symptom

| Symptom                                   | Next step                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Authentication is expired or denied       | Restart the client's OAuth flow and review the browser consent      |
| A project is missing                      | Confirm the workspace was selected at approval and you are a member |
| A tool works but returns unavailable data | Inspect dataset inventory and integration status                    |
| Evidence is stale                         | Refresh it through the appropriate in-app workflow, then read again |
| An exact date window is unavailable       | Choose a reported saved window and name it explicitly               |
| A tool is absent                          | Use the server's actual catalog; do not invent another tool         |
| The client cannot complete sign-in        | Check support for remote Streamable HTTP MCP with browser OAuth     |
| A workspace cannot be selected            | Follow the reason shown: renew billing or accept the current Terms  |
| A tool reports too many requests          | Wait for the retry time it names, then ask a narrower question      |
| No CiteLadder tools appear after adding   | Restart the client and check the connector is enabled and signed in |
| The client asks you to sign in again      | The connection expired or was revoked; approve it again             |

## Use a minimal diagnostic sequence

1. Check that the server is connected.
2. Confirm the account used for authorization.
3. List projects.
4. Choose one project.
5. Inspect available datasets and their dates.
6. Read one specific record.

If step three succeeds but step six returns no evidence, investigate the dataset rather than repeatedly reconnecting.

## Ask for help safely

Include the client name and version, approximate time, the failing step and the displayed error. Do not send tokens, session cookies or provider credentials.

Contact [CiteLadder support](https://citeladder.com/contact) if the issue persists.
