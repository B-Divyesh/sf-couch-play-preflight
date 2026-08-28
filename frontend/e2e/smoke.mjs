import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 18081;
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'room-ready-browser-'));
const server = spawn(resolve('server/target/release/room-ready-server'), [], {
  env: { ...process.env, PORT: String(port), DATABASE_URL: `sqlite://${join(dataDir, 'room-ready.db')}?mode=rwc`, DIST_DIR: resolve('dist'), BUILD_SHA: 'browser-smoke' },
  stdio: 'pipe',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch { /* startup race */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Room Ready did not start: ${(await new Response(server.stderr).text())}`);
}

try {
  await waitForServer();
  const health = await fetch(`${baseUrl}/health`);
  const healthBody = await health.json();
  if (healthBody.build_sha !== 'browser-smoke') throw new Error('Health endpoint lost its runtime build identity');
  const home = await fetch(baseUrl);
  for (const [header, expected] of Object.entries({
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  })) {
    if (home.headers.get(header) !== expected) throw new Error(`Missing or changed ${header}`);
  }
  const asset = await fetch(`${baseUrl}/assets/index-6F-2nOcD.js`);
  if (asset.headers.get('cache-control') !== 'public, max-age=31536000, immutable') throw new Error('Hashed assets are not immutable-cacheable');
  const browser = await chromium.launch({ headless: true });
  // The production CSP correctly disallows inline scripts. Bypass it only in
  // this test context so axe can be injected without weakening the product.
  const hostContext = await browser.newContext({ bypassCSP: true });
  const host = await hostContext.newPage();
  const pageErrors = [];
  const externalRequests = [];
  host.on('pageerror', (error) => pageErrors.push(error.message));
  host.on('request', (request) => { if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url()); });
  await host.goto(baseUrl, { waitUntil: 'networkidle' });
  await host.getByLabel('What are you playing? Optional').fill('Keyboard trivia');
  await host.getByRole('button', { name: /Open a test room/ }).click();
  await host.waitForURL(/\/host\?room=/);
  const code = await host.locator('.room-code').textContent();
  if (!code || !/^[A-Z]{4}$/.test(code)) throw new Error('Host did not receive a room code');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  guest.on('pageerror', (error) => pageErrors.push(error.message));
  await guest.goto(`${baseUrl}/join?room=${code}`);
  await guest.getByLabel('Name shown to the host').fill('Sam');
  await guest.getByRole('radio', { name: /Keyboard/ }).check();
  await guest.getByRole('button', { name: 'Join and run checks' }).click();
  const practice = guest.locator('#practice-pad');
  await practice.focus();
  await practice.press('a');
  await practice.press('ArrowRight');
  await practice.press('b');
  await guest.getByText('Practice passed.').waitFor();

  await host.getByLabel('Big screen is connected and visible').check();
  await host.getByRole('button', { name: 'Save session fit' }).click();
  await host.getByText('The room is ready.').waitFor();

  await host.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
  const violations = await host.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations);
  if (violations.length) throw new Error(`axe violations: ${violations.map((violation) => violation.id).join(', ')}`);
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join('; ')}`);
  if (externalRequests.length) throw new Error(`Unexpected third-party requests: ${externalRequests.join(', ')}`);

  await host.goto(baseUrl, { waitUntil: 'networkidle' });
  await host.evaluate(() => navigator.serviceWorker.ready);
  await host.reload({ waitUntil: 'networkidle' });
  await host.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await hostContext.setOffline(true);
  await host.reload({ waitUntil: 'domcontentloaded' });
  await host.getByText('You’re offline. Existing results stay visible; updates will retry when you reconnect.').waitFor();
  await hostContext.setOffline(false);

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  const mobileLayout = await mobile.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobileLayout.scrollWidth > mobileLayout.width) throw new Error(`390px page overflows horizontally (${mobileLayout.scrollWidth}px)`);
  await mobileContext.close();
  await guestContext.close();
  await hostContext.close();
  await browser.close();
  console.log('Desktop host/keyboard guest/axe/privacy/offline and 390px mobile smoke passed.');
} finally {
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
}
