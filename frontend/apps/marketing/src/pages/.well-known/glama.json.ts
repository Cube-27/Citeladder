const GLAMA_OWNERSHIP = {
  $schema: 'https://glama.ai/mcp/schemas/connector.json',
  maintainers: [{ email: 'abhineet.jain@cube27.com' }],
};

export function GET() {
  return Response.json(GLAMA_OWNERSHIP);
}
