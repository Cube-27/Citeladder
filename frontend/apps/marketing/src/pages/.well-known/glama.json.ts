/**
 * Glama MCP directory ownership for the com.citeladder connector. Glama
 * rechecks this file, so removing it drops the verified listing.
 */
const GLAMA_OWNERSHIP = {
  $schema: 'https://glama.ai/mcp/schemas/connector.json',
  maintainers: [{ email: 'abhineet.jain@cube27.com' }],
};

export function GET() {
  return Response.json(GLAMA_OWNERSHIP);
}
