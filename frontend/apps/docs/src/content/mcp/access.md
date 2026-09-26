---
title: 'Access and troubleshooting'
description: 'Resolve connection and data problems while keeping account access and client data handling clear.'
group: 'Connect with MCP'
order: 340
---

The MCP grant is bound to your CiteLadder account. Each protected read checks current workspace access, so removing membership can remove access even before a token expires.

## Understand what is shared

The connection requests read access through `citeladder:read`. Tools return authorized product evidence, not your provider credentials.

Once an external client reads a record, it receives that data. Review its provider, retention and workspace policies. Disconnecting later cannot recall information already delivered to the client.

## Revoke access

Removing the server from a client’s local configuration may only remove the local connection. To invalidate the server-side grant, use a client action that performs OAuth revocation.

Removing workspace membership independently blocks reads for the affected workspace. For broader account concerns, contact your workspace administrator.

## Troubleshoot the symptom

| Symptom                                   | Next step                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Authentication is expired or denied       | Restart the client’s OAuth flow and review the browser consent      |
| A project is missing                      | Confirm the account and its current workspace membership            |
| A tool works but returns unavailable data | Inspect dataset inventory and integration status                    |
| Evidence is stale                         | Refresh it through the appropriate in-app workflow, then read again |
| An exact date window is unavailable       | Choose a reported saved window and name it explicitly               |
| A tool is absent                          | Use the server’s actual catalog; do not invent another tool         |
| The client cannot complete sign-in        | Check support for remote Streamable HTTP MCP with browser OAuth     |

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
