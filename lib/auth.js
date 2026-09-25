'use strict';
const db = require('./db');
const { token, parseCookies, verifyPassword } = require('./util');

const COOKIE_NAME = 'payclone_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/* Pending 2FA challenges (short lived, in-memory) */
const pendingTwoFactor = new Map();

function createSession(userId, req) {
  const d = db.get();
  const value = token(32);
  d.sessions[value] = {
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_MS).toISOString(),
    ip: require('./util').clientIp(req),
    ua: require('./util').uaShort(req)
  };
  db.save();
  return { name: COOKIE_NAME, value };
}
function sessionCookie(session, isSecure) {
  return `${session.name}=${session.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isSecure ? '; Secure' : ''}`;
}
function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
function getToken(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}
function getSessionUser(req) {
  const t = getToken(req);
  if (!t) return { user: null, token: null, session: null };
  const d = db.get();
  const session = d.sessions[t];
  if (!session) return { user: null, token: t, session: null };
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete d.sessions[t];
    db.save();
    return { user: null, token: t, session: null };
  }
  const user = db.findUser(session.userId);
  if (!user) return { user: null, token: t, session: null };
  return { user, token: t, session };
}
function destroySession(t) {
  if (!t) return;
  const d = db.get();
  if (d.sessions[t]) {
    delete d.sessions[t];
    db.save();
  }
}
function destroyAllSessions(userId) {
  const d = db.get();
  Object.keys(d.sessions).forEach((t) => {
    if (d.sessions[t].userId === userId) delete d.sessions[t];
  });
  db.save();
}

/* ---- 2FA pending login challenges ---- */
function createTwoFactorChallenge(userId, demoCode) {
  const value = token(16);
  pendingTwoFactor.set(value, { userId, demoCode, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}
function peekTwoFactorChallenge(value) {
  if (!value) return null;
  const rec = pendingTwoFactor.get(value);
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    pendingTwoFactor.delete(value);
    return null;
  }
  return rec;
}
function consumeTwoFactorChallenge(value) {
  if (value) pendingTwoFactor.delete(value);
}

function passwordMatches(user, password) {
  return verifyPassword(password, user.passwordSalt, user.passwordHash);
}

function requireUser(ctx) {
  if (!ctx.user) throw new ApiError(401, 'You must be logged in to do that.');
  return ctx.user;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  COOKIE_NAME,
  createSession, sessionCookie, clearCookie, getToken, getSessionUser,
  destroySession, destroyAllSessions,
  createTwoFactorChallenge, peekTwoFactorChallenge, consumeTwoFactorChallenge,
  passwordMatches, requireUser, ApiError
};
