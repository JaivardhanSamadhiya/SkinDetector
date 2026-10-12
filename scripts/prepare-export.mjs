import { readdir, readFile, copyFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

// Next's static segment prefetch URLs flatten __next segment paths with dots.
// Windows exports can retain directories. Add equivalent aliases for plain
// static hosts without changing page data or requiring server-side rewrites.
const root = resolve('out');
let aliases = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.isFile() && entry.name.endsWith('.txt')) {
      const parts = relative(root, filename).split(sep);
      const segment = parts.findIndex(part => part.startsWith('__next.'));
      if (segment < 0 || segment === parts.length - 1) continue;
      const destination = join(root, ...parts.slice(0, segment), parts.slice(segment).join('.'));
      const contents = await readFile(filename);
      try {
        if (!(await readFile(destination)).equals(contents)) throw new Error('Conflicting static segment export.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await copyFile(filename, destination); aliases++;
      }
    }
  }
}
await visit(root);
console.log(`Prepared static segment assets (${aliases} aliases).`);
