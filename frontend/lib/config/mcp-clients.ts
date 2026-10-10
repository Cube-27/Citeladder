/**
 * The hosted MCP endpoint and the AI assistants the connect strip opens.
 *
 * Every build links the production endpoint: assistants connect from their own
 * clouds, so a local or preview origin would never be reachable from them.
 */
export const MCP_SERVER_URL = 'https://api.citeladder.com/mcp';

const CONNECTOR_NAME = 'CiteLadder';

type McpClientId = 'claude' | 'chatgpt' | 'gemini' | 'grok';

/**
 * How the assistant receives the URL. A `prefilled` page carries it; on a
 * `paste` page the person adds it themselves, so the strip copies it first.
 */
export type McpClientLink = Readonly<{
  id: McpClientId;
  label: string;
  href: string;
  handoff: 'prefilled' | 'paste';
}>;

/**
 * Checked against each vendor's documentation on 2026-10-09:
 * claude.com/docs/connectors (prefill parameters), developers.openai.com/apps-sdk
 * (ChatGPT plugins page), support.google.com/gemini/answer/17209137 (Connected
 * apps) and docs.x.ai/grok/connectors.
 */
function clientLinks(serverUrl: string): readonly [McpClientLink, ...McpClientLink[]] {
  const claude = new URL('https://claude.ai/customize/connectors');
  claude.search = new URLSearchParams({
    modal: 'add-custom-connector',
    connectorName: CONNECTOR_NAME,
    connectorUrl: serverUrl,
  }).toString();
  return [
    { id: 'claude', label: 'Claude', href: claude.href, handoff: 'prefilled' },
    { id: 'chatgpt', label: 'ChatGPT', href: 'https://chatgpt.com/plugins', handoff: 'paste' },
    { id: 'gemini', label: 'Gemini', href: 'https://gemini.google.com/apps', handoff: 'paste' },
    { id: 'grok', label: 'Grok', href: 'https://grok.com/connectors', handoff: 'paste' },
  ];
}

/** Claude leads: it is the strip's default action, and the rest form its menu. */
export const MCP_CLIENT_LINKS = clientLinks(MCP_SERVER_URL);
