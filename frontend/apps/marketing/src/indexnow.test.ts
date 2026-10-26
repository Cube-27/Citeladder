import { describe, expect, it } from 'vite-plus/test';
import { GET, getStaticPaths } from './pages/[indexNowKey].txt';

describe('IndexNow key file', () => {
  it('is served at /<key>.txt with the key as its whole body', async () => {
    expect(getStaticPaths()).toEqual([
      { params: { indexNowKey: 'eb663a4c6fa24ab18251bd8138bd467a' } },
    ]);
    expect(await GET().text()).toBe('eb663a4c6fa24ab18251bd8138bd467a');
  });
});
