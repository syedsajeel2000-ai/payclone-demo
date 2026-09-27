'use strict';
/* E2E proof of serverless persistence: a signup on "instance A" must be
 * loginable on a freshly started "instance B" that shares no memory and no
 * writable disk — simulating a Vercel lambda cold-start against Upstash Redis.
 *
 * A tiny local HTTP server emulates the Upstash REST API (GET /get/key,
 * POST /set/key) backed by an in-memory map, so the test exercises the exact
 * code path (fetch + Authorization header + JSON envelope) with zero deps
 * and zero network access.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT_A = process.env.TEST_PORT_A || '4621';
const PORT_B = process.env.TEST_PORT_B || '4622';
const REDIS_PORT = process.env.TEST_REDIS_PORT || '4623';
const REDIS_URL = `http://localhost:${REDIS_PORT}`;
const DATA_DIR = path.join(__dirname, '..', 'data-test-serverless');

let passed = 0;
let failed = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(name + (extra ? ' — ' + extra : ''));
  }
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : '  ' + (extra || '')));
}

/* ---- mock Upstash REST server (in-memory, survives only this test run) ---- */
const store = new Map();
const redis = http.createServer((req, res) => {
  const key = decodeURIComponent(req.url.split('/')[2] || '');
  if (req.method === 'GET') {
    const v = store.get(key);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ result: v === undefined ? null : v }));
  } else {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      store.set(key, body);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: 'OK' }));
    });
  }
});

function spawnInstance(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '..', 'server.js')],
      {
        env: {
          ...process.env,
          PORT: String(port),
          DATA_DIR, // deliberately SAME dir both times: instance B must NOT read A's file
          NODE_ENV: 'production', // enables redis mode (as on Vercel)
          UPSTASH_REDIS_REST_URL: REDIS_URL,
          UPSTASH_REDIS_REST_TOKEN: 'test-token',
          STARTING_BALANCE: '1000.00'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    const t0 = Date.now();
    (function poll() {
      fetch(`http://localhost:${port}/api/health`)
        .then((r) => (r.ok ? resolve(child) : setTimeout(poll, 120)))
        .catch(() => (Date.now() - t0 > 8000 ? reject(new Error('boot timeout\n' + log)) : setTimeout(poll, 120)));
    })();
  });
}

async function req(port, method, urlPath, { body, cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`http://localhost:${port}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { __raw: text.slice(0, 100) }; }
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const sessionCookie = ((raw && raw[0]) || '').split(';')[0] || null;
  return { status: res.status, data, cookie: sessionCookie };
}

async function main() {
  console.log('\nSERVERLESS PERSISTENCE — signup on A, cold-restart, login on B');
  await new Promise((r) => redis.listen(REDIS_PORT, r));

  // Instance A: user signs up, then the instance is killed (lambda frozen/recycled)
  const a = await spawnInstance(PORT_A);
  const signup = await req(PORT_A, 'POST', '/api/auth/signup', {
    body: { fullName: 'Cold Start', username: 'coldstart', email: 'coldstart@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
  });
  ok('signup on instance A', signup.status === 200 && signup.data.user, JSON.stringify(signup.data).slice(0, 120));
  const send = await req(PORT_A, 'POST', '/api/wallet/add-funds', {
    cookie: signup.cookie, body: { amount: '42.50', method: 'demo_topup' }
  });
  ok('mutation on instance A (top-up)', send.status === 200 && send.data.balance === 104250, 'balance=' + (send.data && send.data.balance));
  a.kill();
  await new Promise((r) => setTimeout(r, 300));

  // Instance B: brand-new process, empty memory. File layer is bypassed because
  // NODE_ENV=production + redis env → reads/writes go to the (mock) Redis only.
  const b = await spawnInstance(PORT_B);
  const badLogin = await req(PORT_B, 'POST', '/api/auth/login', {
    body: { identifier: 'coldstart', password: 'WrongPass1' }
  });
  ok('instance B: wrong password still rejected', badLogin.status === 401);

  const login = await req(PORT_B, 'POST', '/api/auth/login', {
    body: { identifier: 'coldstart', password: 'Passw0rd!' }
  });
  ok('LOGIN ON INSTANCE B AFTER COLD RESTART', login.status === 200 && login.data.user && login.data.user.username === 'coldstart', JSON.stringify(login.data).slice(0, 140));

  const me = await req(PORT_B, 'GET', '/api/auth/me', { cookie: login.cookie });
  ok('session works on instance B', me.status === 200 && me.data.user.email === 'coldstart@demo.test');

  const wallet = await req(PORT_B, 'GET', '/api/wallet', { cookie: login.cookie });
  ok('balance survived restart (1000 + 42.50)', wallet.status === 200 && wallet.data.balance === 104250, 'balance=' + (wallet.data && wallet.data.balance));

  const txs = await req(PORT_B, 'GET', '/api/transactions', { cookie: login.cookie });
  ok('transaction history survived restart', txs.status === 200 && txs.data.items.some((t) => t.type === 'topup' && t.amount === 4250));

  // Write on B, read on A-style fresh instance: multi-instance consistency
  await req(PORT_B, 'POST', '/api/send', { cookie: login.cookie, body: { recipient: 'coldstart', amount: '0' } }); // rejected, no-op
  const b2 = await spawnInstance(PORT_A); // reuse port A as a third instance
  const me3 = await req(PORT_A, 'POST', '/api/auth/login', { body: { identifier: 'coldstart', password: 'Passw0rd!' } });
  ok('third instance sees the same account', me3.status === 200);
  b2.kill();
  b.kill();

  redis.close();
  try { require('fs').rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
}

main().catch((e) => { console.error('Test crashed:', e); process.exit(1); });
