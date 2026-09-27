'use strict';
const db = require('../db');
const {
  isEmail, isUsername, isFullName, passwordCheck, hashPassword,
  isDisposableEmail, isDoubledDomainEmail, emailBlockReason,
  txId, referenceId, userId, token, money, clientIp, uaShort
} = require('../util');
const {
  ApiError, createSession, sessionCookie, clearCookie, destroySession,
  destroyAllSessions, createTwoFactorChallenge, peekTwoFactorChallenge,
  consumeTwoFactorChallenge, passwordMatches
} = require('../auth');
const { STARTING_CENTS } = require('../config');
const { toPublicUser, recordLogin } = require('../shared');
const mailer = require('../mailer');
const { buildReceiptHtml } = require('../receipt');

function badFields(message, fields) {
  const err = new ApiError(400, message);
  err.fields = fields;
  return err;
}

module.exports = [
  {
    method: 'POST',
    path: '/api/auth/signup',
    handler: async (ctx) => {
      const { fullName, username, email, password, confirmPassword } = ctx.body;
      const fields = {};

      if (!isFullName(fullName)) fields.fullName = 'Enter your full name (2–80 characters).';
      if (!username || !String(username).trim()) fields.username = 'Username is required.';
      else if (!isUsername(username)) fields.username = 'Username must be 3–20 letters, numbers, dots or underscores.';
      else if (db.findUserByUsername(username)) fields.username = 'That username is already taken.';

      if (!email || !String(email).trim()) fields.email = 'Email is required.';
      else if (isDoubledDomainEmail(email)) fields.email = 'This email looks malformed (multiple @ signs) and cannot be used.';
      else if (!isEmail(email)) fields.email = 'Enter a valid email address.';
      else if (isDisposableEmail(email)) fields.email = 'Disposable / temporary email addresses are not allowed. Please use a permanent email.';
      else if (db.findUserByEmail(email)) fields.email = 'An account with that email already exists.';

      const pw = passwordCheck(password);
      if (!pw.ok) fields.password = pw.message;
      if (!confirmPassword) fields.confirmPassword = 'Confirm your password.';
      else if (password !== confirmPassword) fields.confirmPassword = 'Passwords do not match.';

      if (Object.keys(fields).length) {
        throw badFields('Please fix the highlighted fields.', fields);
      }

      const { salt, hash } = hashPassword(password);
      const now = new Date().toISOString();
      const user = {
        id: userId(),
        fullName: String(fullName).trim(),
        username: String(username).trim(),
        email: String(email).trim().toLowerCase(),
        phone: '',
        country: '',
        passwordSalt: salt,
        passwordHash: hash,
        balance: STARTING_CENTS,
        currency: 'USD',
        createdAt: now,
        updatedAt: now,
        emailVerified: false,
        emailVerifyToken: null,
        emailVerifyExpires: null
      };
      const d = db.get();
      d.users.push(user);

      /* Real welcome + verification email (outbox mode until a provider is
         configured — the mailer never blocks signup on failure). */
      const verifyToken = token(24);
      user.emailVerifyToken = verifyToken;
      user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const proto = ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host || 'localhost:3000';
      const verifyMail = mailer.verifyEmail(user, proto + '://' + host, verifyToken);
      mailer.send({ to: user.email, subject: verifyMail.subject, html: verifyMail.html, text: verifyMail.text }).catch(() => {});

      if (STARTING_CENTS > 0) {
        d.transactions.unshift({
          id: txId(),
          payerId: null,
          payeeId: user.id,
          amount: STARTING_CENTS,
          currency: 'USD',
          type: 'topup',
          status: 'completed',
          fee: 0,
          note: 'Welcome demo funds',
          reference: referenceId(),
          method: 'Demo Wallet Top-Up',
          createdAt: now
        });
        db.notify(user.id, 'Demo funds added', `${money(STARTING_CENTS)} in welcome demo funds was added to your wallet.`, {
          type: 'success',
          link: '/wallet'
        });
      }
      db.notify(user.id, 'Welcome to PayClone', `Your demo wallet is ready, ${user.fullName.split(' ')[0]}. Explore the dashboard to get started.`, {
        type: 'info',
        link: '/dashboard'
      });

      const session = createSession(user.id, ctx.req);
      ctx.setCookie(sessionCookie(session, ctx.req.headers['x-forwarded-proto'] === 'https'));
      recordLogin(ctx, user.id, true);
      await db.save();
      return { user: toPublicUser(user), startingBalance: STARTING_CENTS };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/login',
    handler: async (ctx) => {
      const { identifier, password } = ctx.body;
      const id = String(identifier || '').trim();
      if (!id) throw badFields('Enter your email or username.', { identifier: 'Email or username is required.' });
      if (!password) throw badFields('Enter your password.', { password: 'Password is required.' });

      const user = db.findUserByIdentifier(id);
      if (!user || !passwordMatches(user, password)) {
        recordLogin(ctx, user ? user.id : null, false, id);
        throw new ApiError(401, 'Invalid email/username or password.');
      }

      const sec = db.securityFor(user.id);
      if (sec.twoFactorEnabled) {
        const pendingToken = createTwoFactorChallenge(user.id, sec.twoFactorDemoCode);
        return {
          requires2fa: true,
          pendingToken,
          demoCode: sec.twoFactorDemoCode,
          account: { fullName: user.fullName, username: user.username }
        };
      }

      const session = createSession(user.id, ctx.req);
      ctx.setCookie(sessionCookie(session, ctx.req.headers['x-forwarded-proto'] === 'https'));
      recordLogin(ctx, user.id, true);
      const settings = db.settingsFor(user.id);
      if (settings.notifications.security !== false) {
        db.notify(user.id, 'New login', `Signed in from ${uaShort(ctx.req)} · ${clientIp(ctx.req)}`, {
          type: 'security',
          link: '/security'
        });
      }
      await db.save();
      return { user: toPublicUser(user) };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/login-2fa',
    handler: async (ctx) => {
      const { pendingToken, code } = ctx.body;
      const challenge = peekTwoFactorChallenge(pendingToken);
      if (!challenge) throw new ApiError(400, 'Two-factor challenge expired. Please log in again.');

      const user = db.findUser(challenge.userId);
      const sec = user ? db.securityFor(user.id) : null;
      const entered = String(code || '').trim();
      if (!user || !sec || !sec.twoFactorDemoCode || entered !== sec.twoFactorDemoCode) {
        recordLogin(ctx, challenge.userId, false, user ? user.username : '', '2FA failed');
        await db.save();
        throw new ApiError(400, 'Invalid verification code.');
      }

      consumeTwoFactorChallenge(pendingToken);
      const session = createSession(user.id, ctx.req);
      ctx.setCookie(sessionCookie(session, ctx.req.headers['x-forwarded-proto'] === 'https'));
      recordLogin(ctx, user.id, true, '', '2FA verified');
      const settings = db.settingsFor(user.id);
      if (settings.notifications.security !== false) {
        db.notify(user.id, 'New login (2FA verified)', `Signed in with two-factor authentication from ${uaShort(ctx.req)}.`, {
          type: 'security',
          link: '/security'
        });
      }
      await db.save();
      return { user: toPublicUser(user) };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/logout',
    handler: async (ctx) => {
      destroySession(ctx.sessionToken);
      ctx.setCookie(clearCookie());
      return { ok: true };
    }
  },

  {
    method: 'GET',
    path: '/api/auth/me',
    handler: async (ctx) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated.');
      return { user: toPublicUser(ctx.user) };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/forgot',
    handler: async (ctx) => {
      const email = String(ctx.body.email || '').trim();
      if (!isEmail(email)) throw badFields('Enter a valid email address.', { email: 'Enter a valid email address.' });
      else if (emailBlockReason(email)) throw badFields(emailBlockReason(email), { email: emailBlockReason(email) });
      const user = db.findUserByEmail(email);
      if (!user) throw badFields('No account found with that email address.', { email: 'No account found with that email address.' });

      const resetToken = token(24);
      const d = db.get();
      d.passwordResets[resetToken] = {
        userId: user.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      };

      /* Send the real reset email. A mailer failure never blocks the flow —
         the response degrades gracefully to the legacy demo-token mode. */
      const proto = ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host || 'localhost:3000';
      const resetMail = mailer.resetEmail(user, proto + '://' + host, resetToken);
      const mailResult = await mailer.send({ to: user.email, subject: resetMail.subject, html: resetMail.html, text: resetMail.text });
      await db.save();

      if (mailResult.delivered) {
        return {
          ok: true,
          emailSent: true,
          message: 'A password reset link has been emailed to ' + user.email.replace(/^(.).*(@.*)$/, '$1***$2') + '. It expires in 30 minutes.'
        };
      }
      return {
        ok: true,
        demo: true,
        resetToken,
        resetPath: '#/reset/' + resetToken,
        message:
          'Demo mode: no email provider is connected, so no email was sent. Your simulated reset token is shown below — use it to choose a new password. In a real deployment this link would be emailed to you.'
      };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/reset',
    handler: async (ctx) => {
      const { token: resetToken, password, confirmPassword } = ctx.body;
      const fields = {};
      const d = db.get();
      const rec = resetToken ? d.passwordResets[resetToken] : null;
      if (!rec || new Date(rec.expiresAt).getTime() < Date.now()) {
        throw new ApiError(400, 'Invalid or expired reset token. Please request a new one.');
      }
      const pw = passwordCheck(password);
      if (!pw.ok) fields.password = pw.message;
      if (!confirmPassword) fields.confirmPassword = 'Confirm your new password.';
      else if (password !== confirmPassword) fields.confirmPassword = 'Passwords do not match.';
      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);

      const user = db.findUser(rec.userId);
      if (!user) throw new ApiError(400, 'Invalid or expired reset token. Please request a new one.');
      const { salt, hash } = hashPassword(password);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.updatedAt = new Date().toISOString();
      const sec = db.securityFor(user.id);
      sec.passwordUpdatedAt = new Date().toISOString();
      delete d.passwordResets[resetToken];
      destroyAllSessions(user.id); // force re-login on every device
      db.notify(user.id, 'Password updated', 'Your password was changed and all sessions were signed out.', {
        type: 'security',
        link: '/security'
      });
      await db.save();
      return { ok: true, message: 'Password updated. You can now log in with your new password.' };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/verify',
    handler: async (ctx) => {
      const verifyToken = String(ctx.body.token || '').trim();
      if (!verifyToken) throw badFields('Verification token is missing.', { token: 'Verification token is missing.' });
      const d = db.get();
      const user = d.users.find((u) => u.emailVerifyToken === verifyToken);
      if (!user) throw new ApiError(400, 'This verification link is invalid or has already been used.');
      if (user.emailVerifyExpires && new Date(user.emailVerifyExpires) < new Date()) {
        throw new ApiError(400, 'This verification link has expired. Please log in and request a new one.');
      }
      user.emailVerified = true;
      user.emailVerifyToken = null;
      user.emailVerifyExpires = null;
      user.updatedAt = new Date().toISOString();
      db.notify(user.id, 'Email verified', 'Your email address is confirmed. Enjoy your demo wallet!', { type: 'success', link: '/dashboard' });
      await db.save();
      return { ok: true, message: 'Your email is confirmed. Everything is ready.' };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/resend-verification',
    handler: async (ctx) => {
      const user = ctx.user;
      if (!user) throw new ApiError(401, 'You must be logged in to do that.');
      if (user.emailVerified) return { ok: true, message: 'Your email is already verified.' };
      if (!user.emailVerifyToken) {
        user.emailVerifyToken = token(24);
        user.emailVerifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
      const proto = ctx.req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = ctx.req.headers['x-forwarded-host'] || ctx.req.headers.host || 'localhost:3000';
      const mail = mailer.verifyEmail(user, proto + '://' + host, user.emailVerifyToken);
      const result = await mailer.send({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      await db.save();
      return {
        ok: true,
        emailSent: result.delivered,
        message: result.delivered
          ? 'Verification link emailed to ' + user.email.replace(/^(.).*(@.*)$/, '$1***$2') + '.'
          : 'No email provider is configured, so nothing was sent. Set RESEND_API_KEY or SMTP_* to enable real email.'
      };
    }
  },

  {
    method: 'POST',
    path: '/api/auth/change-password',
    handler: async (ctx) => {
      const user = ctx.user;
      if (!user) throw new ApiError(401, 'You must be logged in to do that.');
      const { currentPassword, newPassword, confirmPassword } = ctx.body;
      const fields = {};
      if (!currentPassword) fields.currentPassword = 'Enter your current password.';
      else if (!passwordMatches(user, currentPassword)) fields.currentPassword = 'Current password is incorrect.';
      const pw = passwordCheck(newPassword);
      if (!pw.ok) fields.newPassword = pw.message;
      else if (newPassword === currentPassword) fields.newPassword = 'New password must be different from your current password.';
      if (!confirmPassword) fields.confirmPassword = 'Confirm your new password.';
      else if (newPassword !== confirmPassword) fields.confirmPassword = 'Passwords do not match.';
      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);

      const { salt, hash } = hashPassword(newPassword);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.updatedAt = new Date().toISOString();
      const sec = db.securityFor(user.id);
      sec.passwordUpdatedAt = new Date().toISOString();
      const d = db.get();
      Object.keys(d.sessions).forEach((t) => {
        if (d.sessions[t].userId === user.id && t !== ctx.sessionToken) delete d.sessions[t];
      });
      db.notify(user.id, 'Password changed', 'Your password was updated. Other sessions were signed out.', {
        type: 'security',
        link: '/security'
      });
      await db.save();
      return { ok: true, message: 'Password changed successfully.' };
    }
  }
];
