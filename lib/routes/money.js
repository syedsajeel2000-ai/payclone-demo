'use strict';
const db = require('../db');
const {
  toCents, isEmail, isCardNumber, isExpiry, isCvv, cardBrand, last4, cardDigits,
  txId, referenceId, requestId, methodId, money
} = require('../util');
const { ApiError, requireUser } = require('../auth');
const { toPublicUser, decorate, myTransactions } = require('../shared');
const { MAX_TOPUP_CENTS } = require('../config');
const { buildReceiptHtml } = require('../receipt');

function badFields(message, fields) {
  const err = new ApiError(400, message);
  err.fields = fields;
  return err;
}

const SORTS = {
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  highest: (a, b) => b.amount - a.amount || new Date(b.createdAt) - new Date(a.createdAt),
  lowest: (a, b) => a.amount - b.amount || new Date(b.createdAt) - new Date(a.createdAt)
};

function matchesSearch(dec, q) {
  if (!q) return true;
  const hay = [
    dec.id, dec.reference, dec.note, dec.typeLabel,
    dec.counterparty && dec.counterparty.fullName,
    dec.counterparty && dec.counterparty.username,
    dec.counterparty && dec.counterparty.email,
    dec.payer && dec.payer.fullName,
    dec.payer && dec.payer.username,
    dec.payee && dec.payee.fullName,
    dec.payee && dec.payee.username,
    dec.partyLabel
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function matchesFilter(dec, filter) {
  switch (filter) {
    case 'sent': return dec.direction === 'sent';
    case 'received': return dec.direction === 'received';
    case 'added': return dec.type === 'topup';
    case 'pending': return dec.status === 'pending';
    case 'completed': return dec.status === 'completed';
    case 'failed': return dec.status === 'failed';
    default: return true;
  }
}

module.exports = [
  /* ---------------- wallet ---------------- */
  {
    method: 'GET',
    path: '/api/wallet',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const txs = myTransactions(user.id)
        .map((t) => decorate(t, user.id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const methods = db
        .get()
        .paymentMethods.filter((m) => m.userId === user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const added = txs.filter((t) => t.type === 'topup' && t.status === 'completed');
      return {
        balance: user.balance,
        currency: user.currency || 'USD',
        totalAdded: added.reduce((a, t) => a + t.amount, 0),
        recentTransactions: txs.slice(0, 6),
        paymentMethods: methods.map((m) => ({
          id: m.id, type: m.type, label: m.label, createdAt: m.createdAt
        }))
      };
    }
  },

  {
    method: 'POST',
    path: '/api/wallet/add-funds',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const { amount, method, cardNumber, expiry, cvv } = ctx.body;
      const fields = {};

      const cents = toCents(amount);
      if (amount === undefined || amount === null || String(amount).trim() === '') {
        fields.amount = 'Enter an amount.';
      } else if (cents === null || !Number.isFinite(cents)) {
        fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
      } else if (cents <= 0) {
        fields.amount = 'Amount must be greater than zero.';
      } else if (cents > MAX_TOPUP_CENTS) {
        fields.amount = `Demo top-ups are limited to ${money(MAX_TOPUP_CENTS)} per transaction.`;
      }

      const METHOD_LABELS = {
        demo_card: 'Demo Card',
        demo_bank: 'Demo Bank Transfer',
        demo_topup: 'Demo Wallet Top-Up'
      };
      if (!METHOD_LABELS[method]) fields.method = 'Choose a demo payment method.';

      let brand = null;
      let cardLast4 = null;
      if (method === 'demo_card') {
        if (!cardNumber || !isCardNumber(cardNumber)) fields.cardNumber = 'Enter a dummy card number (13–19 digits).';
        if (!expiry || !isExpiry(expiry)) fields.expiry = 'Use a valid demo expiry as MM/YY.';
        if (!cvv || !isCvv(cvv)) fields.cvv = 'Enter a 3 or 4 digit demo CVV.';
        if (!fields.cardNumber) {
          brand = cardBrand(cardNumber);
          cardLast4 = last4(cardNumber);
        }
      }

      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);

      const now = new Date().toISOString();
      const d = db.get();
      user.balance += cents;

      const label = METHOD_LABELS[method];
      const tx = {
        id: txId(),
        payerId: null,
        payeeId: user.id,
        amount: cents,
        currency: user.currency || 'USD',
        type: 'topup',
        status: 'completed',
        fee: 0,
        note: `Wallet top-up via ${label}`,
        reference: referenceId(),
        method: label,
        createdAt: now
      };
      d.transactions.unshift(tx);

      /* Register the demo payment method. ONLY the brand + last 4 digits are kept —
         full dummy card numbers are never stored. */
      const methodType = method === 'demo_card' ? 'demo_card' : method;
      const methodLabel =
        method === 'demo_card' ? `${brand} •••• ${cardLast4} (demo)` : label + ' (demo)';
      const existing = d.paymentMethods.find(
        (m) => m.userId === user.id && m.type === methodType && m.label === methodLabel
      );
      if (!existing) {
        d.paymentMethods.push({
          id: methodId(),
          userId: user.id,
          type: methodType,
          label: methodLabel,
          last4: cardLast4,
          createdAt: now
        });
        if (d.paymentMethods.filter((m) => m.userId === user.id).length > 6) {
          const mine = d.paymentMethods.filter((m) => m.userId === user.id);
          const oldest = mine[mine.length - 1];
          d.paymentMethods = d.paymentMethods.filter((m) => m.id !== oldest.id);
        }
      }

      const settings = db.settingsFor(user.id);
      if (settings.notifications.payments !== false) {
        db.notify(user.id, 'Demo funds added', `${money(cents)} was added to your wallet with ${label}.`, {
          type: 'success',
          link: '/wallet'
        });
      }
      await db.save();
      return {
        ok: true,
        message: 'Demo funds added successfully.',
        transaction: decorate(tx, user.id),
        balance: user.balance
      };
    }
  },

  /* ---------------- recipient lookup ----------------
   * Strict identifier matching: an email query matches ONLY full emails and
   * a username query matches ONLY full usernames (prefix allowed for
   * usernames). No fuzzy substring matching — searching "gmail" must never
   * list every gmail account, and one email maps to exactly one account. */
  {
    method: 'GET',
    path: '/api/users/lookup',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const raw = String(ctx.query.q || '').trim();
      const q = raw.toLowerCase();
      if (q.length < 2) return { results: [] };

      const users = db.get().users;
      const emailish = isEmail(raw) || raw.includes('@');

      let matches;
      if (emailish) {
        // email input → full-email prefix match (typing "bob@demo" finds
        // "bob@demo.test"; searching a domain fragment like "gmail" finds
        // nothing, and one full email maps to exactly one account)
        matches = users.filter((u) => u.email.toLowerCase().startsWith(q));
      } else {
        // username input → exact match first, else usernames starting with q
        matches = users.filter(
          (u) => u.username.toLowerCase() === q || u.username.toLowerCase().startsWith(q)
        );
      }

      const results = [];
      for (const u of matches) {
        if (u.id === user.id || results.length >= 8) continue;
        results.push({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
          exact: u.email.toLowerCase() === q || u.username.toLowerCase() === q
        });
      }
      return { results };
    }
  },

  /* ---------------- send money ---------------- */
  {
    method: 'POST',
    path: '/api/send',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const recipientRaw = String(ctx.body.recipient || '').trim();
      const { amount, note } = ctx.body;
      const fields = {};

      if (!recipientRaw) fields.recipient = 'Enter a recipient email or username.';
      else if (recipientRaw.length > 254) fields.recipient = 'Recipient email or username is too long.';
      else if (!isEmail(recipientRaw) && !/^[A-Za-z0-9._-]{3,40}$/.test(recipientRaw)) {
        fields.recipient = 'Enter a valid email address or username.';
      }

      const cents = toCents(amount);
      if (amount === undefined || amount === null || String(amount).trim() === '') {
        fields.amount = 'Enter an amount.';
      } else if (cents === null) {
        fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
      } else if (cents <= 0) {
        fields.amount = 'Amount must be greater than zero.';
      } else if (cents > user.balance) {
        fields.amount = `Insufficient demo balance. Your available balance is ${money(user.balance)}.`;
      }

      if (note !== undefined && note !== null && String(note).length > 200) {
        fields.note = 'Note must be 200 characters or fewer.';
      }

      let recipient = null;
      if (!fields.recipient) {
        recipient = isEmail(recipientRaw)
          ? db.findUserByEmail(recipientRaw)
          : db.findUserByUsername(recipientRaw);
        if (!recipient) recipient = db.findUserByIdentifier(recipientRaw);
        if (!recipient) fields.recipient = 'No user found with that email or username.';
        else if (recipient.id === user.id) fields.recipient = 'You cannot send money to yourself.';
      }

      if (Object.keys(fields).length) throw badFields('Payment could not be sent.', fields);

      const now = new Date().toISOString();
      const d = db.get();
      const tx = {
        id: txId(),
        payerId: user.id,
        payeeId: recipient.id,
        amount: cents,
        currency: user.currency || 'USD',
        type: 'transfer',
        status: 'completed',
        fee: 0,
        note: String(note || '').trim().slice(0, 200),
        reference: referenceId(),
        method: 'Demo Wallet Transfer',
        createdAt: now,
        paidAt: now
      };

      user.balance -= cents;
      recipient.balance += cents;
      d.transactions.unshift(tx);

      const senderSettings = db.settingsFor(user.id);
      const recipientSettings = db.settingsFor(recipient.id);
      if (senderSettings.notifications.payments !== false) {
        db.notify(user.id, 'Payment sent', `You sent ${money(cents)} to ${recipient.username}.`, {
          type: 'sent',
          link: '/transactions/' + tx.id
        });
      }
      if (recipientSettings.notifications.payments !== false) {
        db.notify(recipient.id, 'Payment received', `${user.fullName} (@${user.username}) sent you ${money(cents)}.`, {
          type: 'received',
          link: '/transactions/' + tx.id
        });
      }
      await db.save();

      return {
        ok: true,
        message: 'Payment sent successfully.',
        transaction: decorate(tx, user.id),
        recipient: toPublicUser(db.findUser(recipient.id)),
        balance: user.balance
      };
    }
  },

  /* ---------------- payment requests (receive money) ---------------- */
  {
    method: 'GET',
    path: '/api/requests',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const items = myTransactions(user.id)
        .filter((t) => t.type === 'payment_request')
        .map((t) => decorate(t, user.id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { items };
    }
  },

  {
    method: 'POST',
    path: '/api/requests',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const { amount, message } = ctx.body;
      const fields = {};
      const cents = toCents(amount);
      if (amount === undefined || amount === null || String(amount).trim() === '') {
        fields.amount = 'Enter an amount.';
      } else if (cents === null) {
        fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
      } else if (cents <= 0) {
        fields.amount = 'Amount must be greater than zero.';
      } else if (cents > 100000000) {
        fields.amount = 'Demo requests are limited to $1,000,000.00.';
      }
      if (message !== undefined && message !== null && String(message).length > 200) {
        fields.message = 'Message must be 200 characters or fewer.';
      }
      if (Object.keys(fields).length) throw badFields('Please fix the highlighted fields.', fields);

      const ref = requestId();
      const tx = {
        id: txId(),
        payerId: null,
        payeeId: user.id,
        amount: cents,
        currency: user.currency || 'USD',
        type: 'payment_request',
        status: 'pending',
        fee: 0,
        note: String(message || '').trim().slice(0, 200),
        reference: ref,
        method: 'Payment Request',
        createdAt: new Date().toISOString()
      };
      db.get().transactions.unshift(tx);
      await db.save();
      return {
        ok: true,
        message: 'Payment request created.',
        reference: ref,
        paymentPath: '#/pay/' + ref,
        transaction: decorate(tx, user.id)
      };
    }
  },

  {
    method: 'GET',
    path: '/api/requests/:ref',
    handler: async (ctx) => {
      const ref = String(ctx.params.ref || '').toUpperCase();
      const tx = db
        .get()
        .transactions.find(
          (t) => t.type === 'payment_request' && String(t.reference).toUpperCase() === ref
        );
      if (!tx) throw new ApiError(404, 'Payment request not found.');
      const requester = db.findUser(tx.payeeId);
      if (!requester) throw new ApiError(404, 'Payment request not found.');
      const viewer = ctx.user;
      const isOwner = viewer && viewer.id === requester.id;
      return {
        reference: tx.reference,
        transactionId: tx.id,
        amount: tx.amount,
        currency: tx.currency || 'USD',
        message: tx.note,
        status: tx.status,
        createdAt: tx.createdAt,
        paidAt: tx.paidAt || null,
        requester: {
          id: requester.id,
          fullName: requester.fullName,
          username: requester.username,
          email: requester.email
        },
        viewer: viewer ? { id: viewer.id, balance: viewer.balance } : null,
        canPay: !!viewer && !isOwner && tx.status === 'pending' && viewer.balance >= tx.amount,
        isOwner: !!isOwner
      };
    }
  },

  {
    method: 'POST',
    path: '/api/requests/:ref/pay',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const ref = String(ctx.params.ref || '').toUpperCase();
      const d = db.get();
      const tx = d.transactions.find(
        (t) => t.type === 'payment_request' && String(t.reference).toUpperCase() === ref
      );
      if (!tx) throw new ApiError(404, 'Payment request not found.');
      if (tx.status !== 'pending' || tx.payerId) {
        throw new ApiError(400, 'This payment request has already been paid.');
      }
      if (tx.payeeId === user.id) throw new ApiError(400, 'You cannot pay your own request.');
      if (tx.amount <= 0) throw new ApiError(400, 'This request has an invalid amount.');
      if (tx.amount > user.balance) {
        throw new ApiError(400, `Insufficient demo balance. Your available balance is ${money(user.balance)}.`);
      }

      const now = new Date().toISOString();
      const requester = db.findUser(tx.payeeId);
      user.balance -= tx.amount;
      requester.balance += tx.amount;
      tx.payerId = user.id;
      tx.status = 'completed';
      tx.paidAt = now;

      const payerSettings = db.settingsFor(user.id);
      const payeeSettings = db.settingsFor(requester.id);
      if (payerSettings.notifications.payments !== false) {
        db.notify(user.id, 'Payment request paid', `You paid ${money(tx.amount)} to ${requester.username}.`, {
          type: 'sent',
          link: '/transactions/' + tx.id
        });
      }
      if (payeeSettings.notifications.requests !== false) {
        db.notify(requester.id, 'Payment request fulfilled', `${user.fullName} (@${user.username}) paid your request of ${money(tx.amount)}.`, {
          type: 'received',
          link: '/transactions/' + tx.id
        });
      }
      await db.save();
      return {
        ok: true,
        message: 'Payment sent successfully.',
        transaction: decorate(tx, user.id),
        balance: user.balance
      };
    }
  },

  {
    method: 'DELETE',
    path: '/api/requests/:ref',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const ref = String(ctx.params.ref || '').toUpperCase();
      const d = db.get();
      const tx = d.transactions.find(
        (t) => t.type === 'payment_request' && String(t.reference).toUpperCase() === ref
      );
      if (!tx) throw new ApiError(404, 'Payment request not found.');
      if (tx.payeeId !== user.id) throw new ApiError(403, 'You can only cancel your own requests.');
      if (tx.payerId || tx.status === 'completed') {
        throw new ApiError(400, 'This request has already been paid and cannot be cancelled.');
      }
      d.transactions = d.transactions.filter((t) => t.id !== tx.id);
      await db.save();
      return { ok: true, message: 'Payment request cancelled.' };
    }
  },

  /* ---------------- transactions ---------------- */
  {
    method: 'GET',
    path: '/api/transactions',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const search = String(ctx.query.search || '').trim().toLowerCase();
      const filter = String(ctx.query.filter || 'all');
      const sort = String(ctx.query.sort || 'newest');
      if (!['all', 'sent', 'received', 'added', 'pending', 'completed', 'failed'].includes(filter)) {
        throw new ApiError(400, 'Unknown transaction filter.');
      }
      if (!SORTS[sort]) throw new ApiError(400, 'Unknown sort order.');

      let items = myTransactions(user.id).map((t) => decorate(t, user.id));
      items = items.filter((d) => matchesSearch(d, search) && matchesFilter(d, filter));
      items.sort(SORTS[sort]);

      const all = myTransactions(user.id).map((t) => decorate(t, user.id));
      const totals = {
        sent: all.filter((t) => t.direction === 'sent' && t.status === 'completed').reduce((a, t) => a + t.amount, 0),
        received: all.filter((t) => t.direction === 'received' && t.status === 'completed').reduce((a, t) => a + t.amount, 0),
        added: all.filter((t) => t.type === 'topup' && t.status === 'completed').reduce((a, t) => a + t.amount, 0),
        count: all.length
      };
      return { items, totals, count: items.length };
    }
  },

  {
    method: 'GET',
    path: '/api/transactions/:id',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const id = String(ctx.params.id || '').toUpperCase();
      const tx = db.get().transactions.find((t) => t.id.toUpperCase() === id);
      if (!tx) throw new ApiError(404, 'Transaction not found.');
      if (tx.payerId !== user.id && tx.payeeId !== user.id) {
        throw new ApiError(403, 'You do not have access to this transaction.');
      }
      return { transaction: decorate(tx, user.id) };
    }
  },

  {
    method: 'GET',
    path: '/api/transactions/:id/receipt',
    handler: async (ctx) => {
      const user = requireUser(ctx);
      const id = String(ctx.params.id || '').toUpperCase();
      const tx = db.get().transactions.find((t) => t.id.toUpperCase() === id);
      if (!tx) throw new ApiError(404, 'Transaction not found.');
      if (tx.payerId !== user.id && tx.payeeId !== user.id) {
        throw new ApiError(403, 'You do not have access to this transaction.');
      }
      const html = buildReceiptHtml(decorate(tx, user.id), user);
      ctx.res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="receipt-${tx.id}.html"`,
        'Cache-Control': 'no-store'
      });
      ctx.res.end(html);
      return { __raw: true };
    }
  }
];
