import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const grepIndex = process.argv.indexOf('--grep');
const grep = grepIndex >= 0 ? process.argv[grepIndex + 1] : undefined;
const selectedClaim = grep?.startsWith('@claim:') ? grep.slice('@claim:'.length) : undefined;
if (grep && !selectedClaim) throw new Error(`Unsupported browser-test filter: ${grep}`);

const port = 18081;
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'room-ready-browser-'));
const siteDir = await mkdtemp(join(tmpdir(), 'room-ready-site-'));
await cp(resolve('dist'), siteDir, { recursive: true });
const serverPath = resolve('server/target/release/room-ready-server');
const version = spawnSync(serverPath, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !version.stdout.trim()) throw new Error(`Release binary has no embedded build identity: ${version.stderr}`);
const embeddedBuildSha = version.stdout.trim();
let serverOutput = '';
const server = spawn(serverPath, [], {
  env: { ...process.env, PORT: String(port), DATABASE_URL: `sqlite://${join(dataDir, 'room-ready.db')}?mode=rwc`, DIST_DIR: siteDir, NETWORK_HASH_KEY: 'browser-test-key', BUILD_SHA: 'runtime-must-not-override' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const forwarded = (address) => ({ 'content-type': 'application/json', 'x-forwarded-for': address });

async function waitFor(url, attempts = 60, output = () => serverOutput) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* startup race */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Room Ready did not start at ${url}: ${output()}`);
}

async function createRoom(gameLabel = 'Browser test', discoverable = true, address = '198.51.100.40') {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: forwarded(address),
    body: JSON.stringify({ game_label: gameLabel, discoverable }),
  });
  assert(response.status === 200, `Create room returned ${response.status}`);
  return response.json();
}

async function createLocalRoom(gameLabel = 'Browser test', discoverable = true) {
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ game_label: gameLabel, discoverable }),
  });
  assert(response.status === 200, `Create local room returned ${response.status}`);
  return response.json();
}

async function closeRoom(room) {
  await fetch(`${baseUrl}/api/rooms/${room.code}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host_token: room.host_token }),
  });
}

async function hostPage(browser, room, options = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript(({ code, token }) => sessionStorage.setItem(`host:${code}`, token), { code: room.code, token: room.host_token });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/host?room=${room.code}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.room-code').waitFor();
  return { context, page };
}

