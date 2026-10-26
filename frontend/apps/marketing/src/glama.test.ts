import { describe, expect, it } from 'vite-plus/test';
import { GET } from './pages/.well-known/glama.json';

describe('Glama ownership file', () => {
  it('serves JSON naming the connector maintainer', async () => {
    const response = GET();
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({
      $schema: 'https://glama.ai/mcp/schemas/connector.json',
      maintainers: [{ email: 'abhineet.jain@cube27.com' }],
    });
  });
});
