export const MCP_SERVER_URL = 'https://api.citeladder.com/mcp';

const CONNECTOR_NAME = 'CiteLadder';

type McpClientId = 'claude' | 'chatgpt' | 'gemini' | 'grok';

export type McpClientLink = Readonly<{
  id: McpClientId;
  label: string;
  href: string;
  handoff: 'prefilled' | 'paste';
}>;

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

export const MCP_CLIENT_LINKS = clientLinks(MCP_SERVER_URL);
