'use strict';
/* PayClone mailer — real email sending with zero npm dependencies.
 *
 * Providers (auto-selected by env, in this order):
 *   1. RESEND_API_KEY set          → Resend HTTP API (simplest, generous free tier)
 *   2. SMTP_HOST + SMTP_USER set   → any SMTP server via STARTTLS/SSL (Gmail App
 *                                    Password, Brevo, Mailgun, Zoho, ...)
 *   3. Neither set                 → OUTBOX mode: emails are written to
 *                                    data/outbox/*.eml (open in any mail client
 *                                    or VS Code extension) — dev/test without creds.
 *
 * Client code just does:  const mailer = require('./mailer');
 *                         await mailer.send({ to, subject, html, text });
 * `send()` always resolves `{ delivered, provider, error? }` and NEVER throws —
 * a mail outage must not break signup or payments.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_SECURE = process.env.SMTP_SECURE === '1' || SMTP_PORT === 465;
const MAIL_FROM = process.env.MAIL_FROM || 'PayClone Demo <onboarding@resend.dev>';
const OUTBOX_DIR = path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data'), 'outbox');

const provider = RESEND_KEY ? 'resend' : SMTP_USER ? 'smtp' : 'outbox';

/* ------------------------------------------------------------------ */

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --- minimal MIME: date, from, to, subject, multipart/alternative --- */
function buildEml({ to, subject, html, text }) {
  const boundary = 'pc_' + crypto.randomBytes(8).toString('hex');
  const lines = [
    'From: ' + MAIL_FROM,
    'To: ' + to,
    'Subject: ' + subject.replace(/[\r\n]+/g, ' ').trim(),
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'X-Mailer: PayClone-Demo',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    'This is a multi-part message in MIME format.',
    '--' + boundary,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text || '',
    '--' + boundary,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html || '',
    '--' + boundary + '--',
    ''
  ];
  return lines.join('\r\n');
}

async function sendViaResend(eml, to) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: eml.split('Subject: ')[1].split('\r\n')[0], html: eml.split('Content-Transfer-Encoding: 8bit\r\n\r\n').slice(-1)[0].split('\r\n--')[0], text: undefined })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || 'resend error ' + res.status);
  return json.id;
}

/* --- tiny SMTP client: enough of RFC 5321 for AUTH LOGIN + MAIL/RCPT/DATA --- */
function smtpConnect(port, host, secure) {
  return new Promise((resolve, reject) => {
    const net = secure ? require('tls') : require('net');
    const sock = secure ? net.connect({ host, port }) : net.connect({ host, port });
    sock.setTimeout(15000);
    const fail = (e) => { try { sock.destroy(); } catch (e2) {} reject(e); };
    sock.once('error', fail);
    sock.once('timeout', () => fail(new Error('smtp connect timeout')));
    sock.once(secure ? 'secureConnect' : 'connect', () => resolve(sock));
  });
}

function smtpRead(sock, code) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += String(d);
      if (/\r?\n$/.test(buf) && new RegExp('^' + code).test(buf)) {
        sock.removeListener('data', onData);
        sock.removeListener('error', reject);
        sock.removeListener('timeout', onTimeout);
        resolve(buf);
      }
    };
    const onTimeout = () => {
      sock.removeListener('data', onData);
      sock.removeListener('error', reject);
      reject(new Error('smtp timeout waiting for ' + code));
    };
    sock.on('data', onData);
    sock.on('error', reject);
    sock.on('timeout', onTimeout);
  });
}

