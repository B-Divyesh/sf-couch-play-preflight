import { cp, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const port = 18083;
const baseUrl = `http://127.0.0.1:${port}`;
const dataDir = await mkdtemp(join(tmpdir(), 'room-ready-restart-data-'));
const siteDir = await mkdtemp(join(tmpdir(), 'room-ready-restart-site-'));
const databaseUrl = `sqlite://${join(dataDir, 'room-ready.db')}?mode=rwc`;
const serverPath = resolve('server/target/release/room-ready-server');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function freshRequest(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolveRequest, reject) => {
    const request = http.request(`${baseUrl}${path}`, {
      method,
      agent: false,
      headers: { connection: 'close', ...headers },
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        body: responseBody,
      }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForServer(output) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await freshRequest('/health')).status === 200) return;
    } catch { /* the process may still be binding */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Room Ready did not restart: ${output()}`);
}

function startServer() {
  let output = '';
  const child = spawn(serverPath, [], {
    cwd: dataDir,
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      DIST_DIR: siteDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, output: () => output };
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  const stopped = new Promise((resolveStop, reject) => {
    const timer = setTimeout(() => reject(new Error('Room Ready did not stop')), 10_000);
    server.child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0 || signal === 'SIGTERM') resolveStop();
      else reject(new Error(`Room Ready stopped unexpectedly (code ${code}, signal ${signal}): ${server.output()}`));
    });
  });
  server.child.kill('SIGTERM');
  await stopped;
}

function json(response) {
  return JSON.parse(response.body);
}

async function assertEveryFreshReadReturnsRoom(code, phase) {
  const reads = await Promise.all(Array.from({ length: 5 }, () => freshRequest(`/api/rooms/${code}`, {
    headers: { 'x-forwarded-for': '198.51.100.91' },
  })));
  for (const response of reads) {
    assert(response.status === 200, `${phase}: a fresh GET returned ${response.status}`);
    assert(json(response).room.code === code, `${phase}: a fresh GET returned another room`);
  }
}

const version = spawnSync(serverPath, ['--version'], { encoding: 'utf8' });
assert(version.status === 0 && version.stdout.trim(), `Release binary has no build identity: ${version.stderr}`);

let first;
let second;
try {
  await cp(resolve('dist'), siteDir, { recursive: true });
  first = startServer();
  await waitForServer(first.output);

  const createdResponse = await freshRequest('/api/rooms', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.90',
    },
    body: JSON.stringify({ game_label: 'Durable restart regression', discoverable: false }),
  });
  assert(createdResponse.status === 200, `Room create returned ${createdResponse.status}`);
  const room = json(createdResponse);
  await assertEveryFreshReadReturnsRoom(room.code, 'before restart');
  await stopServer(first);

  second = startServer();
  await waitForServer(second.output);
  await assertEveryFreshReadReturnsRoom(room.code, 'after restart');

  const joinedResponse = await freshRequest(`/api/rooms/${room.code}/join`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.92',
    },
    body: JSON.stringify({ name: 'Restart guest', input_kind: 'keyboard' }),
  });
  assert(joinedResponse.status === 200, `Fresh join after restart returned ${joinedResponse.status}`);
  const persisted = await freshRequest(`/api/rooms/${room.code}`, {
    headers: { 'x-forwarded-for': '198.51.100.93' },
  });
  assert(persisted.status === 200 && json(persisted).players.length === 1, 'Joined player was not durable after restart');

  // Each probe uses agent:false and Connection: close, reproducing the fresh
  // HTTP/1.1 connection boundary from the live split-state incident. The
  // restarted process must still limit one forwarded client and send its retry
  // guidance, while a different client remains eligible.
  const burst = await Promise.all(Array.from({ length: 60 }, () => freshRequest('/api/rooms/ZZZZ', {
    headers: { 'x-forwarded-for': '198.51.100.94' },
  })));
  const limited = burst.find((response) => response.status === 429);
  assert(limited, 'Fresh connections after restart did not receive a 429');
  assert(Number(limited.headers['retry-after']) >= 1, 'Rate-limited fresh connection omitted Retry-After');
  const otherClient = await freshRequest('/api/rooms/ZZZZ', {
    headers: { 'x-forwarded-for': '198.51.100.95' },
  });
  assert(otherClient.status !== 429, 'Rate limit after restart was not keyed by the forwarded client');

  console.log('PASS durable SQLite restart: fresh create/read/join and per-client rate limiting');
} finally {
  if (second) await stopServer(second);
  else if (first) await stopServer(first);
  await rm(dataDir, { recursive: true, force: true });
  await rm(siteDir, { recursive: true, force: true });
}
