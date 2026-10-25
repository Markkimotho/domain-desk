import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../site/vendor/', import.meta.url), { recursive: true });
for (const [source, target] of [['dist/index.esm.min.js', 'tldts.js'], ['LICENSE', 'tldts.LICENSE']]) {
  await copyFile(new URL(`../node_modules/tldts/${source}`, import.meta.url), new URL(`../site/vendor/${target}`, import.meta.url));
}
