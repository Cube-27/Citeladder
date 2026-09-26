import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicRoot = new URL('../public/', import.meta.url);
const docsPublic = new URL('../apps/docs/public/', import.meta.url);
await mkdir(docsPublic, { recursive: true });
for (const name of ['citeladder-logo.svg', 'citeladder-favicon.ico', 'fonts']) {
  try {
    await cp(new URL(name, publicRoot), new URL(name, docsPublic), { recursive: true });
  } catch (error) {
    if (name !== 'fonts' || error.code !== 'ENOENT') throw error;
    process.stdout.write(
      `Licensed fonts absent in ${fileURLToPath(publicRoot)}; using matched fallbacks locally. Delivery must supply fonts.\n`,
    );
  }
}
