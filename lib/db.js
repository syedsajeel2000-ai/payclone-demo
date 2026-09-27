'use strict';
const fs = require('fs');
const path = require('path');

/* PayClone data layer — pluggable storage behind one document model.
 *
 * Engines (picked automatically, in order):
 *   1. SQLite  — `node:sqlite` (built into Node 22.5+, zero dependencies).
 *                Real SQL database, durable file at $DATA_DIR/payclone.db.
 *                This is the DEFAULT and what makes login survive restarts.
 *   2. Redis   — optional remote store (Upstash REST) when UPSTASH_REDIS_REST_URL
 *                + TOKEN are set and NODE_ENV=production (e.g. Vercel, whose
 *                filesystem is ephemeral — SQLite/JSON files would be wiped).
 *   3. Legacy  — plain JSON db.json, only as a migration source / last-resort
 *                fallback when node:sqlite is unavailable (old Node).
 *
 * On first boot the existing db.json is imported into SQLite and renamed
 * to db.json.migrated so there is a single source of truth afterwards.
 */

const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REDIS_KEY = process.env.REDIS_DB_KEY || 'payclone:demo:db';
const REDIS_ALLOWED_ENV = { production: 1, serverless: 1 };
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN && REDIS_ALLOWED_ENV[process.env.NODE_ENV || '']);

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
const DB_FILE = path.join(DATA_DIR, 'payclone.db');
const LEGACY_JSON = path.join(DATA_DIR, 'db.json');

/* node:sqlite is lazy-required: keeps the module loadable on old Node for the
   JSON fallback, and lets tests observe "engine" without booting a DB. */
let sqliteAvailable = false;
let sqlite = null; // { DatabaseSync }
try {
  sqlite = require('node:sqlite');
  sqliteAvailable = typeof sqlite.DatabaseSync === 'function';
} catch (e) {
  sqliteAvailable = false;
}
const ENGINE = redisEnabled ? 'redis' : sqliteAvailable ? 'sqlite' : 'json-legacy';

/* Tracks unflushed persistence work so serverless wrappers can wait for it. */
let pendingPersistence = Promise.resolve();
function track(promise) {
  pendingPersistence = Promise.all([pendingPersistence, promise]).then(() => {});
  return promise;
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
    meta: { createdAt: new Date().toISOString(), engine: ENGINE, migratedAt: null }
  };
}

/* ---------------- SQLite engine ---------------- */
let sqliteDb = null;
function sqliteOpen() {
  if (sqliteDb) return sqliteDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  sqliteDb = new sqlite.DatabaseSync(DB_FILE);
  sqliteDb.exec(
    'PRAGMA journal_mode = WAL;' +
      'PRAGMA synchronous = NORMAL;' +
      'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);'
  );
  return sqliteDb;
}

function sqliteReadDoc() {
  const db = sqliteOpen();
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('db');
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch (err) {
    console.error('[db] SQLite document corrupt, starting fresh:', err.message);
    return null;
  }
}

function sqliteWriteDoc(snapshot) {
  const db = sqliteOpen();
  db.prepare(
    'INSERT INTO kv (key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('db', snapshot);
}

/* One-time import of the legacy JSON file (both local db.json and anything
   already on disk when upgrading an existing install). */
function sqliteMigrateLegacy(doc) {
  try {
    if (!fs.existsSync(LEGACY_JSON)) return;
    const raw = fs.readFileSync(LEGACY_JSON, 'utf8');
    const legacy = JSON.parse(raw);
    const merged = Object.assign(doc, legacy);
    merged.meta = Object.assign({}, doc.meta, {
      migratedAt: new Date().toISOString()
    });
    sqliteWriteDoc(JSON.stringify(merged));
    try {
      fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated');
    } catch (e) { /* keep file; migration guard below still holds since data is in SQLite */ }
    console.log('[db] Migrated legacy db.json → SQLite (' + DB_FILE + ')');
  } catch (err) {
    console.error('[db] Legacy migration failed (continuing with current doc):', err.message);
  }
}

/* ---------------- Redis (remote) mode ---------------- */
async function redisLoad() {
  try {
    const res = await fetch(REDIS_URL + '/get/' + encodeURIComponent(REDIS_KEY), {
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN }
    });
    const json = await res.json();
    if (json.result && typeof json.result === 'string') {
      return Object.assign(defaults(), JSON.parse(json.result));
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

/* ---------------- document lifecycle ---------------- */
let db = null;
let writeQueue = Promise.resolve();
let hydrated = false;

async function load() {
  if (hydrated) return db;
  db = defaults();
  try {
    if (redisEnabled) {
      db = await redisLoad();
    } else if (sqliteAvailable) {
      const stored = sqliteReadDoc();
      if (stored) db = Object.assign(defaults(), stored);
      else sqliteMigrateLegacy(db); // empty DB + legacy file → import it
    } else if (fs.existsSync(LEGACY_JSON)) {
      db = Object.assign(defaults(), JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8')));
    }
  } catch (err) {
    console.error('[db] Could not read data store, starting fresh:', err.message);
  }
  hydrated = true;
  return db;
}

/* Synchronous accessor for existing call sites (handlers run after hydration). */
function get() {
  if (!hydrated) {
    db = defaults();
    try {
      if (redisEnabled) {
        /* redis needs async; serverless/server entry always primes first —
           this branch only guards against direct synchronous misuse. */
        console.error('[db] get() before prime() in redis mode; using empty state');
      } else if (sqliteAvailable) {
        const stored = sqliteReadDoc();
        if (stored) db = Object.assign(defaults(), stored);
        else sqliteMigrateLegacy(db);
      } else if (fs.existsSync(LEGACY_JSON)) {
        db = Object.assign(defaults(), JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8')));
      }
    } catch (err) {
      console.error('[db] Could not read data store, starting fresh:', err.message);
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

/* Atomic save: serialised; sqlite = single-document UPSERT, redis = SET. */
function save() {
  const snapshot = JSON.stringify(db, null, redisEnabled ? 0 : 2);
  if (redisEnabled) {
    track(redisSave(snapshot));
    return pendingPersistence;
  }
  if (sqliteAvailable) {
    writeQueue = writeQueue.then(() => {
      try {
        sqliteWriteDoc(snapshot);
      } catch (err) {
        console.error('[db] SQLite save failed:', err.message);
      }
    });
    track(writeQueue);
    return writeQueue;
  }
  /* Legacy last-resort: atomic temp+rename JSON write. */
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve) => {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          const tmp = LEGACY_JSON + '.' + process.pid + '.tmp';
          fs.writeFileSync(tmp, snapshot, 'utf8');
          fs.renameSync(tmp, LEGACY_JSON);
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
    if (redisEnabled) {
      track(redisSave(JSON.stringify(db)));
    } else if (sqliteAvailable && sqliteDb) {
      sqliteDb.prepare('DELETE FROM kv WHERE key = ?').run('db');
    } else if (fs.existsSync(LEGACY_JSON)) {
      fs.unlinkSync(LEGACY_JSON);
    }
  } catch (e) { /* ignore */ }
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  ENGINE,
  get,
  save,
  prime,
  flush,
  resetDb,
  redisEnabled,
  findUser, findUserByUsername, findUserByEmail, findUserByIdentifier,
  securityFor, settingsFor, notify
};
