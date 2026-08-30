import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const assets = join(dist, 'assets');

async function assetNames(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return assetNames(path);
    return [path];
  }));
  return names.flat();
}

const hash = createHash('sha256');
for (const file of (await assetNames(assets)).sort()) {
  hash.update(file.replace(dist, ''));
  hash.update(await readFile(file));
}
const version = hash.digest('hex').slice(0, 12);
const serviceWorkerPath = join(dist, 'sw.js');
const template = await readFile(serviceWorkerPath, 'utf8');
if (!template.includes('__ROOM_READY_CACHE__')) throw new Error('Service worker cache placeholder is missing');
await writeFile(serviceWorkerPath, template.replaceAll('__ROOM_READY_CACHE__', `room-ready-shell-${version}`));
