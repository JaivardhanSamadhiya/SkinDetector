import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

// Visual QA uses licensed dataset samples only, never a user's selected image.
let configuration = {};
if (process.argv.includes('--stdin-config')) {
  // Private preview credentials stay in memory and are supplied through hidden stdin.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stderr.write('Ready for preview configuration on stdin (input is hidden).\n');
  const raw = await new Promise(resolve => {
    let input = '';
    function onData(chunk) {
      input += chunk;
      if (input.includes('\n') || input.includes('\r')) {
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause(); resolve(input.trim());
      }
    }
    process.stdin.on('data', onData); process.stdin.resume();
  });
  configuration = JSON.parse(raw);
}
const baseURL = configuration.baseURL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const origin = new URL(baseURL).origin;
const prefix = configuration.authorization ? 'hosted-' : '';
const destination = 'artifacts/screenshots';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  if (configuration.authorization) await page.route('**/*', route => {
    const headers = { ...route.request().headers() };
    if (new URL(route.request().url()).origin === origin) headers['OAI-Sites-Authorization'] = `Bearer ${configuration.authorization}`;
    return route.continue({ headers });
  });
  let modelDownloaded = false;
  let hostingSecurityPosts = 0;
  const posts = [];
  page.on('request', request => {
    if (request.method() !== 'POST') return;
    const path = new URL(request.url()).pathname;
    // The hosting provider injects its bot-detection challenge. Track it
    // separately; it is not an application image-inference request.
    if (path.startsWith('/cdn-cgi/challenge-platform/')) hostingSecurityPosts++;
    else posts.push(path);
  });
  page.on('response', response => { if (new URL(response.url()).pathname.endsWith('/model/model.onnx') && response.ok()) modelDownloaded = true; });
  for (const [name, route] of [['landing', '/'], ['analysis', '/analysis/'], ['research', '/research/']]) {
    await page.goto(new URL(route, baseURL).href);
    await page.evaluate(() => document.fonts.ready);
    if (name === 'research') await page.locator('.metric-card').first().waitFor();
    await page.screenshot({ path: `${destination}/${prefix}${name}.png`, fullPage: true });
  }
  const manifest = JSON.parse(await readFile('public/demo/manifest.json', 'utf8'));
  const sample = (manifest.images || manifest)[0];
  await page.goto(new URL('/analysis/', baseURL).href);
  await page.getByLabel('Choose a skin image', { exact: true }).setInputFiles(`public${sample.path}`);
  await page.getByRole('radio', { name: 'Dermoscopic image', exact: true }).check();
  await page.getByRole('checkbox', { name: 'I understand this is research, not a diagnosis, and I have permission to use this image.', exact: true }).check();
  await page.getByRole('button', { name: 'Analyze image', exact: true }).click();
  await page.waitForURL('**/results/');
  await page.getByRole('heading', { name: 'Model ranking', exact: true }).waitFor();
  if (!modelDownloaded || posts.length) throw new Error(`Expected genuine browser inference without an image POST: ${JSON.stringify({ model_downloaded: modelDownloaded, post_paths: posts })}`);
  const parity = JSON.parse(await readFile('models/browser_parity.json', 'utf8'));
  const expected = parity.samples.find(s => s.filename === sample.path.split('/').pop());
  const rows = await page.locator('.score-row > div:first-child').evaluateAll(elements => elements.map(e => ({ label: e.children[0].textContent, score: Number(e.children[1].textContent) })));
  if (rows.length !== 7 || rows.some((row, i) => row.label !== expected.scores[i].label || Math.abs(row.score - expected.scores[i].score) > .001)) throw new Error('Browser model scores differ from verified PyTorch inference.');
  // Full-page capture should not carry sticky-element positions from the
  // scroll needed to reach the preceding analysis form's submit button.
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: `${destination}/${prefix}results.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/', baseURL).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${destination}/${prefix}mobile.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile page overflows horizontally.');
  console.log(JSON.stringify({ origin, real_inference: true, browser_pytorch_score_parity: true, image_posts: posts.length, hosting_security_posts: hostingSecurityPosts, desktop_mobile_screenshots: 5 }));
} finally { await browser.close(); }
