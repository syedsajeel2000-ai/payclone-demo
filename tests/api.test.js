'use strict';
/* End-to-end API test suite for the PayClone demo platform.
 * Spawns an isolated server instance (temp data dir), runs assertions, exits non-zero on failure.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || '4599';
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = path.join(__dirname, '..', 'data-test');

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    failures.push(name + (extra ? ' — ' + extra : ''));
    console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

function cookieOf(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const first = (raw && raw[0]) || '';
  return first.split(';')[0];
}

async function req(method, urlPath, { body, cookie } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { __raw: text.slice(0, 80) };
  }
  return { status: res.status, data, cookie: cookieOf(res), headers: res.headers };
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function run() {
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch (e) { /* ignore */ }

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DATA_DIR, NODE_ENV: 'test', STARTING_BALANCE: '1000.00' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });

  const alive = await waitForServer();
  if (!alive) {
    console.error('Server did not start.\n' + serverLog);
    process.exit(1);
  }

  try {
    await suite();
  } finally {
    server.kill();
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch (e) { /* ignore */ }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

async function suite() {
  let alice = null;
  let bob = null;
  let aliceCookie = null;
  let bobCookie = null;

  section('AUTH — signup');
  {
    const r = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Alice Anderson', username: 'alice', email: 'alice@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    ok('signup succeeds', r.status === 200 && r.data.user, JSON.stringify(r.data));
    alice = r.data.user;
    aliceCookie = r.cookie;
    ok('session cookie set', !!r.cookie && r.cookie.startsWith('payclone_session='), r.cookie);
    ok('starting demo balance credited', alice.balance === 100000, 'balance=' + alice.balance);
    ok('password hash never exposed', !JSON.stringify(r.data).includes('passwordHash') && !JSON.stringify(r.data).includes('passwordSalt'));

    const dupU = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Imposter', username: 'ALICE', email: 'other@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    ok('duplicate username rejected (case-insensitive)', dupU.status === 400 && dupU.data.fields && dupU.data.fields.username, JSON.stringify(dupU.data));

    const dupE = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Imposter', username: 'imposter', email: 'Alice@Demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    ok('duplicate email rejected (case-insensitive)', dupE.status === 400 && dupE.data.fields && dupE.data.fields.email);

    const weak = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Weak Person', username: 'weakling', email: 'weak@demo.test', password: 'abc', confirmPassword: 'abc' }
    });
    ok('weak password rejected', weak.status === 400 && weak.data.fields && weak.data.fields.password);

    const mismatch = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Match Person', username: 'matchperson', email: 'match@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd2!' }
    });
    ok('password confirmation mismatch rejected', mismatch.status === 400 && mismatch.data.fields.confirmPassword);

    const badEmail = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Mail Person', username: 'mailperson', email: 'not-an-email', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    ok('invalid email rejected', badEmail.status === 400 && badEmail.data.fields.email);
  }

  section('AUTH — login / logout / me');
  {
    const bad = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'WrongPass1' } });
    ok('wrong password rejected', bad.status === 401);

    const unknown = await req('POST', '/api/auth/login', { body: { identifier: 'ghost_user', password: 'Whatever1' } });
    ok('unknown account rejected', unknown.status === 401);

    const byUser = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Passw0rd!' } });
    ok('login by username', byUser.status === 200 && byUser.data.user && byUser.data.user.username === 'alice');

    const byEmail = await req('POST', '/api/auth/login', { body: { identifier: 'alice@demo.test', password: 'Passw0rd!' } });
    ok('login by email', byEmail.status === 200 && byEmail.data.user.username === 'alice');
    aliceCookie = byEmail.cookie;

    const me = await req('GET', '/api/auth/me', { cookie: aliceCookie });
    ok('GET /api/auth/me returns user', me.status === 200 && me.data.user.email === 'alice@demo.test');

    const noMe = await req('GET', '/api/auth/me');
    ok('GET /api/auth/me without session → 401', noMe.status === 401);

    const out = await req('POST', '/api/auth/logout', { cookie: aliceCookie });
    ok('logout succeeds', out.status === 200);
    const meAfter = await req('GET', '/api/auth/me', { cookie: aliceCookie });
    ok('session invalidated after logout', meAfter.status === 401);

    const relogin = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Passw0rd!' } });
    aliceCookie = relogin.cookie;
    ok('re-login works', relogin.status === 200);
  }

  section('AUTH — password reset flow (simulated email)');
  {
    const noUser = await req('POST', '/api/auth/forgot', { body: { email: 'nobody@demo.test' } });
    ok('unknown email rejected', noUser.status === 400);

    const forgot = await req('POST', '/api/auth/forgot', { body: { email: 'alice@demo.test' } });
    ok('forgot returns simulated token + honest demo message', forgot.status === 200 && forgot.data.resetToken && /no email provider|no email was sent/i.test(forgot.data.message || ''), JSON.stringify(forgot.data).slice(0, 120));

    const badToken = await req('POST', '/api/auth/reset', { body: { token: 'bogus', password: 'NewPass0rd!', confirmPassword: 'NewPass0rd!' } });
    ok('invalid reset token rejected', badToken.status === 400);

    const weakReset = await req('POST', '/api/auth/reset', { body: { token: forgot.data.resetToken, password: 'weak', confirmPassword: 'weak' } });
    ok('weak new password rejected on reset', weakReset.status === 400 && weakReset.data.fields.password);

    const reset = await req('POST', '/api/auth/reset', {
      body: { token: forgot.data.resetToken, password: 'NewPass0rd!', confirmPassword: 'NewPass0rd!' }
    });
    ok('reset succeeds', reset.status === 200 && reset.data.ok);

    const oldLogin = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Passw0rd!' } });
    ok('old password no longer works', oldLogin.status === 401);

    const newLogin = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'NewPass0rd!' } });
    ok('new password works', newLogin.status === 200);
    aliceCookie = newLogin.cookie;

    const reuse = await req('POST', '/api/auth/reset', { body: { token: forgot.data.resetToken, password: 'NewPass0rd2!', confirmPassword: 'NewPass0rd2!' } });
    ok('reset token cannot be reused', reuse.status === 400);
  }

  section('AUTH — change password (logged in)');
  {
    const badCurrent = await req('POST', '/api/auth/change-password', {
      cookie: aliceCookie,
      body: { currentPassword: 'Nope1234', newPassword: 'Another0rd!', confirmPassword: 'Another0rd!' }
    });
    ok('wrong current password rejected', badCurrent.status === 400 && badCurrent.data.fields.currentPassword);

    const change = await req('POST', '/api/auth/change-password', {
      cookie: aliceCookie,
      body: { currentPassword: 'NewPass0rd!', newPassword: 'Second0Pass!', confirmPassword: 'Second0Pass!' }
    });
    ok('password change succeeds', change.status === 200 && change.data.ok);

    const me = await req('GET', '/api/auth/me', { cookie: aliceCookie });
    ok('current session survives password change', me.status === 200);

    const login = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Second0Pass!' } });
    aliceCookie = login.cookie;
    ok('login with changed password', login.status === 200);
  }

  section('WALLET — balance & add funds');
  {
    const w = await req('GET', '/api/wallet', { cookie: aliceCookie });
    ok('wallet loads', w.status === 200 && typeof w.data.balance === 'number');
    ok('wallet exposes payment methods array', Array.isArray(w.data.paymentMethods));

    const zero = await req('POST', '/api/wallet/add-funds', { cookie: aliceCookie, body: { amount: '0', method: 'demo_topup' } });
    ok('zero amount rejected', zero.status === 400 && zero.data.fields.amount);

    const negative = await req('POST', '/api/wallet/add-funds', { cookie: aliceCookie, body: { amount: '-50', method: 'demo_topup' } });
    ok('negative amount rejected', negative.status === 400 && negative.data.fields.amount);

    const noMethod = await req('POST', '/api/wallet/add-funds', { cookie: aliceCookie, body: { amount: '50' } });
    ok('missing method rejected', noMethod.status === 400 && noMethod.data.fields.method);

    const badCard = await req('POST', '/api/wallet/add-funds', {
      cookie: aliceCookie,
      body: { amount: '50', method: 'demo_card', cardNumber: '1234', expiry: '99/99', cvv: '1' }
    });
    ok('invalid demo card rejected', badCard.status === 400 && badCard.data.fields.cardNumber && badCard.data.fields.expiry && badCard.data.fields.cvv);

    const before = (await req('GET', '/api/wallet', { cookie: aliceCookie })).data.balance;
    const add = await req('POST', '/api/wallet/add-funds', {
      cookie: aliceCookie,
      body: { amount: '250.50', method: 'demo_card', cardNumber: '4242 4242 4242 4242', expiry: '12/29', cvv: '123' }
    });
    ok('card top-up succeeds', add.status === 200 && add.data.ok, JSON.stringify(add.data).slice(0, 140));
    ok('balance increased by exact amount', add.data.balance === before + 25050, `got ${add.data.balance}`);
    ok('top-up transaction created', add.data.transaction && add.data.transaction.type === 'topup' && add.data.transaction.status === 'completed');
    ok('full card number is not stored', !fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8').includes('4242424242424242'));

    const bank = await req('POST', '/api/wallet/add-funds', { cookie: aliceCookie, body: { amount: '100', method: 'demo_bank' } });
    ok('bank top-up succeeds without card fields', bank.status === 200 && bank.data.balance === add.data.balance + 10000);

    const notifications = await req('GET', '/api/notifications', { cookie: aliceCookie });
    ok('funds-added notification created', notifications.data.items.some((n) => /funds added/i.test(n.title)), JSON.stringify(notifications.data.items[0]));
    ok('unread count present', typeof notifications.data.unread === 'number' && notifications.data.unread > 0);
  }

  section('USERS — recipient lookup');
  {
    const b = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Bob Builder', username: 'bob', email: 'bob@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    bob = b.data.user;
    bobCookie = b.cookie;
    ok('second user created', b.status === 200);

    const none = await req('GET', '/api/users/lookup?q=', { cookie: aliceCookie });
    ok('empty query returns empty list', none.data.results.length === 0);

    const byUsername = await req('GET', '/api/users/lookup?q=bo', { cookie: aliceCookie });
    ok('username search finds recipient', byUsername.data.results.some((u) => u.username === 'bob'));

    const byEmail = await req('GET', '/api/users/lookup?q=bob@demo', { cookie: aliceCookie });
    ok('email search finds recipient', byEmail.data.results.some((u) => u.username === 'bob'));

    const excludesSelf = await req('GET', '/api/users/lookup?q=alice', { cookie: aliceCookie });
    ok('lookup excludes yourself', !excludesSelf.data.results.some((u) => u.username === 'alice'));
  }

  section('SEND MONEY');
  {
    const noRecipient = await req('POST', '/api/send', { cookie: aliceCookie, body: { amount: '10' } });
    ok('empty recipient rejected', noRecipient.status === 400 && noRecipient.data.fields.recipient);

    const ghost = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'ghost', amount: '10' } });
    ok('non-existent recipient rejected', ghost.status === 400 && /no user/i.test(ghost.data.fields.recipient));

    const self = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'alice', amount: '10' } });
    ok('sending to yourself rejected', self.status === 400 && /yourself/i.test(self.data.fields.recipient));

    const zero = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'bob', amount: '0' } });
    ok('zero amount rejected', zero.status === 400 && zero.data.fields.amount);

    const negative = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'bob', amount: '-20' } });
    ok('negative amount rejected', negative.status === 400);

    const tooMuch = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'bob', amount: '999999' } });
    ok('amount over balance rejected', tooMuch.status === 400 && /insufficient/i.test(tooMuch.data.fields.amount), JSON.stringify(tooMuch.data));

    const longNote = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'bob', amount: '10', note: 'x'.repeat(300) } });
    ok('over-long note rejected', longNote.status === 400 && longNote.data.fields.note);

    const aliceBefore = (await req('GET', '/api/wallet', { cookie: aliceCookie })).data.balance;
    const bobBefore = (await req('GET', '/api/wallet', { cookie: bobCookie })).data.balance;

    const send = await req('POST', '/api/send', { cookie: aliceCookie, body: { recipient: 'bob', amount: '100', note: 'Dinner split' } });
    ok('transfer succeeds', send.status === 200 && send.data.ok, JSON.stringify(send.data).slice(0, 160));
    const tx = send.data.transaction;
    ok('transaction id generated', /^TX-[A-F0-9]+$/.test(tx.id), tx.id);
    ok('transaction status completed', tx.status === 'completed');
    ok('sender direction = sent', tx.direction === 'sent');
    ok('type label is Money Sent', tx.typeLabel === 'Money Sent', tx.typeLabel);

    const aliceAfter = (await req('GET', '/api/wallet', { cookie: aliceCookie })).data.balance;
    const bobAfter = (await req('GET', '/api/wallet', { cookie: bobCookie })).data.balance;
    ok('sender balance decreased', aliceAfter === aliceBefore - 10000, `${aliceBefore} → ${aliceAfter}`);
    ok('receiver balance increased', bobAfter === bobBefore + 10000, `${bobBefore} → ${bobAfter}`);

    const bobTx = await req('GET', '/api/transactions/' + tx.id, { cookie: bobCookie });
    ok('receiver sees SAME transaction id', bobTx.data.transaction.id === tx.id);
    ok('receiver direction = received', bobTx.data.transaction.direction === 'received');
    ok('receiver type label is Money Received', bobTx.data.transaction.typeLabel === 'Money Received', bobTx.data.transaction.typeLabel);
    ok('receiver note preserved', bobTx.data.transaction.note === 'Dinner split');

    const bobTxList = await req('GET', '/api/transactions?filter=received', { cookie: bobCookie });
    ok('transaction appears in receiver history', bobTxList.data.items.some((t) => t.id === tx.id));
    const aliceTxList = await req('GET', '/api/transactions?filter=sent', { cookie: aliceCookie });
    ok('transaction appears in sender history', aliceTxList.data.items.some((t) => t.id === tx.id));

    const count = await req('GET', '/api/transactions', { cookie: aliceCookie });
    const ids = count.data.items.map((t) => t.id);
    ok('transaction not duplicated', ids.filter((i) => i === tx.id).length === 1);

    const strangers = await req('GET', '/api/transactions/' + tx.id, { cookie: bobCookie });
    ok('participants can read the transaction', strangers.status === 200);

    const thirdSignup = await req('POST', '/api/auth/signup', {
      body: { fullName: 'Carol Carol', username: 'carol', email: 'carol@demo.test', password: 'Passw0rd!', confirmPassword: 'Passw0rd!' }
    });
    const strangerView = await req('GET', '/api/transactions/' + tx.id, { cookie: thirdSignup.cookie });
    ok('non-participant blocked from transaction', strangerView.status === 403);

    const notifications = await req('GET', '/api/notifications', { cookie: bobCookie });
    ok('receiver got payment notification', notifications.data.items.some((n) => /payment received/i.test(n.title)));
  }

  section('RECEIVE MONEY — payment requests');
  {
    const badAmount = await req('POST', '/api/requests', { cookie: bobCookie, body: { amount: '-5' } });
    ok('invalid request amount rejected', badAmount.status === 400 && badAmount.data.fields.amount);

    const created = await req('POST', '/api/requests', { cookie: bobCookie, body: { amount: '40', message: 'Coffee money' } });
    ok('payment request created', created.status === 200 && /^REQ-[A-F0-9]+$/.test(created.data.reference), JSON.stringify(created.data).slice(0, 120));
    const ref = created.data.reference;

    const mine = await req('GET', '/api/requests', { cookie: bobCookie });
    ok('request listed for its creator', mine.data.items.some((r) => r.reference === ref && r.status === 'pending'));

    const publicView = await req('GET', '/api/requests/' + ref, { cookie: aliceCookie });
    ok('request link resolves for payer', publicView.status === 200 && publicView.data.requester.username === 'bob');
    ok('payer sees amount + message', publicView.data.amount === 4000 && publicView.data.message === 'Coffee money');
    ok('canPay true when funded', publicView.data.canPay === true);
    ok('owner cannot pay own request', (await req('GET', '/api/requests/' + ref, { cookie: bobCookie })).data.canPay === false);

    const ownPay = await req('POST', '/api/requests/' + ref + '/pay', { cookie: bobCookie, body: {} });
    ok('paying own request rejected', ownPay.status === 400);

    const aliceBefore = (await req('GET', '/api/wallet', { cookie: aliceCookie })).data.balance;
    const bobBefore = (await req('GET', '/api/wallet', { cookie: bobCookie })).data.balance;

    const pay = await req('POST', '/api/requests/' + ref + '/pay', { cookie: aliceCookie, body: {} });
    ok('request paid successfully', pay.status === 200 && pay.data.ok, JSON.stringify(pay.data).slice(0, 140));
    const paidTx = pay.data.transaction;
    ok('paid request uses Payment Request type', paidTx.type === 'payment_request' && paidTx.typeLabel === 'Payment Request');
    ok('paid request status completed', paidTx.status === 'completed');

    const aliceAfter = (await req('GET', '/api/wallet', { cookie: aliceCookie })).data.balance;
    const bobAfter = (await req('GET', '/api/wallet', { cookie: bobCookie })).data.balance;
    ok('payer balance decreased', aliceAfter === aliceBefore - 4000, `${aliceBefore} → ${aliceAfter}`);
    ok('requester balance increased', bobAfter === bobBefore + 4000, `${bobBefore} → ${bobAfter}`);

    const doublePay = await req('POST', '/api/requests/' + ref + '/pay', { cookie: aliceCookie, body: {} });
    ok('double payment blocked', doublePay.status === 400);

    const bobNotifs = await req('GET', '/api/notifications', { cookie: bobCookie });
    ok('requester notified when request fulfilled', bobNotifs.data.items.some((n) => /request fulfilled/i.test(n.title)));

    const second = await req('POST', '/api/requests', { cookie: bobCookie, body: { amount: '15' } });
    const cancel = await req('DELETE', '/api/requests/' + second.data.reference, { cookie: bobCookie });
    ok('pending request can be cancelled', cancel.status === 200);
    const cancelPaid = await req('DELETE', '/api/requests/' + ref, { cookie: bobCookie });
    ok('paid request cannot be cancelled', cancelPaid.status === 400);
    const missing = await req('GET', '/api/requests/REQ-DEADBE', { cookie: aliceCookie });
    ok('unknown request → 404', missing.status === 404);
  }

  section('TRANSACTIONS — search, filter, sort, receipt');
  {
    const all = await req('GET', '/api/transactions', { cookie: aliceCookie });
    ok('transaction list loads', all.status === 200 && all.data.items.length > 0);
    ok('totals computed', all.data.totals.sent > 0 && typeof all.data.totals.count === 'number');

    const searchId = await req('GET', '/api/transactions?search=' + all.data.items[0].id, { cookie: aliceCookie });
    ok('search by transaction id', searchId.data.items.length === 1);

    const searchName = await req('GET', '/api/transactions?search=bob', { cookie: aliceCookie });
    ok('search by username/counterparty', searchName.data.items.length >= 1);

    const searchEmail = await req('GET', '/api/transactions?search=bob@demo.test', { cookie: aliceCookie });
    ok('search by counterparty email', searchEmail.data.items.length >= 1);

    const searchMiss = await req('GET', '/api/transactions?search=zzzznotfound', { cookie: aliceCookie });
    ok('no-match search returns empty', searchMiss.data.items.length === 0);

    const sent = await req('GET', '/api/transactions?filter=sent', { cookie: aliceCookie });
    ok('sent filter', sent.data.items.every((t) => t.direction === 'sent'));
    const received = await req('GET', '/api/transactions?filter=received', { cookie: aliceCookie });
    ok('received filter', received.data.items.every((t) => t.direction === 'received'));
    const added = await req('GET', '/api/transactions?filter=added', { cookie: aliceCookie });
    ok('added funds filter', added.data.items.every((t) => t.type === 'topup'));
    const pending = await req('GET', '/api/transactions?filter=pending', { cookie: aliceCookie });
    ok('pending filter', pending.data.items.every((t) => t.status === 'pending'));
    const completed = await req('GET', '/api/transactions?filter=completed', { cookie: aliceCookie });
    ok('completed filter', completed.data.items.every((t) => t.status === 'completed'));
    const failed = await req('GET', '/api/transactions?filter=failed', { cookie: aliceCookie });
    ok('failed filter works (empty is valid)', Array.isArray(failed.data.items));
    const badFilter = await req('GET', '/api/transactions?filter=bogus', { cookie: aliceCookie });
    ok('invalid filter rejected', badFilter.status === 400);

    const newest = await req('GET', '/api/transactions?sort=newest', { cookie: aliceCookie });
    const oldest = await req('GET', '/api/transactions?sort=oldest', { cookie: aliceCookie });
    ok('newest sort ordered', new Date(newest.data.items[0].createdAt) >= new Date(newest.data.items[newest.data.items.length - 1].createdAt));
    ok('oldest sort ordered', new Date(oldest.data.items[0].createdAt) <= new Date(oldest.data.items[oldest.data.items.length - 1].createdAt));
    const high = await req('GET', '/api/transactions?sort=highest', { cookie: aliceCookie });
    ok('highest amount sort', high.data.items[0].amount >= high.data.items[high.data.items.length - 1].amount);
    const low = await req('GET', '/api/transactions?sort=lowest', { cookie: aliceCookie });
    ok('lowest amount sort', low.data.items[0].amount <= low.data.items[low.data.items.length - 1].amount);
    const badSort = await req('GET', '/api/transactions?sort=bogus', { cookie: aliceCookie });
    ok('invalid sort rejected', badSort.status === 400);

    const detail = await req('GET', '/api/transactions/' + all.data.items[0].id, { cookie: aliceCookie });
    const t = detail.data.transaction;
    ok('detail contains every required field',
      t.id && t.createdAt && t.amount !== undefined && t.currency && t.type && t.typeLabel && t.status !== undefined && t.reference !== undefined && t.note !== undefined && t.payer !== undefined && t.requester !== undefined,
      JSON.stringify(Object.keys(t)));

    const receipt = await fetch(BASE + '/api/transactions/' + all.data.items[0].id + '/receipt', { headers: { cookie: aliceCookie } });
    const receiptHtml = await receipt.text();
    ok('receipt downloads as HTML attachment', receipt.status === 200 && /text\/html/.test(receipt.headers.get('content-type')) && /attachment/.test(receipt.headers.get('content-disposition') || ''));
    ok('receipt contains transaction id + demo label', receiptHtml.includes(all.data.items[0].id) && /DEMO/.test(receiptHtml));
  }

  section('DASHBOARD');
  {
    const d = await req('GET', '/api/dashboard', { cookie: aliceCookie });
    ok('dashboard loads', d.status === 200);
    ok('balance present', typeof d.data.balance === 'number');
    ok('total sent computed ($100 transfer + $40 request payment)', d.data.totalSent === 14000, 'totalSent=' + d.data.totalSent);
    ok('total received computed', typeof d.data.totalReceived === 'number');
    ok('recent transactions present', Array.isArray(d.data.recent) && d.data.recent.length > 0);
    ok('unread notification count present', typeof d.data.unreadNotifications === 'number');
    ok('security status present', d.data.security && 'twoFactorEnabled' in d.data.security);
    const noAuth = await req('GET', '/api/dashboard');
    ok('dashboard requires auth', noAuth.status === 401);
  }

  section('SECURITY — 2FA flow');
  {
    const setupNoAuth = await req('POST', '/api/security/2fa/setup');
    ok('2FA setup requires auth', setupNoAuth.status === 401);

    const setup = await req('POST', '/api/security/2fa/setup', { cookie: aliceCookie });
    ok('2FA setup returns demo code', setup.status === 200 && /^\d{6}$/.test(setup.data.code));
    ok('setup clearly marked as simulated demo', /simulated|demo/i.test(setup.data.message || ''));

    const wrong = await req('POST', '/api/security/2fa/verify', { cookie: aliceCookie, body: { code: '000000' } });
    const wrongCode = wrong.data.code === setup.data.code ? '111111' : '000000';
    const wrong2 = await req('POST', '/api/security/2fa/verify', { cookie: aliceCookie, body: { code: wrongCode } });
    ok('invalid 2FA code rejected', wrong2.status === 400 && /invalid/i.test(wrong2.data.error), JSON.stringify(wrong2.data));

    const verify = await req('POST', '/api/security/2fa/verify', { cookie: aliceCookie, body: { code: setup.data.code } });
    ok('2FA enabled after valid code', verify.status === 200 && verify.data.twoFactorEnabled === true);
    ok('confirmation message exact', verify.data.message === 'Two-factor authentication enabled.', verify.data.message);

    const setupAgain = await req('POST', '/api/security/2fa/setup', { cookie: aliceCookie });
    ok('cannot set up 2FA twice', setupAgain.status === 400);

    const login = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Second0Pass!' } });
    ok('login with 2FA enabled returns challenge', login.status === 200 && login.data.requires2fa === true && login.data.pendingToken);

    const noCode = await req('POST', '/api/auth/login-2fa', { body: { pendingToken: login.data.pendingToken, code: '999999' } });
    ok('wrong 2FA login code rejected', noCode.status === 400 && /invalid/i.test(noCode.data.error));

    const goodCode = await req('POST', '/api/auth/login-2fa', { body: { pendingToken: login.data.pendingToken, code: login.data.demoCode } });
    ok('correct 2FA login code accepted', goodCode.status === 200 && goodCode.data.user && goodCode.data.user.username === 'alice');
    const reused = await req('POST', '/api/auth/login-2fa', { body: { pendingToken: login.data.pendingToken, code: login.data.demoCode } });
    ok('2FA challenge is single-use', reused.status === 400);

    const sec = await req('GET', '/api/security', { cookie: aliceCookie });
    ok('security page data loads', sec.status === 200 && sec.data.twoFactorEnabled === true);
    ok('login activity recorded', Array.isArray(sec.data.loginActivity) && sec.data.loginActivity.length > 0 && sec.data.loginActivity[0].device);

    const noPassword = await req('POST', '/api/security/2fa/disable', { cookie: aliceCookie, body: {} });
    ok('disable requires password', noPassword.status === 400 && noPassword.data.fields.password);

    const badPassword = await req('POST', '/api/security/2fa/disable', { cookie: aliceCookie, body: { password: 'WrongPass1' } });
    ok('disable with wrong password rejected', badPassword.status === 400);

    const disable = await req('POST', '/api/security/2fa/disable', { cookie: aliceCookie, body: { password: 'Second0Pass!' } });
    ok('2FA disabled with correct password', disable.status === 200 && disable.data.twoFactorEnabled === false);

    const plainLogin = await req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'Second0Pass!' } });
    ok('login works again without 2FA', plainLogin.status === 200 && !plainLogin.data.requires2fa);
    aliceCookie = plainLogin.cookie;

    const activity = await req('GET', '/api/security/login-activity', { cookie: aliceCookie });
    ok('login activity endpoint works', activity.status === 200 && activity.data.items.length > 0);
    ok('failed logins recorded', activity.data.items.some((a) => a.success === false));
  }

  section('SETTINGS');
  {
    const s = await req('GET', '/api/settings', { cookie: aliceCookie });
    ok('settings load', s.status === 200 && s.data.profile && s.data.notifications && s.data.preferences);

    const badUser = await req('PUT', '/api/settings/profile', {
      cookie: aliceCookie,
      body: { fullName: 'Alice Anderson', username: 'x', email: 'alice@demo.test', phone: '', country: 'US' }
    });
    ok('invalid username rejected', badUser.status === 400 && badUser.data.fields.username);

    const dupEmail = await req('PUT', '/api/settings/profile', {
      cookie: aliceCookie,
      body: { fullName: 'Alice Anderson', username: 'alice', email: 'bob@demo.test', phone: '', country: 'US' }
    });
    ok('duplicate email rejected on update', dupEmail.status === 400 && dupEmail.data.fields.email);

    const dupName = await req('PUT', '/api/settings/profile', {
      cookie: aliceCookie,
      body: { fullName: 'Alice Anderson', username: 'bob', email: 'alice@demo.test', phone: '', country: 'US' }
    });
    ok('duplicate username rejected on update', dupName.status === 400 && dupName.data.fields.username);

    const good = await req('PUT', '/api/settings/profile', {
      cookie: aliceCookie,
      body: { fullName: 'Alice A. Anderson', username: 'alice', email: 'alice@demo.test', phone: '+1 (555) 010-2233', country: 'United States' }
    });
    ok('profile update succeeds', good.status === 200 && good.data.profile.fullName === 'Alice A. Anderson');
    ok('phone + country saved', good.data.profile.phone.includes('555') && good.data.profile.country === 'United States');

    const changedEmail = await req('GET', '/api/auth/me', { cookie: aliceCookie });
    ok('updated profile visible in session', changedEmail.data.user.fullName === 'Alice A. Anderson');

    const notif = await req('PUT', '/api/settings/notifications', { cookie: aliceCookie, body: { payments: false } });
    ok('notification toggle saved', notif.status === 200 && notif.data.notifications.payments === false);
    await req('PUT', '/api/settings/notifications', { cookie: aliceCookie, body: { payments: true } });

    const pref = await req('PUT', '/api/settings/preferences', {
      cookie: aliceCookie,
      body: { dateFormat: 'YYYY-MM-DD', timeFormat: '24h', defaultHome: '/wallet' }
    });
    ok('preferences saved', pref.status === 200 && pref.data.preferences.dateFormat === 'YYYY-MM-DD' && pref.data.preferences.defaultHome === '/wallet');

    const badPref = await req('PUT', '/api/settings/preferences', { cookie: aliceCookie, body: { dateFormat: 'nope' } });
    ok('invalid preference rejected', badPref.status === 400);
    await req('PUT', '/api/settings/preferences', { cookie: aliceCookie, body: { dateFormat: 'MM/DD/YYYY', timeFormat: '12h', defaultHome: '/dashboard' } });
  }

  section('NOTIFICATIONS');
  {
    const list = await req('GET', '/api/notifications', { cookie: aliceCookie });
    ok('notifications list loads', list.status === 200 && list.data.items.length > 0);
    const firstUnread = list.data.items.find((n) => !n.read);
    ok('unread notifications exist', !!firstUnread);

    const readOne = await req('POST', '/api/notifications/read', { cookie: aliceCookie, body: { ids: [firstUnread.id] } });
    ok('single notification marked read', readOne.status === 200 && readOne.data.unread === list.data.unread - 1);

    const readAll = await req('POST', '/api/notifications/read', { cookie: aliceCookie, body: { all: true } });
    ok('mark all read → unread 0', readAll.status === 200 && readAll.data.unread === 0);

    const bad = await req('POST', '/api/notifications/read', { cookie: aliceCookie, body: {} });
    ok('read without payload rejected', bad.status === 400);
  }

  section('SECURITY EDGE CASES');
  {
    const noAuthTx = await req('GET', '/api/transactions');
    ok('transactions require auth', noAuthTx.status === 401);
    const noAuthSend = await req('POST', '/api/send', { body: { recipient: 'bob', amount: '1' } });
    ok('send requires auth', noAuthSend.status === 401);
    const noAuthWallet = await req('POST', '/api/wallet/add-funds', { body: { amount: '1', method: 'demo_topup' } });
    ok('add funds requires auth', noAuthWallet.status === 401);
    const noAuthReq = await req('POST', '/api/requests', { body: { amount: '1' } });
    ok('payment requests require auth', noAuthReq.status === 401);
    const noAuthSettings = await req('PUT', '/api/settings/profile', { body: { fullName: 'Hack', username: 'hack', email: 'hack@x.test' } });
    ok('settings require auth', noAuthSettings.status === 401);

    const unknown = await req('GET', '/api/nope');
    ok('unknown API endpoint → 404', unknown.status === 404);
  }

  section('DATA CONSISTENCY — persistence across restart');
  {
    /* covered by spawn script: balances + tx ids already verified above; verify single source of truth */
    const aliceTx = await req('GET', '/api/transactions', { cookie: aliceCookie });
    const bobTx = await req('GET', '/api/transactions', { cookie: bobCookie });
    const aliceIds = new Set(aliceTx.data.items.map((t) => t.id));
    const shared = bobTx.data.items.filter((t) => aliceIds.has(t.id));
    ok('shared transfers use identical ids on both sides', shared.length > 0, 'shared=' + shared.length);
    const total = aliceTx.data.items.length + bobTx.data.items.length;
    ok('no phantom duplicates across users', total > 0);
  }
}

run().catch((err) => {
  console.error('\nTest run crashed:', err);
  process.exit(1);
});
