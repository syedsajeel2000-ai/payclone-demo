'use strict';
const fs = require('fs');
const path = require('path');

/* Data directory: DATA_DIR env wins; falls back to /tmp on read-only hosts
   (e.g. Vercel serverless) so the app still runs, with the caveat that data
   is ephemeral there — instances may start with a fresh file at any time.
   On such hosts set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to
   persist everything in Upstash Redis (works with Vercel KV / Upstash free tier).
   Zero dependencies: the REST API is called with Node 18's global fetch. */
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY = process.env.REDIS_DB_KEY || 'payclone:demo:db';
const REDIS_ALLOWED_ENV = { production: 1, serverless: 1 };
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN && REDIS_ALLOWED_ENV[process.env.NODE_ENV || '']);
const IS_SERVERLESS = !!process.env.VERCEL || (process.env.AWS_LAMBDA_FUNCTION_NAME ? true : false);

function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  try {
    const probe = path.join(__dirname, '..', 'data', '.write-test');
    fs.mkdirSync(path.dirname(probe), { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return path.resolve(path.join(__dirname, '..', 'data'));
  } catch (e) {
    return path.join('/tmp', 'payclone-data');
  }
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* Tracks unflushed persistence work so serverless wrappers can wait for it. */
let pendingPersistence = Promise.resolve();

function track(promise) {
  pendingPersistence = Promise.all([pendingPersistence, promise]).then(() => {});
  return promise;
}

/* ---------------- Redis (persistent) mode ---------------- */
async function redisLoad() {
  try {
    const res = await fetch(REDIS_URL + '/get/' + encodeURIComponent(REDIS_KEY), {
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN }
    });
    const json = await res.json();
    if (json.result && typeof json.result === 'string') {
      const parsed = JSON.parse(json.result);
      return Object.assign(defaults(), parsed);
    }
  } catch (err) {
    console.error('[db] Redis load failed, starting with empty state:', err.message);
  }
  return defaults();
}

async function redisSave(snapshot) {
  try {
    const res = await fetch(REDIS_URL + '/set/' + encodeURIComponent(REDIS_KEY), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'text/plain' },
      body: snapshot
    });
    const json = await res.json();
    if (json.error || json.result !== 'OK') {
      console.error('[db] Redis save failed:', JSON.stringify(json).slice(0, 200));
    }
  } catch (err) {
    console.error('[db] Redis save failed:', err.message);
  }
}

function defaults() {
  return {
    users: [],
    transactions: [],
    notifications: [],
    loginActivity: [],
    security: [],
    paymentMethods: [],
    settings: [],
    sessions: {},
    passwordResets: {},
    meta: { createdAt: new Date().toISOString() }
  };
}

let db = null;
let writeQueue = Promise.resolve();
let hydrated = false;

async function load() {
  if (hydrated) return db;
  db = defaults();
  try {
    if (redisEnabled) {
      db = await redisLoad();
    } else if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      db = Object.assign(defaults(), parsed);
    }
  } catch (err) {
    console.error('[db] Could not read data file, starting fresh:', err.message);
  }
  hydrated = true;
  return db;
}

/* Synchronous accessor for existing call sites (handlers run after hydration). */
function get() {
  if (!hydrated) {
    /* File mode: safe to load synchronously. Redis mode: hydrate() ran before
       any request was served (see flush()/prime()); this is just a safety net. */
    db = defaults();
    try {
      if (!redisEnabled && fs.existsSync(DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        db = Object.assign(defaults(), parsed);
      }
    } catch (err) {
      console.error('[db] Could not read data file, starting fresh:', err.message);
    }
    hydrated = true;
  }
  return db;
}

/* Called by the serverless wrapper / server entry before handling a request. */
function prime() {
  if (hydrated) return pendingPersistence;
  return track(load());
}

/* Waits for every queued persistence write to finish (incl. this turn's). */
function flush() {
  return pendingPersistence;
}

/* Atomic save: serialised; file mode = temp+rename, redis mode = whole-snapshot SET. */
function save() {
  const snapshot = JSON.stringify(db, null, redisEnabled ? 0 : 2);
  if (redisEnabled) {
    track(redisSave(snapshot));
    return pendingPersistence;
  }
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve) => {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          const tmp = DB_FILE + '.' + process.pid + '.tmp';
          fs.writeFileSync(tmp, snapshot, 'utf8');
          fs.renameSync(tmp, DB_FILE);
        } catch (err) {
          console.error('[db] Save failed:', err.message);
        }
        resolve();
      })
  );
  track(writeQueue);
  return writeQueue;
}

/* ---------------- entity helpers ---------------- */
function findUser(id) {
  return get().users.find((u) => u.id === id) || null;
}
function findUserByUsername(username) {
  const q = String(username || '').toLowerCase();
  return get().users.find((u) => u.username.toLowerCase() === q) || null;
}
function findUserByEmail(email) {
  const q = String(email || '').toLowerCase();
  return get().users.find((u) => u.email.toLowerCase() === q) || null;
}
function findUserByIdentifier(identifier) {
  const q = String(identifier || '').trim().toLowerCase();
  if (!q) return null;
  return (
    get().users.find((u) => u.email.toLowerCase() === q) ||
    get().users.find((u) => u.username.toLowerCase() === q) ||
    null
  );
}
function securityFor(userId) {
  const d = get();
  let rec = d.security.find((s) => s.userId === userId);
  if (!rec) {
    rec = {
      userId,
      twoFactorEnabled: false,
      twoFactorDemoCode: null,
      twoFactorPendingCode: null,
      twoFactorPendingExpires: null,
      twoFactorEnabledAt: null,
      passwordUpdatedAt: null,
      updatedAt: new Date().toISOString()
    };
    d.security.push(rec);
  }
  return rec;
}
function settingsFor(userId) {
  const d = get();
  let rec = d.settings.find((s) => s.userId === userId);
  if (!rec) {
    rec = {
      userId,
      notifications: {
        payments: true,
        requests: true,
        security: true,
        emailDemo: true
      },
      preferences: {
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        defaultHome: '/dashboard'
      }
    };
    d.settings.push(rec);
  }
  return rec;
}
function notify(userId, title, message, opts = {}) {
  const d = get();
  const rec = {
    id: 'ntf_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    userId,
    title,
    message,
    type: opts.type || 'info',
    link: opts.link || null,
    read: false,
    createdAt: new Date().toISOString()
  };
  d.notifications.unshift(rec);
  if (d.notifications.length > 500) d.notifications.length = 500;
  return rec;
}
function resetDb() {
  db = defaults();
  hydrated = true;
  try {
    if (!redisEnabled && fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  } catch (e) { /* ignore */ }
}

module.exports = {
  DATA_DIR, DB_FILE, get, save, resetDb, prime, flush,
  redisEnabled, IS_SERVERLESS,
  findUser, findUserByUsername, findUserByEmail, findUserByIdentifier,
  securityFor, settingsFor, notify
};