const claims = {
  async 'demo-isolated'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/demo`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Demo — sample data, nothing is saved').waitFor();
    const keys = await page.evaluate(() => Object.keys(sessionStorage));
    assert(keys.length > 0 && keys.every((key) => key.startsWith('demo:')), `Demo storage is not isolated: ${keys.join(', ')}`);
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByText('Family picture quiz').waitFor();
    await page.getByRole('link', { name: 'Start for real' }).click();
    await page.waitForURL(`${baseUrl}/`);
    assert(!(await page.evaluate(() => Object.keys(sessionStorage))).some((key) => key.startsWith('demo:')), 'Demo data remained after Start for real');
    await context.close();
  },

  async 'sample-guests'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/demo`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'See a ready room before you host.' }).waitFor();
    assert(await page.locator('.player').count() === 4, 'Demo did not contain exactly four sample guests');
    for (const name of ['Mina', 'Tom', 'Ari', 'Jo']) await page.getByRole('heading', { name }).waitFor();
    await context.close();
  },

  async 'demo-privacy'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(`${baseUrl}/demo`, { waitUntil: 'networkidle' });
    await page.getByText('Demo — sample data, nothing is saved').waitFor();
    assert(requests.every((url) => url.startsWith(baseUrl)), `Demo made a third-party request: ${requests.join(', ')}`);
    assert(requests.every((url) => !new URL(url).pathname.startsWith('/api/')), 'Demo contacted the room API');
    await context.close();
  },

  async 'no-account-or-install'({ browser }) {
    const context = await browser.newContext();
    const host = await context.newPage();
    await host.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    assert(await host.locator('input[type="email"], input[type="password"], link[rel="manifest"]').count() === 0, 'An account or install control appeared');
    await host.getByRole('button', { name: /Open a real room/ }).click();
    await host.waitForURL(/\/host\?room=/);
    await host.locator('.room-code').waitFor();
    await context.close();
  },

  async 'offline-reload'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/demo`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.getByText('Demo — sample data, nothing is saved').waitFor();
    await context.setOffline(true);
    await page.goto(`${baseUrl}/demo`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.getByText('You’re offline. Existing results stay visible; updates will retry when you reconnect.').waitFor();
    await page.getByRole('heading', { name: 'See a ready room before you host.' }).waitFor();
    await context.close();
  },

  async 'local-room-discovery'({ browser }) {
    const context = await browser.newContext();
    const host = await context.newPage();
    await host.goto(baseUrl);
    await host.getByLabel('What are you playing? Optional').fill('Same network quiz');
    await host.getByRole('button', { name: /Open a real room/ }).click();
    await host.locator('.room-code').waitFor();
    const code = (await host.locator('.room-code').textContent()).trim();
    const guest = await context.newPage();
    await guest.goto(`${baseUrl}/join`, { waitUntil: 'domcontentloaded' });
    await guest.getByRole('button', { name: new RegExp(`${code}.*Same network quiz`) }).waitFor();
    await guest.getByRole('button', { name: new RegExp(code) }).click();
    assert(await guest.getByLabel('Room code').inputValue() === code, 'Network discovery did not select the room');
    await guest.getByLabel('Room code').fill('ABCD');
    assert(await guest.getByLabel('Room code').inputValue() === 'ABCD', 'Manual room-code fallback is unavailable');
    await context.close();
  },

  async 'join-card'({ browser }) {
    const room = await createRoom('Join card check');
    const { context, page } = await hostPage(browser, room);
    await page.locator('#qr').waitFor();
    await page.waitForFunction(() => document.querySelector('#qr')?.naturalWidth > 0);
    await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printCalled = 'true'; }; });
    await page.getByRole('button', { name: 'Print join card' }).click();
    assert(await page.locator('html').getAttribute('data-print-called') === 'true', 'Print join card did not invoke printing');
    await page.getByRole('button', { name: 'TV view' }).click();
    assert(await page.locator('body').evaluate((body) => body.classList.contains('presenting')), 'TV view did not activate');
    await context.close();
    await closeRoom(room);
  },

  async 'guest-capacity'() {
    const room = await createRoom('Capacity check');
    const responses = await Promise.all(Array.from({ length: 24 }, (_, index) => fetch(`${baseUrl}/api/rooms/${room.code}/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Guest ${index + 1}`, input_kind: 'touch' }),
    })));
    assert(responses.filter((response) => response.status === 200).length === 12, 'Room did not accept exactly 12 guests');
    assert(responses.filter((response) => response.status === 409).length === 12, 'Room did not reject every guest above capacity');
    const snapshot = await fetch(`${baseUrl}/api/rooms/${room.code}`).then((response) => response.json());
    assert(snapshot.players.length === 12, `Room persisted ${snapshot.players.length} guests instead of 12`);
    await closeRoom(room);
  },

  async 'capability-checks'({ browser }) {
    const room = await createRoom('Capability check');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/join?room=${room.code}`);
    await page.getByLabel('Name shown to the host').fill('Sam');
    await page.getByRole('radio', { name: /Keyboard/ }).check();
    await page.getByRole('button', { name: 'Join and run checks' }).click();
    for (const label of ['Secure browser', 'Same local network', 'Keyboard', 'Standard motion']) await page.getByText(label, { exact: true }).waitFor();
    await context.close();
    await closeRoom(room);
  },

  async 'input-practice'({ browser }) {
    const room = await createRoom('Practice check');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/join?room=${room.code}`);
    await page.getByLabel('Name shown to the host').fill('Key guest');
    await page.getByRole('radio', { name: /Keyboard/ }).check();
    await page.getByRole('button', { name: 'Join and run checks' }).click();
    const pad = page.locator('#practice-pad');
    await pad.focus();
    await pad.press('a'); await pad.press('ArrowRight'); await pad.press('b');
    await page.getByText('Practice passed.').waitFor();
    const snapshot = await fetch(`${baseUrl}/api/rooms/${room.code}`).then((response) => response.json());
    assert(snapshot.players[0]?.practice_ok === true, 'Practice result did not persist for the host');
    await context.close();
    await closeRoom(room);
  },

  async 'touch-authenticity'({ browser }) {
    const mouseRoom = await createLocalRoom('Mouse touch rejection');
    const mouseContext = await browser.newContext({ hasTouch: false });
    const mousePage = await mouseContext.newPage();
    await mousePage.goto(`${baseUrl}/join?room=${mouseRoom.code}`);
    await mousePage.getByLabel('Name shown to the host').fill('Mouse guest');
    await mousePage.getByRole('button', { name: 'Join and run checks' }).click();
    await mousePage.getByText('The browser cannot see this input yet.').waitFor();
    await mousePage.locator('#practice-pad').click();
    await mousePage.locator('#practice-pad').click();
    await mousePage.locator('#practice-pad').click();
    assert((await mousePage.locator('#practice-count').textContent()) === '0 of 3', 'Mouse clicks were counted as touch practice');
    assert(await mousePage.getByText('Practice passed.').count() === 0, 'Mouse clicks incorrectly passed touch practice');
    await mouseContext.close();
    await closeRoom(mouseRoom);

    const touchRoom = await createLocalRoom('Touch acceptance');
    const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(`${baseUrl}/join?room=${touchRoom.code}`);
    await touchPage.getByLabel('Name shown to the host').fill('Touch guest');
    await touchPage.getByRole('button', { name: 'Join and run checks' }).click();
    const pad = touchPage.locator('#practice-pad');
    await touchPage.waitForFunction(() => navigator.maxTouchPoints > 0);
    for (let expected = 1; expected <= 3; expected += 1) {
      await pad.tap({ position: { x: 24 + expected, y: 24 + expected } });
      await touchPage.waitForFunction((count) => document.querySelector('#practice-count')?.textContent === `${count} of 3`, expected);
    }
    await touchPage.getByText('Practice passed.').waitFor();
    const snapshot = await fetch(`${baseUrl}/api/rooms/${touchRoom.code}`).then((response) => response.json());
    assert(snapshot.players[0]?.practice_ok === true && snapshot.players[0]?.input_ok === true, 'Three touch inputs did not persist a successful touch practice result');
    await touchContext.close();
    await closeRoom(touchRoom);
  },

  async 'large-text'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Large text' }).click();
    assert(await page.locator('html').evaluate((element) => getComputedStyle(element).fontSize === '19px'), 'Large text did not reach 19px');
    await page.reload();
    assert(await page.getByRole('button', { name: 'Standard text' }).getAttribute('aria-pressed') === 'true', 'Large-text preference did not persist');
    await context.close();
  },

  async 'reduced-motion'({ browser }) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(baseUrl);
    const duration = await page.locator('.primary').evaluate((element) => getComputedStyle(element).transitionDuration);
    assert(Number.parseFloat(duration) <= 0.000001, `Reduced-motion transition remained ${duration}`);
    await context.close();
  },

  async 'privacy-no-tracking'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const external = [];
    page.on('request', (request) => { if (!request.url().startsWith(baseUrl)) external.push(request.url()); });
    await page.goto(`${baseUrl}/privacy`, { waitUntil: 'networkidle' });
    await page.getByText('does not ask for an account, email address, or contact details').waitFor();
    assert((await context.cookies()).length === 0, 'Product set a cookie');
    assert(external.length === 0, `Product contacted a third party: ${external.join(', ')}`);
    assert(await page.locator('input[type="email"], input[type="tel"]').count() === 0, 'Product requested contact data');
    await context.close();
  },

  async 'game-fit-not-certification'({ browser }) {
    const room = await createLocalRoom('Input mix comparison');
    const host = await hostPage(browser, room);
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`${baseUrl}/join?room=${room.code}`);
    await guest.getByLabel('Name shown to the host').fill('Keyboard guest');
    await guest.getByRole('radio', { name: /Keyboard/ }).check();
    await guest.getByRole('button', { name: 'Join and run checks' }).click();
    const pad = guest.locator('#practice-pad');
    await pad.focus();
    await pad.press('a'); await pad.press('ArrowRight'); await pad.press('b');
    await guest.getByText('Practice passed.').waitFor();
    const snapshot = await fetch(`${baseUrl}/api/rooms/${room.code}`).then((response) => response.json());
    assert(snapshot.players[0]?.practice_ok === true && snapshot.players[0]?.input_kind === 'keyboard', 'Keyboard guest result did not persist before the host comparison');
    await host.page.reload({ waitUntil: 'domcontentloaded' });
    await host.page.locator('.room-code').waitFor();
    const initialStatuses = await host.page.locator('.status-row').allTextContents();
    assert(initialStatuses.some((status) => status.includes('Fits setup')), `Host did not show its persisted input comparison: ${JSON.stringify(initialStatuses)}`);

    const keyboardInput = host.page.locator('input[name="inputs"][value="keyboard"]');
    await keyboardInput.uncheck();
    await host.page.getByRole('button', { name: 'Save session fit' }).click();
    await host.page.getByText('Session fit saved. Guest readiness has been recalculated.').waitFor();
    const withoutKeyboard = await fetch(`${baseUrl}/api/rooms/${room.code}`).then((response) => response.json());
    assert(!withoutKeyboard.room.accepted_inputs.split(',').includes('keyboard'), 'Host input selection still accepted keyboard after it was removed');
    await host.page.reload({ waitUntil: 'domcontentloaded' });
    await host.page.locator('.room-code').waitFor();
    const removedStatuses = await host.page.locator('.status-row').allTextContents();
    assert(removedStatuses.some((status) => status.includes('Not selected')), `Host did not show the removed keyboard input: ${JSON.stringify(removedStatuses)}`);
    await keyboardInput.check();
    await host.page.getByRole('button', { name: 'Save session fit' }).click();
    await host.page.getByText('Session fit saved. Guest readiness has been recalculated.').waitFor();
    const restoredKeyboard = await fetch(`${baseUrl}/api/rooms/${room.code}`).then((response) => response.json());
    assert(restoredKeyboard.room.accepted_inputs.split(',').includes('keyboard'), 'Host input selection did not restore keyboard');
    await host.page.reload({ waitUntil: 'domcontentloaded' });
    await host.page.locator('.room-code').waitFor();
    const restoredStatuses = await host.page.locator('.status-row').allTextContents();
    assert(restoredStatuses.some((status) => status.includes('Fits setup')), `Host did not restore the keyboard input comparison: ${JSON.stringify(restoredStatuses)}`);
    await guestContext.close();
    await host.context.close();
    await closeRoom(room);
  },

  async 'session-token-lifetime'({ browser }) {
    const hostContext = await browser.newContext();
    const host = await hostContext.newPage();
    await host.goto(baseUrl);
    await host.getByRole('button', { name: /Open a real room/ }).click();
    await host.locator('.room-code').waitFor();
    const code = (await host.locator('.room-code').textContent()).trim();
    const hostToken = await host.evaluate((roomCode) => sessionStorage.getItem(`host:${roomCode}`), code);
    assert(hostToken, 'Host token was not kept in session storage');

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`${baseUrl}/join?room=${code}`);
    await guest.getByLabel('Name shown to the host').fill('Session guest');
    await guest.getByRole('radio', { name: /Keyboard/ }).check();
    await guest.getByRole('button', { name: 'Join and run checks' }).click();
    await guest.locator('#practice-pad').waitFor();
    const guestToken = await guest.evaluate((roomCode) => sessionStorage.getItem(`guest:${roomCode}`), code);
    assert(guestToken, 'Guest token was not kept in session storage');
    await guestContext.close();
    await hostContext.close();

    const newBrowserSession = await browser.newContext();
    const newHost = await newBrowserSession.newPage();
    await newHost.goto(`${baseUrl}/host?room=${code}`);
    await newHost.getByRole('heading', { name: 'Host access is not available in this browser.' }).waitFor();
    const keys = await newHost.evaluate(() => Object.keys(sessionStorage));
    assert(!keys.some((key) => key.startsWith('host:') || key.startsWith('guest:')), `Room token survived a closed browser session: ${keys.join(', ')}`);
    await newBrowserSession.close();
    await closeRoom({ code, host_token: hostToken });
  },

  async 'immediate-host-read'({ browser }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let blockedFirstRead = false;
    await page.route(/\/api\/rooms\/[A-Z]{4}$/, async (route) => {
      if (route.request().method() === 'GET' && !blockedFirstRead) {
        blockedFirstRead = true;
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Room not found or expired' }) });
      } else await route.continue();
    });
    await page.goto(baseUrl);
    await page.getByRole('button', { name: /Open a real room/ }).click();
    await page.waitForURL(/\/host\?room=/);
    await page.locator('.room-code').waitFor({ timeout: 10_000 });
    assert(blockedFirstRead, 'The first host read was not intercepted');
    assert(await page.getByRole('heading', { name: 'We couldn’t find this room.' }).count() === 0, 'A transient first 404 replaced the host board');
    await context.close();
  },
};

async function runGeneralQa(browser) {
  const health = await fetch(`${baseUrl}/health`);
  const healthBody = await health.json();
  assert(healthBody.build_sha === embeddedBuildSha, `Health identity ${healthBody.build_sha} does not match ${embeddedBuildSha}`);
  assert(serverOutput.includes('database_config') && serverOutput.includes('network_key_config'), `Startup configuration line was missing: ${serverOutput}`);

  const home = await fetch(baseUrl);
  for (const [header, expected] of Object.entries({
    'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  })) assert(home.headers.get(header) === expected, `Missing or changed ${header}`);
  assert(home.headers.get('set-cookie') === null, 'Home response set a cookie');
  const homeHtml = await home.text();
  for (const marker of ['rel="canonical"', 'property="og:image"', 'name="twitter:card"', 'rel="apple-touch-icon"']) assert(homeHtml.includes(marker), `HTML metadata is missing ${marker}`);
  const entryAsset = homeHtml.match(/<script type="module" crossorigin src="(\/assets\/index-[^"]+\.js)"><\/script>/)?.[1];
  assert(entryAsset, 'Production entry asset is missing');
  const asset = await fetch(`${baseUrl}${entryAsset}`);
  assert(asset.headers.get('cache-control') === 'public, max-age=31536000, immutable', 'Hashed asset cache policy changed');
  assert((await fetch(`${baseUrl}/demo`)).status === 200, 'Direct demo route did not return 200');
  assert((await fetch(`${baseUrl}/not-a-real-route`)).status === 404, 'Unknown route did not return 404');
  const missingApi = await fetch(`${baseUrl}/api/not-a-route`);
  assert(missingApi.status === 404 && missingApi.headers.get('content-type')?.includes('application/json'), 'Unknown API route did not return JSON 404');

  const room = await createRoom('Independent connection regression', true, '198.51.100.80');
  const immediate = await fetch(`${baseUrl}/api/rooms/${room.code}`, { headers: { connection: 'close', 'x-forwarded-for': '198.51.100.81' } });
  assert(immediate.status === 200, `POST then immediate independent GET returned ${immediate.status}`);
  assert((await immediate.json()).room.code === room.code, 'Immediate read returned the wrong room');
  const sameNetwork = await fetch(`${baseUrl}/api/rooms/${room.code}/network`, { headers: { 'x-forwarded-for': '198.51.100.80' } }).then((response) => response.json());
  const otherNetwork = await fetch(`${baseUrl}/api/rooms/${room.code}/network`, { headers: { 'x-forwarded-for': '198.51.100.81' } }).then((response) => response.json());
  assert(sameNetwork.same_network && !otherNetwork.same_network, 'Network comparison did not distinguish clients');
  await closeRoom(room);

  const invalid = await fetch(`${baseUrl}/api/rooms/ABC1`);
  assert(invalid.status === 400 && invalid.headers.get('content-type')?.includes('application/json'), 'Invalid API input did not return JSON 400');
  const limitedResponses = await Promise.all(Array.from({ length: 55 }, () => fetch(`${baseUrl}/api/rooms/ZZZZ`, { headers: { 'x-forwarded-for': '198.51.100.20' } })));
  const limited = limitedResponses.find((response) => response.status === 429);
  assert(limited && Number(limited.headers.get('retry-after')) >= 1, 'Rate limit did not return 429 with Retry-After');
  assert((await fetch(`${baseUrl}/api/rooms/ZZZZ`, { headers: { 'x-forwarded-for': '198.51.100.21' } })).status !== 429, 'Rate limit was not keyed per forwarded client');

  const a11yContext = await browser.newContext({ bypassCSP: true });
  const page = await a11yContext.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  for (const path of ['/', '/demo', '/privacy', '/terms', '/join', '/not-a-real-route']) {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    if (path === '/not-a-real-route') assert(response.status() === 404, 'Browser missing route response was not 404');
    await page.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations);
    assert(violations.length === 0, `axe violations on ${path}: ${violations.map((item) => item.id).join(', ')}`);
    assert(await page.locator('h1').count() === 1, `${path} does not have exactly one h1`);
  }
  await page.goto(baseUrl);
  await page.keyboard.press('Tab');
  assert(await page.locator(':focus').getAttribute('class') === 'skip-link', 'First Tab did not focus the skip link');
  await page.keyboard.press('Enter');
  assert(await page.evaluate(() => document.activeElement?.id) === 'main', 'Skip link did not move focus to main');
  await page.getByRole('link', { name: 'Demo', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
  assert(await page.evaluate(() => document.activeElement?.tagName) === 'H1', 'SPA navigation did not focus the new h1');
  assert((await page.locator('#route-status').textContent()).includes('See a ready room'), 'Route change was not announced');
  assert(pageErrors.length === 0, `Browser errors: ${pageErrors.join('; ')}`);
  await a11yContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, bypassCSP: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const mobileLayout = await mobile.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(mobileLayout.scrollWidth <= mobileLayout.width, `390px page overflows (${mobileLayout.scrollWidth}px)`);
  const smallTargets = await mobile.locator('a, button').evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visuallyHiddenSkipLink = element.classList.contains('skip-link') && document.activeElement !== element;
    return !visuallyHiddenSkipLink && style.display !== 'none' && style.visibility !== 'hidden' && (box.width < 44 || box.height < 44);
  }).map((element) => ({ text: element.textContent?.trim(), box: element.getBoundingClientRect().toJSON() })));
  assert(smallTargets.length === 0, `Mobile targets below 44px: ${JSON.stringify(smallTargets)}`);
  await mobile.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
  const mobileViolations = await mobile.evaluate(async () => (await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations);
  assert(mobileViolations.length === 0, `Mobile axe violations: ${mobileViolations.map((item) => item.id).join(', ')}`);
  await mobile.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflowed at 200% text');
  await mobileContext.close();

  const serviceWorkerPath = join(siteDir, 'sw.js');
  const workerBefore = await readFile(serviceWorkerPath, 'utf8');
  const updateContext = await browser.newContext();
  const updatePage = await updateContext.newPage();
  await updatePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await updatePage.evaluate(() => navigator.serviceWorker.ready);
  await updatePage.reload({ waitUntil: 'domcontentloaded' });
  await updatePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const oldCache = (await updatePage.evaluate(() => caches.keys())).find((name) => name.startsWith('room-ready-shell-'));
  assert(oldCache, 'Initial service-worker cache was missing');
  const newCache = 'room-ready-shell-update-regression';
  await writeFile(serviceWorkerPath, workerBefore.replace(oldCache, newCache));
  await updatePage.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  await updatePage.waitForFunction(async ({ stale, current }) => {
    const keys = await caches.keys();
    return keys.includes(current) && !keys.includes(stale);
  }, { stale: oldCache, current: newCache });
  await updateContext.close();

  const portOnlyDir = await mkdtemp(join(tmpdir(), 'room-ready-port-only-'));
  const portOnlyPort = 18082;
  let portOnlyOutput = '';
  const portOnly = spawn(serverPath, [], { cwd: portOnlyDir, env: { PATH: process.env.PATH, PORT: String(portOnlyPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  portOnly.stdout.on('data', (chunk) => { portOnlyOutput += chunk.toString(); });
  portOnly.stderr.on('data', (chunk) => { portOnlyOutput += chunk.toString(); });
  try {
    await waitFor(`http://127.0.0.1:${portOnlyPort}/health`, 60, () => portOnlyOutput);
    await new Promise((done) => setTimeout(done, 100));
    assert(portOnlyOutput.includes('database_config') && portOnlyOutput.includes('defaulted'), `Port-only startup did not log defaulted database config: ${portOnlyOutput}`);
    assert(portOnlyOutput.includes('network_key_config') && portOnlyOutput.includes('generated'), `Port-only startup did not log generated key config: ${portOnlyOutput}`);
  } finally {
    portOnly.kill('SIGTERM');
    await rm(portOnlyDir, { recursive: true, force: true });
  }
}

try {
  await waitFor(`${baseUrl}/health`);
  const browser = await chromium.launch({ headless: true });
  try {
    if (selectedClaim) {
      assert(claims[selectedClaim], `No independently selectable test exists for @claim:${selectedClaim}`);
      await claims[selectedClaim]({ browser });
      console.log(`PASS @claim:${selectedClaim}`);
    } else {
      for (const [id, test] of Object.entries(claims)) {
        await test({ browser });
        console.log(`PASS @claim:${id}`);
      }
      await runGeneralQa(browser);
      console.log('PASS complete browser, API, accessibility, privacy, offline/update, response-policy, startup, desktop, and 390px mobile QA');
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
  await rm(siteDir, { recursive: true, force: true });
}
