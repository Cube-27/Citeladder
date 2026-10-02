/** Customer-owned OpenAI-compatible connection and probe policy. */
export const appModels = {
  disclosure_revision: '1',
  allowed_ports: [443],
  max_request_bytes: 256000,
  max_response_bytes: 512000,
  timeout_seconds: 60,
  probe_timeout_seconds: 10,
  probe_max_output_tokens: 4,
  probe_prompt: 'Reply with OK. This is a customer-charged connection test.',
  success_detail: 'Connection succeeded',
};
