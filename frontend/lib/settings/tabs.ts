/** Settings' tabs in row order. Data only: the route manifest loads it in Node. */
export const SETTINGS_TABS = [
  { value: 'account', label: 'Account' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'providers', label: 'Providers' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'connections', label: 'MCP connections' },
  { value: 'api-keys', label: 'API keys' },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]['value'];
