'use strict';
const fs = require('fs');
const path = require('path');

/* Data directory: DATA_DIR env wins; falls back to /tmp on read-only hosts
   (e.g. Vercel serverless) so the app still runs, with the caveat that data
   is ephemeral there — instances may start with a fresh file at any time. */
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

function load() {
  if (db) return db;
  db = defaults();
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      db = Object.assign(defaults(), parsed);
    }
  } catch (err) {
    console.error('[db] Could not read data file, starting fresh:', err.message);
  }
  return db;
}

function get() {
  return load();
}

/* Atomic save: write temp file, then rename. Serialised so writes never interleave. */
function save() {
  const snapshot = JSON.stringify(db, null, 2);
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
  try {
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  } catch (e) { /* ignore */ }
}

module.exports = {
  DATA_DIR, DB_FILE, get, save, resetDb,
  findUser, findUserByUsername, findUserByEmail, findUserByIdentifier,
  securityFor, settingsFor, notify
};
