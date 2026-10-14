import { readdir, readFile, copyFile, unlink } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

// Next's static segment prefetch URLs flatten __next segment paths with dots.
// Windows exports can retain directories. Add equivalent aliases for plain
// static hosts without changing page data or requiring server-side rewrites.
const root = resolve('out');
// A split, verified artifact supersedes the failed historical int8 file. Keep
// the historical copy in ignored training data, outside the deployment archive.
try {
  const manifest = JSON.parse(await readFile(join(root, 'model-photo', 'manifest.json'), 'utf8'));
  if (Array.isArray(manifest.onnx?.parts)) await unlink(join(root, 'model-photo', 'model.onnx')).catch(error => { if (error.code !== 'ENOENT') throw error; });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
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