function smtpCmd(sock, cmd, code) {
  return new Promise((resolve, reject) => {
    sock.write(cmd + '\r\n', () => smtpRead(sock, code).then(resolve, reject));
  });
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

/* MIME header escaping for subjects with non-ASCII chars. */
function encodeSubject(subject) {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject.replace(/[\r\n]+/g, ' ').trim();
  return '=?utf-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
}

async function sendViaSMTP(eml, { to, subject }) {
  const sock = await smtpConnect(SMTP_PORT, SMTP_HOST, SMTP_SECURE);
  try {
    await smtpRead(sock, '220');
    const ehlo = 'EHLO payclone.demo';
    sock.write(ehlo + '\r\n');
    const feats = await smtpRead(sock, '250');
    let esmtp = feats;
    if (/STARTTLS/i.test(feats)) {
      await smtpCmd(sock, 'STARTTLS', '220');
      const tls = require('tls');
      const secureSock = tls.connect({ socket: sock, servername: SMTP_HOST });
      await new Promise((res, rej) => { secureSock.once('secureConnect', res); secureSock.once('error', rej); });
      sock.removeAllListeners();
      Object.setPrototypeOf(sock, {});
      // Re-run EHLO inside TLS using the secure socket from now on.
      return await sendViaSMTPSocket(secureSock, { to, subject, eml, esmtp: null });
    }
    return await sendViaSMTPSocket(sock, { to, subject, eml, esmtp: feats });
  } catch (err) {
    try { sock.destroy(); } catch (e) { /* ignore */ }
    throw err;
  }
}

async function sendViaSMTPSocket(sock, { eml, subject }) {
  await smtpCmd(sock, 'EHLO payclone.demo', '250');
  await smtpCmd(sock, 'AUTH LOGIN', '334');
  await smtpCmd(sock, b64(SMTP_USER), '334');
  await smtpCmd(sock, b64(SMTP_PASS), '235');
  await smtpCmd(sock, 'MAIL FROM:<' + (MAIL_FROM.match(/<(.+)>/)[1] || SMTP_USER) + '>', '250');
  await smtpCmd(sock, 'RCPT TO:<' + to + '>', '250');
  await smtpCmd(sock, 'DATA', '354');
  sock.write(eml.replace(/^\./gm, '..') + '\r\n.\r\n');
  await smtpRead(sock, '250');
  sock.write('QUIT\r\n');
  sock.end();
}

async function writeToOutbox(eml) {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const file = path.join(OUTBOX_DIR, new Date().toISOString().replace(/[:.]/g, '-') + '.eml');
  fs.writeFileSync(file, eml, 'utf8');
  return file;
}

/* ------------------------------------------------------------------ */

async function send({ to, subject, html, text, skipOutbox }) {
  const body = { to: String(to), subject: String(subject), html: html ? String(html) : null, text: text ? String(text) : null };
  if (!body.to || body.to.indexOf('@') === -1) return { delivered: false, provider, error: 'invalid recipient' };
  const eml = buildEml({ to: body.to, subject: body.subject, html: body.html, text: body.text });

  if (provider === 'resend') {
    try {
      const id = await sendViaResend(eml, body.to);
      return { delivered: true, provider, id };
    } catch (err) {
      const f = await writeToOutbox(eml).catch(() => null);
      return { delivered: false, provider, error: err.message, outbox: f };
    }
  }

  if (provider === 'smtp') {
    try {
      await sendViaSMTP(eml, body);
      return { delivered: true, provider };
    } catch (err) {
      const f = await writeToOutbox(eml).catch(() => null);
      return { delivered: false, provider, error: err.message, outbox: f };
    }
  }

  const f = await writeToOutbox(eml);
  return { delivered: false, provider: 'outbox', outbox: f };
}

/* ------------------------------------------------------------------ *
 * Branded templates                                                   *
 * ------------------------------------------------------------------ */

function layout(title, bodyHtml) {
  return (
    '<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;">' +
    '<div style="max-width:560px;margin:0 auto;padding:32px 16px;">' +
    '<div style="text-align:center;margin-bottom:24px;"><span style="font-size:22px;font-weight:700;color:#0b1b33;letter-spacing:-0.02em;">Pay' +
    '<span style="color:#2563eb">Clone</span></span></div>' +
    '<div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e6eaf2;">' +
    '<h1 style="margin:0 0 16px;font-size:20px;color:#0b1b33;">' + title + '</h1>' +
    bodyHtml +
    '</div>' +
    '<p style="text-align:center;color:#8a94a6;font-size:12px;margin-top:24px;">PayClone demo payment platform — no real money is transferred.</p>' +
    '</div></body></html>'
  );
}

function button(url, label) {
  return (
    '<p style="margin:24px 0 8px;"><a href="' + url + '" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;">' + label + '</a></p>' +
    '<p style="color:#8a94a6;font-size:12px;word-break:break-all;">Or paste this link into your browser:<br>' + url + '</p>'
  );
}

function verifyEmail(user, baseUrl, token) {
  const url = baseUrl + '/#/verify/' + token;
  return {
    subject: 'Verify your PayClone email',
    html: layout(
      'Confirm your email address',
      '<p style="color:#3d4a5f;font-size:14px;line-height:1.6;margin:0 0 8px;">Hi ' + escapeHtml(user.fullName.split(' ')[0]) + ', welcome to PayClone! Click below to verify <strong>' + escapeHtml(user.email) + '</strong>. This link expires in 24 hours.</p>' +
        button(url, 'Verify email')
    ),
    text: 'Welcome to PayClone! Verify your email: ' + url + ' (expires in 24h)'
  };
}

function resetEmail(user, baseUrl, token) {
  const url = baseUrl + '/#/reset/' + token;
  return {
    subject: 'Reset your PayClone password',
    html: layout(
      'Password reset requested',
      '<p style="color:#3d4a5f;font-size:14px;line-height:1.6;margin:0 0 8px;">Hi ' + escapeHtml(user.fullName.split(' ')[0]) + ', we received a request to reset the password for <strong>' + escapeHtml(user.email) + '</strong>. The link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p>' +
        button(url, 'Choose a new password')
    ),
    text: 'Reset your PayClone password: ' + url + ' (expires in 30 minutes)'
  };
}

function receiptEmail(user, tx, receiptHtml) {
  return {
    subject: 'Your PayClone receipt — ' + tx.id,
    html: receiptHtml,
    text: 'Receipt for ' + tx.id + ' — view it in the PayClone app.'
  };
}

module.exports = {
  provider,
  send,
  verifyEmail,
  resetEmail,
  receiptEmail,
  OUTBOX_DIR
};
