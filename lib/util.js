'use strict';
const crypto = require('crypto');

/* ---------------- IDs ---------------- */
function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
function txId() {
  return 'TX-' + crypto.randomBytes(6).toString('hex').toUpperCase();
}
function referenceId() {
  return 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function requestId() {
  return 'REQ-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function userId() {
  return 'usr_' + crypto.randomBytes(8).toString('hex');
}
function methodId() {
  return 'pm_' + crypto.randomBytes(6).toString('hex');
}
function notificationId() {
  return 'ntf_' + crypto.randomBytes(6).toString('hex');
}

/* ---------------- Passwords (hashed with scrypt, never stored raw) ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  try {
    const a = crypto.scryptSync(String(password), salt, 64);
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

/* ---------------- Validation ---------------- */
function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;
}

/* Disposable / throwaway email domains (tempmails) — blocklist at signup and
   profile update so demo accounts can't be bulk-created with burner inboxes. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'guerrillamail.biz', 'spam4.me', '10minutemail.com', '10minutemail.net',
  '10minutemail.co.uk', '20minutemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'temp-mailo.com', 'tempmailo.com', 'tempmailo.net', 'tempmail.plus', 'tempmail.dev',
  'tempr.email', 'tmpmail.org', 'tmpmail.net', 'tmpmailcorporation.com', 'throwawaymail.com',
  'throwawaymail.me', 'trashmail.com', 'trash-mail.com', 'trashmail.me', 'trashmail.de',
  'trashmail.net', 'trash-mail.de', 'kurzepost.de', 'objectmail.com', 'proxymail.eu',
  'rcpt.at', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'zero-mail.net',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'mintemail.com',
  'mohmal.com', 'mohmal.im', 'getnada.com', 'nada.email', 'nada.ltd', 'inboxbear.com',
  'inboxkitten.com', 'incognitomail.com', 'incognitomail.org', 'jetable.org', 'jetable.net',
  'anonbox.net', 'fakeinbox.com', 'fake-mail.net', 'fakemail.net', 'fakemailgenerator.com',
  'emailondeck.com', 'email-fake.com', 'emailfake.com', 'email-fake.net', 'generator.email',
  'grrmail.com', 'harakirimail.com', 'mytemp.email', 'mytempemail.com', 'burnermail.io',
  'mail-temporaire.fr', 'mailtemp.net', 'spamgourmet.com', 'spambog.com', 'spambog.de',
  'spambog.ru', 'mailsac.com', 'inboxalias.com', 'mail7.io', 'mailtemp.info', 'lroid.com',
  'xkx.me', 'vomoto.com', 'instantemailaddress.com', 'instant-mail.de', 'tempinbox.com',
  'tempemail.net', 'tempemail.co', 'tempemailaddress.com', 'deadaddress.com', 'despam.it',
  'discard.email', 'discard.cf', 'discardmail.com', 'discardmail.de', 'one-time.email',
  '1secmail.com', '1secmail.net', '1secmail.org', '1secmail.net', 'esiix.com', 'wwjmp.com',
  'vjuum.com', 'laafd.com', 'txcct.com', 'kzccv.com', 'qiott.com', 'wuuvo.com', 'icznn.com'
]);

/* Malformed doubled-domain patterns like user@gmail.com@email.com — an @ in the
   domain part is never valid and is a common bot/signup-abuse signature. */
const DOUBLE_AT_RE = /@[^@\s]*@/;

function isDisposableEmail(v) {
  if (!isEmail(v)) return false;
  const domain = String(v).trim().toLowerCase().split('@').pop();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  return [...DISPOSABLE_EMAIL_DOMAINS].some((blocked) => domain.endsWith('.' + blocked));
}
function isDoubledDomainEmail(v) {
  return typeof v === 'string' && DOUBLE_AT_RE.test(v.trim());
}
/* One-call gate for signup / profile-update: returns an error message or null. */
function emailBlockReason(v) {
  if (isDoubledDomainEmail(v)) return 'This email looks malformed (multiple @ signs) and cannot be used.';
  if (isDisposableEmail(v)) return 'Disposable / temporary email addresses are not allowed. Please use a permanent email.';
  return null;
}
function isUsername(v) {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._]{1,18}[A-Za-z0-9]$/.test(v.trim());
}
function passwordCheck(v) {
  if (typeof v !== 'string' || v.length === 0) return { ok: false, message: 'Password is required.' };
  if (v.length < 8) return { ok: false, message: 'Password must be at least 8 characters long.' };
  if (v.length > 100) return { ok: false, message: 'Password must be 100 characters or fewer.' };
  if (!/[a-z]/.test(v)) return { ok: false, message: 'Password must contain a lowercase letter.' };
  if (!/[A-Z]/.test(v)) return { ok: false, message: 'Password must contain an uppercase letter.' };
  if (!/[0-9]/.test(v)) return { ok: false, message: 'Password must contain a number.' };
  return { ok: true };
}
function isFullName(v) {
  return typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 80;
}

/* ---------------- Money (stored as integer cents) ---------------- */
function toCents(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}
function money(cents) {
  const n = (Number(cents) || 0) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------- Cards (demo only — full numbers are never stored) ---------------- */
function cardDigits(v) {
  return String(v || '').replace(/[\s-]/g, '');
}
function isCardNumber(v) {
  const d = cardDigits(v);
  return /^\d{13,19}$/.test(d);
}
function isExpiry(v) {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(v || '').trim());
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  const now = new Date();
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return end >= now;
}
function isCvv(v) {
  return /^\d{3,4}$/.test(String(v || '').trim());
}
function cardBrand(v) {
  const d = cardDigits(v);
  if (/^4/.test(d)) return 'Visa';
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  return 'Demo Card';
}
function last4(v) {
  return cardDigits(v).slice(-4);
}

/* ---------------- HTTP helpers ---------------- */
function sendJSON(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}
function readBody(req, limit = 1024 * 256) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch (e) {
        reject(Object.assign(new Error('Invalid JSON body.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}
function uaShort(req) {
  const ua = String(req.headers['user-agent'] || 'Unknown device');
  let os = 'Unknown OS';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os|macintosh/i.test(ua)) os = 'macOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  return browser + ' on ' + os;
}

module.exports = {
  token, txId, referenceId, requestId, userId, methodId, notificationId,
  hashPassword, verifyPassword,
  isEmail, isUsername, passwordCheck, isFullName,
  isDisposableEmail, isDoubledDomainEmail, emailBlockReason,
  toCents, money,
  cardDigits, isCardNumber, isExpiry, isCvv, cardBrand, last4,
  sendJSON, readBody, parseCookies, clientIp, uaShort
};
