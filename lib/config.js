'use strict';
/* Demo configuration — everything here is sandboxed demo money. */

const env = process.env;

function loadDotEnv(file) {
  try {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.resolve(file), 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i === -1) return;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in env)) env[key] = val;
    });
  } catch (e) { /* .env is optional */ }
}

try { loadDotEnv(require('path').resolve(__dirname, '..', '.env')); } catch (e) { /* optional */ }

const PORT = Number(env.PORT) || 3000;
const NODE_ENV = env.NODE_ENV || 'development';

function parseMoney(str, fallback) {
  const n = Number(str);
  if (!isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100);
}

/* New demo accounts start with sandbox funds so the platform is usable immediately. */
const STARTING_CENTS = 'STARTING_BALANCE' in env ? parseMoney(env.STARTING_BALANCE, 100000) : 100000;
const MAX_TOPUP_CENTS = parseMoney(env.MAX_TOPUP, 100000000); // $1,000,000.00 per demo top-up

module.exports = { PORT, NODE_ENV, STARTING_CENTS, MAX_TOPUP_CENTS, loadDotEnv };
