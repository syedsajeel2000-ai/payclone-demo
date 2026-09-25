'use strict';
const db = require('./db');
const { clientIp, uaShort } = require('./util');

/* Never expose password material or internal fields to the client. */
function toPublicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone || '',
    country: u.country || '',
    balance: u.balance,
    currency: u.currency || 'USD',
    createdAt: u.createdAt
  };
}

function shortProfile(u) {
  if (!u) return null;
  return { id: u.id, fullName: u.fullName, username: u.username, email: u.email };
}

/*
 * A single transfer record is shared by both parties so transaction IDs always match.
 * Direction / display labels are computed from the viewer's perspective.
 */
function decorate(tx, viewerId) {
  const d = db.get();
  const isPayer = tx.payerId === viewerId;
  const isPayee = tx.payeeId === viewerId;

  let direction;
  if (tx.type === 'topup') direction = 'added';
  else if (tx.payerId && isPayer) direction = 'sent';
  else direction = 'received';

  const otherId = direction === 'sent' ? tx.payeeId : tx.payerId;
  const other = otherId ? db.findUser(otherId) : null;

  let typeLabel = tx.type;
  if (tx.type === 'transfer') typeLabel = direction === 'sent' ? 'Money Sent' : 'Money Received';
  else if (tx.type === 'topup') typeLabel = 'Wallet Top-Up';
  else if (tx.type === 'payment_request') typeLabel = 'Payment Request';

  return {
    id: tx.id,
    amount: tx.amount,
    currency: tx.currency || 'USD',
    fee: tx.fee || 0,
    type: tx.type,
    typeLabel,
    status: tx.status,
    direction,
    note: tx.note || '',
    reference: tx.reference || '',
    method: tx.method || null,
    createdAt: tx.createdAt,
    paidAt: tx.paidAt || null,
    requester: tx.payeeId ? shortProfile(db.findUser(tx.payeeId)) : null,
    payer: tx.payerId ? shortProfile(db.findUser(tx.payerId)) : null,
    counterparty: other ? shortProfile(other) : null,
    partyLabel: tx.type === 'topup' ? (tx.method || 'Demo Payment Method') : null,
    isMine: isPayer || isPayee
  };
}

function recordLogin(ctx, userId, success, identifier = '', note = '') {
  const d = db.get();
  d.loginActivity.unshift({
    id: 'la_' + Math.random().toString(36).slice(2, 10),
    userId: userId || null,
    identifier: identifier ? String(identifier).slice(0, 60) : '',
    ip: clientIp(ctx.req),
    device: uaShort(ctx.req),
    success: !!success,
    note,
    createdAt: new Date().toISOString()
  });
  if (d.loginActivity.length > 300) d.loginActivity.length = 300;
}

function myTransactions(userId) {
  return db
    .get()
    .transactions.filter((t) => t.payerId === userId || t.payeeId === userId);
}

function sum(list) {
  return list.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
}

module.exports = { toPublicUser, shortProfile, decorate, recordLogin, myTransactions, sum };
