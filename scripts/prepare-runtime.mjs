import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Bundle the matching WASM runtime locally. No third-party CDN receives uploads.
const require = createRequire(import.meta.url);
const distribution = dirname(require.resolve('onnxruntime-web'));
const destination = new URL('../public/ort/', import.meta.url);
await mkdir(destination, { recursive: true });
let copied = 0;
for (const filename of await readdir(distribution)) {
  if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(filename)) {
    await copyFile(join(distribution, filename), new URL(filename, destination));
    copied++;
  }
}
if (copied !== 2) throw new Error('ONNX runtime installation is incomplete. Run npm ci before building.');
console.log('Prepared same-origin ONNX WebAssembly runtime.');
