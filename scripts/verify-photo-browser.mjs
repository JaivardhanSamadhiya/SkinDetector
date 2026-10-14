import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Run after: .venv\Scripts\python.exe scripts/photo_browser_verify.py
// This independent, loopback-only harness performs real ONNX inference. It does
// not modify evaluation locks, release flags, app results or product decisions.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'data/photo-v2/browser-qa');
const reportPath = path.join(root, 'models/photo-v2/browser-parity.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
const reference = await json(path.join(data, 'reference.json'));
const repairLock = path.join(root, 'models/photo-v2/deployment-repair-lock.json');
const model = await json(repairLock);
if (sha(await readFile(repairLock)) !== reference.binding.repair_lock_sha256
    || model.onnx.sha256 !== reference.binding.onnx_sha256
    || reference.samples.length !== 12 || reference.samples.some(sample => sample.split !== 'validation')) {
  throw new Error('Browser references differ from the locked artifact or fixed validation set.');
}
for (const [filename, expected] of [
  ['models/photo-v2/deployment-evaluation.json', reference.binding.evaluation_sha256],
  ['data/photo-v2/combined-cohort.json', reference.binding.cohort_sha256],
  ['models/photo-v2/browser-verification-protocol.json', reference.binding.protocol_sha256],
  ['lib/browser-inference.ts', reference.binding.browser_preprocessing_source_sha256],
]) if (sha(await readFile(path.join(root, filename))) !== expected) throw new Error(`Verification provenance changed: ${filename}`);
try { await stat(reportPath); throw new Error('A browser parity report already exists; preserve it and inspect it before a new verification run.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const preprocessingSource = await readFile(path.join(root, 'lib/browser-inference.ts'), 'utf8');
const ast = ts.createSourceFile('browser-inference.ts', preprocessingSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['resizeNearest', 'normalizePixels'].includes(node.name?.text));
if (functions.length !== 2) throw new Error('Could not extract the actual app preprocessing functions.');
const preprocessingModule = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const require = createRequire(import.meta.url);
const distribution = path.dirname(require.resolve('onnxruntime-web'));
const runtimeVersion = (await json(path.join(distribution, '../package.json'))).version;
const routes = new Map([
  ['/qa/reference.json', { bytes: Buffer.from(JSON.stringify(reference)), type: 'application/json' }],
  ['/qa/preprocessing.mjs', { bytes: Buffer.from(preprocessingModule), type: 'text/javascript' }],
  ['/ort/ort.wasm.min.mjs', { file: path.join(distribution, 'ort.wasm.min.mjs'), type: 'text/javascript' }],
  ['/ort/ort-wasm-simd-threaded.mjs', { file: path.join(distribution, 'ort-wasm-simd-threaded.mjs'), type: 'text/javascript' }],
  ['/ort/ort-wasm-simd-threaded.wasm', { file: path.join(distribution, 'ort-wasm-simd-threaded.wasm'), type: 'application/wasm' }],
]);
for (const part of model.onnx.parts) routes.set(part.url, { file: path.join(root, 'public', part.url), type: 'application/octet-stream' });
for (const sample of reference.samples) for (const field of ['image', 'tensor']) {
  const item = sample[field], filename = path.join(data, item.filename);
  if (path.dirname(filename) !== data || sha(await readFile(filename)) !== item.sha256) throw new Error('Invalid or changed canonical verification input.');
  routes.set('/qa/' + item.filename, { file: filename, type: field === 'image' ? 'image/png' : 'application/octet-stream' });
}
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>SkinSnap actual browser verification</title><p>Local research verification</p>'); return; }
    const route = routes.get(url.pathname);
    if (!route) { response.writeHead(404); response.end(); return; }
    const length = route.bytes?.byteLength ?? (await stat(route.file)).size;
    response.writeHead(200, { 'Content-Type': route.type, 'Content-Length': length, 'Cache-Control': 'no-store' });
    if (route.bytes) response.end(route.bytes); else createReadStream(route.file).pipe(response);
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let savedReport;
const started = Date.now();
try {
  browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--renderer-process-limit=1'] });
  const page = await browser.newPage();
  const requests = [];
  page.on('request', request => { if (request.method() !== 'GET' || new URL(request.url()).origin !== origin) requests.push(request.url()); });
  page.on('console', message => { if (message.type() === 'log') console.log(message.text()); });
  page.on('pageerror', error => console.error('Browser runtime:', error.message));
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    const checkedBytes = async (url, expected, size) => {
      const response = await fetch(url, { redirect: 'error' });
      if (!response.ok) throw new Error('Verification transport failed: ' + url);
      const bytes = await response.arrayBuffer();
      if ((size !== undefined && bytes.byteLength !== size) || await digest(bytes) !== expected) throw new Error('Verification integrity failed: ' + url);
      return bytes;
    };
    const config = await (await fetch('/qa/reference.json')).json();
    const { resizeNearest, normalizePixels } = await import('/qa/preprocessing.mjs');
    const ort = await import('/ort/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = new URL('/ort/', location.origin).href;
    let weights = new Uint8Array(config.onnx.bytes), offset = 0;
    for (const [index, part] of config.onnx.parts.entries()) {
      const bytes = await checkedBytes(part.url, part.sha256, part.bytes);
      weights.set(new Uint8Array(bytes), offset); offset += bytes.byteLength;
      console.log(JSON.stringify({ phase: 'browser_verified_model_part', done: index + 1, total: config.onnx.parts.length }));
    }
    if (offset !== config.onnx.bytes || await digest(weights) !== config.onnx.sha256) throw new Error('Combined model integrity failed.');
    const session = await ort.InferenceSession.create(weights, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    weights = null;
    const samples = [];
    try {
      for (const [index, sample] of config.samples.entries()) {
        const imageBytes = await checkedBytes('/qa/' + sample.image.filename, sample.image.sha256);
        const bitmap = await createImageBitmap(new Blob([imageBytes], { type: 'image/png' }), { imageOrientation: 'from-image' });
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || bitmap.width !== sample.image.dimensions[0] || bitmap.height !== sample.image.dimensions[1]) throw new Error('Invalid canonical image dimensions.');
        context.drawImage(bitmap, 0, 0);
        const tensor = normalizePixels(resizeNearest(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height, 224), [.485, .456, .406], [.229, .224, .225]);
        bitmap.close(); canvas.width = 0; canvas.height = 0;
        const referenceTensor = new Float32Array(await checkedBytes('/qa/' + sample.tensor.filename, sample.tensor.sha256, 3 * 224 * 224 * 4));
        let tensorError = 0;
        for (let i = 0; i < tensor.length; i++) tensorError = Math.max(tensorError, Math.abs(tensor[i] - referenceTensor[i]));
        const input = new ort.Tensor('float32', tensor, [1, 3, 224, 224]);
        const outputs = await session.run({ [config.onnx.input_name]: input });
        const value = outputs[config.onnx.logits_output];
        if (!value || value.type !== 'float32' || value.dims.join(',') !== '1,3' || value.data.length !== 3 || !Array.from(value.data).every(Number.isFinite)) throw new Error('Invalid actual browser output.');
        const logits = Array.from(value.data), maxError = Math.max(...logits.map((value, i) => Math.abs(value - sample.logits[i])));
        const top = values => values.indexOf(Math.max(...values));
        const matching = top(logits) === top(sample.logits);
        samples.push({ id: sample.id, source: sample.source, split: sample.split, original_image_sha256: sample.original_image_sha256,
          browser_logits: logits, pytorch_logits: sample.logits, maximum_absolute_tensor_error: tensorError,
          maximum_absolute_logit_error: maxError, matching_top_label: matching });
        input.dispose(); Object.values(outputs).forEach(output => output.dispose());
        console.log(JSON.stringify({ phase: 'browser_wasm_validation_parity', done: index + 1, total: config.samples.length, maximum_absolute_tensor_error: tensorError, maximum_absolute_logit_error: maxError, matching_top_label: matching }));
      }
    } finally { await session.release(); }
    return { samples, maximum_absolute_tensor_error: Math.max(...samples.map(sample => sample.maximum_absolute_tensor_error)),
      maximum_absolute_logit_error: Math.max(...samples.map(sample => sample.maximum_absolute_logit_error)), matching_top_labels: samples.every(sample => sample.matching_top_label) };
  });
  const passed = result.samples.length === 12 && result.maximum_absolute_tensor_error < reference.protocol.maximum_absolute_tensor_error
    && result.maximum_absolute_logit_error < reference.protocol.maximum_absolute_logit_error && result.matching_top_labels && requests.length === 0;
  const report = { passed, model_version: reference.model_version, protocol: reference.protocol, binding: reference.binding,
    reference_sha256: sha(await readFile(path.join(data, 'reference.json'))), runtime: { engine: 'Chromium WASM', browser_version: browser.version(), onnxruntime_web_version: runtimeVersion, threads: 1 },
    n: result.samples.length, ...result, image_posts: 0, unexpected_requests: requests, elapsed_seconds: (Date.now() - started) / 1000,
    limitation: 'Numerical parity on twelve fixed validation images is serialization evidence, not disease-identification accuracy, clinical validation or arbitrary-face suitability.' };
  const destination = passed ? reportPath : path.join(root, `models/photo-v2/browser-parity-failed-${Date.now()}.json`);
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  savedReport = destination;
  console.log(JSON.stringify({ phase: 'browser_parity_complete', passed, n: report.n, maximum_absolute_tensor_error: result.maximum_absolute_tensor_error,
    maximum_absolute_logit_error: result.maximum_absolute_logit_error, matching_top_labels: result.matching_top_labels, report: path.relative(root, destination) }));
  if (!passed) throw new Error('The actual browser parity checks did not pass. Do not enable browser availability.');
} catch (error) {
  if (!savedReport) {
    const failurePath = path.join(root, `models/photo-v2/browser-parity-failed-${Date.now()}.json`);
    await writeFile(failurePath, JSON.stringify({ passed: false, model_version: reference.model_version,
      protocol: reference.protocol, binding: reference.binding, technical_error: error.message,
      elapsed_seconds: (Date.now() - started) / 1000, clinical_validation: false }, null, 2) + '\n', { flag: 'wx' });
    console.error('Preserved failed browser verification:', path.relative(root, failurePath));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
