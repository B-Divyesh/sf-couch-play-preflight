import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const port = 18081;
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'room-ready-browser-'));
const siteDir = await mkdtemp(join(tmpdir(), 'room-ready-site-'));
await cp(resolve('dist'), siteDir, { recursive: true });
const serverPath = resolve('server/target/release/room-ready-server');
const version = spawnSync(serverPath, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !version.stdout.trim()) throw new Error(`Release binary has no embedded build identity: ${version.stderr}`);
const embeddedBuildSha = version.stdout.trim();
const server = spawn(serverPath, [], {
  env: { ...process.env, PORT: String(port), DATABASE_URL: `sqlite://${join(dataDir, 'room-ready.db')}?mode=rwc`, DIST_DIR: siteDir, BUILD_SHA: 'runtime-must-not-override' },
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
  if (healthBody.build_sha !== embeddedBuildSha) throw new Error(`Health identity ${healthBody.build_sha} does not match the immutable binary ${embeddedBuildSha}`);
  const home = await fetch(baseUrl);
  for (const [header, expected] of Object.entries({
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  })) {
    if (home.headers.get(header) !== expected) throw new Error(`Missing or changed ${header}`);
  }
  const homeHtml = await home.text();
  const entryAsset = homeHtml.match(/<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/)?.[1];
  if (!entryAsset) throw new Error('Production entry asset is missing from the HTML shell');
  const asset = await fetch(`${baseUrl}${entryAsset}`);
  if (asset.headers.get('cache-control') !== 'public, max-age=31536000, immutable') throw new Error('Hashed assets are not immutable-cacheable');

  // Regression for verification-4 / controller evidence: a host read is a
  // separate HTTP connection immediately after POST. It must see the commit.
  const persistenceCreate = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', connection: 'close', 'x-forwarded-for': '198.51.100.80' },
    body: JSON.stringify({ game_label: 'Immediate host read regression' }),
  });
  if (persistenceCreate.status !== 200) throw new Error(`Create for immediate host read returned ${persistenceCreate.status}`);
  const persistenceRoom = await persistenceCreate.json();
  const immediateHostRead = await fetch(`${baseUrl}/api/rooms/${persistenceRoom.code}`, { headers: { connection: 'close', 'x-forwarded-for': '198.51.100.81' } });
  if (immediateHostRead.status !== 200) throw new Error(`POST /api/rooms then immediate host GET returned ${immediateHostRead.status}`);
  const immediateSnapshot = await immediateHostRead.json();
  if (immediateSnapshot.room.code !== persistenceRoom.code) throw new Error('Immediate host read returned the wrong room');
  // @claim:temporary-rooms — the API-created room advertises a six-hour
  // lifespan rather than retaining a room indefinitely.
  const roomLifetime = Date.parse(persistenceRoom.expires_at) - Date.now();
  if (roomLifetime < (5 * 60 + 59) * 60 * 1000 || roomLifetime > (6 * 60 + 1) * 60 * 1000) throw new Error(`Room lifetime was not six hours: ${roomLifetime}ms`);
  await fetch(`${baseUrl}/api/rooms/${persistenceRoom.code}`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ host_token: persistenceRoom.host_token }),
  });

  // Regression for verification-3: admission must stay capped even when every
  // guest reaches the count check at the same time.
  const capacityRoomResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game_label: 'Parallel join regression' }),
  });
  const capacityRoom = await capacityRoomResponse.json();
  const parallelJoins = await Promise.all(Array.from({ length: 24 }, (_, index) => fetch(`${baseUrl}/api/rooms/${capacityRoom.code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Guest ${index + 1}`, input_kind: 'touch' }),
  })));
  const acceptedJoins = parallelJoins.filter((response) => response.status === 200).length;
  const rejectedJoins = parallelJoins.filter((response) => response.status === 409).length;
  if (acceptedJoins !== 12 || rejectedJoins !== 12) throw new Error(`Parallel admission returned ${acceptedJoins} accepted and ${rejectedJoins} full responses`);
  const capacitySnapshot = await fetch(`${baseUrl}/api/rooms/${capacityRoom.code}`).then((response) => response.json());
  if (capacitySnapshot.players.length !== 12) throw new Error(`Parallel admission persisted ${capacitySnapshot.players.length} guests`);
  await fetch(`${baseUrl}/api/rooms/${capacityRoom.code}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host_token: capacityRoom.host_token }),
  });

  const limitedResponses = await Promise.all(Array.from({ length: 50 }, () => fetch(`${baseUrl}/api/rooms/ZZZZ`, {
    headers: { 'x-forwarded-for': '198.51.100.20' },
  })));
  const limited = limitedResponses.find((response) => response.status === 429);
  if (!limited || Number(limited.headers.get('retry-after')) < 1) throw new Error('API rate limit did not return 429 with a positive Retry-After');
  const independentClient = await fetch(`${baseUrl}/api/rooms/ZZZZ`, { headers: { 'x-forwarded-for': '198.51.100.21' } });
  if (independentClient.status === 429) throw new Error('API rate limit did not key the first forwarded client IP independently');

  const browser = await chromium.launch({ headless: true });
  // @claim:demo-isolated @claim:demo-privacy — a direct /demo visit is immediately useful, uses
  // only the demo: storage namespace, and never reaches a real room endpoint.
  const demoContext = await browser.newContext();
  const demo = await demoContext.newPage();
  const demoRequests = [];
  demo.on('request', (request) => demoRequests.push(request.url()));
  await demo.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' });
  await demo.getByRole('heading', { name: 'See a ready room before you host.' }).waitFor();
  await demo.getByText('Demo — sample data, nothing is saved').waitFor();
  await demo.getByText('Mina').waitFor();
  // @claim:sample-guests — the one-click sample is a real-looking, populated
  // room rather than an empty placeholder.
  if (await demo.locator('.player').count() !== 4) throw new Error('Demo did not contain four sample guests');
  if (demoRequests.some((url) => !url.startsWith(baseUrl) || new URL(url).pathname.startsWith('/api/'))) throw new Error('Demo contacted a non-demo service');
  const demoKeys = await demo.evaluate(() => Object.keys(sessionStorage));
  if (!demoKeys.length || demoKeys.some((key) => !key.startsWith('demo:'))) throw new Error(`Demo storage is not isolated: ${demoKeys.join(', ')}`);
  await demo.getByRole('button', { name: 'Reset demo' }).click();
  await demo.getByText('Family picture quiz').waitFor();
  await demo.getByRole('link', { name: 'Start for real' }).click();
  await demo.waitForURL(`${baseUrl}/`);
  const keysAfterLeavingDemo = await demo.evaluate(() => Object.keys(sessionStorage));
  if (keysAfterLeavingDemo.some((key) => key.startsWith('demo:'))) throw new Error('Demo data remained after starting for real');
  await demoContext.close();

  // The production CSP correctly disallows inline scripts. Bypass it only in
  // this test context so axe can be injected without weakening the product.
  const hostContext = await browser.newContext({ bypassCSP: true });
  const host = await hostContext.newPage();
  const pageErrors = [];
  const externalRequests = [];
  host.on('pageerror', (error) => pageErrors.push(error.message));
  host.on('request', (request) => { if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url()); });
  await host.goto(baseUrl, { waitUntil: 'networkidle' });
  // @claim:no-account-or-install — the complete host-and-guest flow starts in
  // the browser with no account fields and no install manifest.
  const accountOrInstallControls = await host.locator('input[type="email"], input[type="password"], link[rel="manifest"]').count();
  if (accountOrInstallControls) throw new Error('The no-account, no-install start flow changed');
  await host.getByLabel('What are you playing? Optional').fill('Keyboard trivia');
  await host.getByRole('button', { name: /Open a real room/ }).click();
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

  const routeA11yContext = await browser.newContext({ bypassCSP: true });
  const routeA11y = await routeA11yContext.newPage();
  for (const path of ['/', '/demo', '/privacy', '/terms']) {
    await routeA11y.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    await routeA11y.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
    const routeViolations = await routeA11y.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations);
    if (routeViolations.length) throw new Error(`axe violations on ${path}: ${routeViolations.map((violation) => violation.id).join(', ')}`);
  }
  await routeA11yContext.close();

  // @claim:offline-reload — use an isolated context to prove a versioned
  // worker removes its stale cache and still serves the shell offline.
  const updateContext = await browser.newContext();
  const updatePage = await updateContext.newPage();
  await updatePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await updatePage.evaluate(() => navigator.serviceWorker.ready);
  await updatePage.reload({ waitUntil: 'networkidle' });
  await updatePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheBeforeUpdate = await updatePage.evaluate(() => caches.keys());
  const oldCache = cacheBeforeUpdate.find((cache) => cache.startsWith('room-ready-shell-'));
  if (!oldCache) throw new Error(`Initial service worker cache was missing: ${cacheBeforeUpdate.join(', ')}`);
  const serviceWorkerPath = join(siteDir, 'sw.js');
  const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
  const newCache = 'room-ready-shell-update-regression';
  await writeFile(serviceWorkerPath, serviceWorker.replace(oldCache, newCache));
  await updatePage.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  await updatePage.waitForFunction(async ({ stale, current }) => {
    const keys = await caches.keys();
    return keys.includes(current) && !keys.includes(stale);
  }, { stale: oldCache, current: newCache });
  await updateContext.setOffline(true);
  await updatePage.reload({ waitUntil: 'domcontentloaded' });
  await updatePage.getByText('You’re offline. Existing results stay visible; updates will retry when you reconnect.').waitFor();
  await updateContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, bypassCSP: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  const mobileLayout = await mobile.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobileLayout.scrollWidth > mobileLayout.width) throw new Error(`390px page overflows horizontally (${mobileLayout.scrollWidth}px)`);
  await mobile.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
  const mobileViolations = await mobile.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations);
  if (mobileViolations.length) throw new Error(`axe violations at 390px: ${mobileViolations.map((violation) => violation.id).join(', ')}`);
  await mobileContext.close();
  await guestContext.close();
  await hostContext.close();
  await browser.close();
  console.log('Immediate room persistence, demo isolation, parallel admission, forwarded-IP rate policy, host/keyboard guest, axe, privacy, service-worker update/offline, and 390px mobile smoke passed.');
} finally {
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
  await rm(siteDir, { recursive: true, force: true });
}
