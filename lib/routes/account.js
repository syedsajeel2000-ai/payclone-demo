'use strict';
const db = require('../db');
const { toCents, token, money, isDisposableEmail, isDoubledDomainEmail } = require('../util');
const { ApiError, passwordMatches, requireUser } = require('../auth');
const { toPublicUser, decorate, myTransactions } = require('../shared');

function badFields(message, fields) {
  const err = new ApiError(400, message);
  err.fields = fields;
  return err;
}

function notificationPayload(userId) {
  const items = db
    .get()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 60);
  const unread = items.filter((n) => !n.read).length;
  const totalUnread = db.get().notifications.filter((n) => n.userId === userId && !n.read).length;
  return { items, unread: totalUnread };
}

module.exports = [
  /* ---------------- dashboard ---------------- */
  {
    method: 'GET',
    path: '/api/dashboard',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const all = myTransactions(user.id).map((t) => decorate(t, user.id));
      const completed = all.filter((t) => t.status === 'completed');
      const transfers = completed.filter((t) => t.type !== 'topup');
      const totalSent = transfers.filter((t) => t.direction === 'sent').reduce((a, t) => a + t.amount, 0);
      const totalReceived = transfers.filter((t) => t.direction === 'received').reduce((a, t) => a + t.amount, 0);
      const totalAdded = completed.filter((t) => t.type === 'topup').reduce((a, t) => a + t.amount, 0);
      const recent = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
      const pendingRequests = all.filter((t) => t.type === 'payment_request' && t.status === 'pending').length;
      const sec = db.securityFor(user.id);
      const settings = db.settingsFor(user.id);

      return {
        user: toPublicUser(user),
        balance: user.balance,
        totalSent,
        totalReceived,
        totalAdded,
        transactionCount: all.length,
        pendingRequests,
        recent,
        unreadNotifications: notificationPayload(user.id).unread,
        security: {
          twoFactorEnabled: !!sec.twoFactorEnabled,
          passwordUpdatedAt: sec.passwordUpdatedAt || null,
          memberSince: user.createdAt,
          notificationToggles: settings.notifications
        },
        preferences: settings.preferences
      };
    }
  },

  /* ---------------- notifications ---------------- */
  {
    method: 'GET',
    path: '/api/notifications',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      return notificationPayload(user.id);
    }
  },

  {
    method: 'POST',
    path: '/api/notifications/read',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const d = db.get();
      const { ids, all } = ctx.body || {};
      if (all === true) {
        d.notifications.forEach((n) => {
          if (n.userId === user.id) n.read = true;
        });
      } else if (Array.isArray(ids)) {
        ids.forEach((id) => {
          const n = d.notifications.find((x) => x.id === id && x.userId === user.id);
          if (n) n.read = true;
        });
      } else {
        throw new ApiError(400, 'Specify notification ids or all: true.');
      }
      await db.save();
      return notificationPayload(user.id);
    }
  },

  /* ---------------- security / 2FA ---------------- */
  {
    method: 'GET',
    path: '/api/security',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const sec = db.securityFor(user.id);
      const d = db.get();
      const activity = d.loginActivity.filter((a) => a.userId === user.id).slice(0, 15);
      const securityNotes = d.notifications
        .filter((n) => n.userId === user.id && n.type === 'security')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);
      return {
        twoFactorEnabled: !!sec.twoFactorEnabled,
        twoFactorEnabledAt: sec.twoFactorEnabledAt || null,
        demoCode: sec.twoFactorDemoCode || null,
        passwordUpdatedAt: sec.passwordUpdatedAt || null,
        loginActivity: activity,
        securityNotifications: securityNotes
      };
    }
  },

  {
    method: 'POST',
    path: '/api/security/2fa/setup',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const sec = db.securityFor(user.id);
      if (sec.twoFactorEnabled) throw new ApiError(400, 'Two-factor authentication is already enabled.');

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const secret = 'PCD-DEMO-' + token(6).toUpperCase().slice(0, 12);
      sec.twoFactorPendingCode = code;
      sec.twoFactorPendingExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      sec.twoFactorDemoCode = code;
      sec.updatedAt = new Date().toISOString();
      await db.save();
      return {
        ok: true,
        demo: true,
        code,
        secret,
        otpauthUrl: `otpauth://totp/PayClone:${user.username}?secret=${secret}&issuer=PayClone-Demo`,
        message:
          'Simulated 2FA setup: this demo does not connect to a real authenticator app, so the verification code is generated here.'
      };
    }
  },

  {
    method: 'POST',
    path: '/api/security/2fa/verify',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const sec = db.securityFor(user.id);
      const entered = String(ctx.body.code || '').trim();
      if (!sec.twoFactorPendingCode || !sec.twoFactorPendingExpires) {
        throw new ApiError(400, 'No pending setup. Start the 2FA setup again.');
      }
      if (new Date(sec.twoFactorPendingExpires).getTime() < Date.now()) {
        sec.twoFactorPendingCode = null;
        sec.twoFactorPendingExpires = null;
        await db.save();
        throw new ApiError(400, 'Setup code expired. Start the 2FA setup again.');
      }
      if (!/^\d{6}$/.test(entered)) throw new ApiError(400, 'Enter the 6-digit verification code.');
      if (entered !== sec.twoFactorPendingCode) throw new ApiError(400, 'Invalid verification code.');

      sec.twoFactorEnabled = true;
      sec.twoFactorEnabledAt = new Date().toISOString();
      sec.twoFactorPendingCode = null;
      sec.twoFactorPendingExpires = null;
      sec.updatedAt = new Date().toISOString();
      db.notify(user.id, 'Two-factor authentication enabled', 'Simulated 2FA is now required at login for your demo account.', {
        type: 'security',
        link: '/security'
      });
      await db.save();
      return { ok: true, message: 'Two-factor authentication enabled.', twoFactorEnabled: true };
    }
  },

  {
    method: 'POST',
    path: '/api/security/2fa/disable',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const sec = db.securityFor(user.id);
      if (!sec.twoFactorEnabled) throw new ApiError(400, 'Two-factor authentication is not enabled.');
      const password = String(ctx.body.password || '');
      if (!password) throw badFields('Enter your password to disable 2FA.', { password: 'Password is required.' });
      if (!passwordMatches(user, password)) {
        throw badFields('Password is incorrect.', { password: 'Password is incorrect.' });
      }
      sec.twoFactorEnabled = false;
      sec.twoFactorEnabledAt = null;
      sec.twoFactorDemoCode = null;
      sec.updatedAt = new Date().toISOString();
      db.notify(user.id, 'Two-factor authentication disabled', 'Simulated 2FA was turned off for your demo account.', {
        type: 'security',
        link: '/security'
      });
      await db.save();
      return { ok: true, message: 'Two-factor authentication disabled.', twoFactorEnabled: false };
    }
  },

  {
    method: 'GET',
    path: '/api/security/login-activity',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const activity = db.get().loginActivity.filter((a) => a.userId === user.id).slice(0, 30);
      return { items: activity };
    }
  },

  /* ---------------- settings ---------------- */
  {
    method: 'GET',
    path: '/api/settings',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const settings = db.settingsFor(user.id);
      return {
        profile: toPublicUser(user),
        notifications: settings.notifications,
        preferences: settings.preferences
      };
    }
  },

  {
    method: 'PUT',
    path: '/api/settings/profile',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const { fullName, username, email, phone, country } = ctx.body;
      const fields = {};

      const fn = String(fullName || '').trim();
      if (fn.length < 2 || fn.length > 80) fields.fullName = 'Enter your full name (2–80 characters).';

      const un = String(username || '').trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._]{1,18}[A-Za-z0-9]$/.test(un)) {
        fields.username = 'Username must be 3–20 letters, numbers, dots or underscores.';
      } else {
        const existing = db.findUserByUsername(un);
        if (existing && existing.id !== user.id) fields.username = 'That username is already taken.';
      }

      const em = String(email || '').trim().toLowerCase();
      if (isDoubledDomainEmail(em)) fields.email = 'This email looks malformed (multiple @ signs) and cannot be used.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) fields.email = 'Enter a valid email address.';
      else if (isDisposableEmail(em)) fields.email = 'Disposable / temporary email addresses are not allowed. Please use a permanent email.';
      else {
        const existing = db.findUserByEmail(em);
        if (existing && existing.id !== user.id) fields.email = 'An account with that email already exists.';
      }

      const ph = String(phone || '').trim();
      if (ph && !/^[+()\d\s-]{5,20}$/.test(ph)) fields.phone = 'Enter a valid phone number (5–20 characters).';

      const co = String(country || '').trim();
      if (co.length > 60) fields.country = 'Country name is too long.';

      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);

      user.fullName = fn;
      user.username = un;
      user.email = em;
      user.phone = ph;
      user.country = co;
      user.updatedAt = new Date().toISOString();
      await db.save();
      return { ok: true, message: 'Profile updated successfully.', profile: toPublicUser(user) };
    }
  },

  {
    method: 'PUT',
    path: '/api/settings/notifications',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const settings = db.settingsFor(user.id);
      const map = { payments: 'payments', requests: 'requests', security: 'security', emailDemo: 'emailDemo' };
      Object.keys(map).forEach((key) => {
        if (key in (ctx.body || {})) settings.notifications[key] = !!ctx.body[key];
      });
      await db.save();
      return { ok: true, message: 'Notification preferences saved.', notifications: settings.notifications };
    }
  },

  {
    method: 'PUT',
    path: '/api/settings/preferences',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const settings = db.settingsFor(user.id);
      const { dateFormat, timeFormat, defaultHome } = ctx.body || {};
      const fields = {};
      if (dateFormat !== undefined) {
        if (!['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(dateFormat)) {
          fields.dateFormat = 'Choose a supported date format.';
        } else settings.preferences.dateFormat = dateFormat;
      }
      if (timeFormat !== undefined) {
        if (!['12h', '24h'].includes(timeFormat)) fields.timeFormat = 'Choose 12h or 24h.';
        else settings.preferences.timeFormat = timeFormat;
      }
      if (defaultHome !== undefined) {
        if (!['/dashboard', '/wallet', '/transactions'].includes(defaultHome)) {
          fields.defaultHome = 'Choose a valid default page.';
        } else settings.preferences.defaultHome = defaultHome;
      }
      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);
      await db.save();
      return { ok: true, message: 'Preferences saved.', preferences: settings.preferences };
    }
  },

  /* ---------------- health ---------------- */
  {
    method: 'GET',
    path: '/api/health',
    handler: async () => ({ ok: true, demo: true, time: new Date().toISOString() })
  }
];
