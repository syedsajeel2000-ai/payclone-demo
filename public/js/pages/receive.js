/* Receive money: profile details, payment requests with shareable demo links. */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  icon, esc, money, qs, toast, setLoading, clearFormErrors, applyFieldErrors,
  initials, copyWithToast, fmtDate, fmtTime, statusBadge
} from '../ui.js';
import { openTransactionDetail, openPaymentSuccess } from '../transaction-view.js';

function paymentLink(ref) {
  return location.origin + location.pathname + '#/pay/' + ref;
}

export async function renderReceive(container) {
  const user = store.user || {};
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Receive Money</h1>
        <p class="ph-sub">Share your details or create a payment request with a shareable demo link.</p>
      </div>
      <div class="ph-actions">
        <span class="badge badge-demo">${icon('zap', 13)} Demo payments only</span>
      </div>
    </div>

    <div class="grid grid-side-main">
      <div class="stack gap-16">
        <div class="card">
          <div class="card-head"><h2>${icon('user', 18)} Your payment profile</h2></div>
          <div class="profile-hero">
            <span class="avatar avatar-lg">${esc(initials(user.fullName))}</span>
            <span class="grow">
              <span class="ph-name" style="display:block">${esc(user.fullName || '')}</span>
              <span class="ph-handle" style="display:block">@${esc(user.username || '')}</span>
              <span class="ph-mail">${icon('mail', 14)} ${esc(user.email || '')}</span>
            </span>
          </div>
          <div class="row gap-8 mt-16" style="flex-wrap:wrap">
            <button class="btn btn-outline btn-sm grow" id="copy-email">${icon('mail', 15)} Copy Email</button>
            <button class="btn btn-outline btn-sm grow" id="copy-username">${icon('copy', 15)} Copy Username</button>
          </div>
          <div class="demo-strip-inline mt-16">
            ${icon('info', 15)} People can send you demo money using this email or username on the Send Money page.
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>${icon('bell', 18)} Request money</h2></div>
          <form id="request-form" novalidate>
            <div class="field">
              <label class="label" for="req-amount">Amount <span class="hint">USD · demo funds</span></label>
              <div class="input-wrap has-prefix">
                <span class="input-prefix">$</span>
                <input class="input" id="req-amount" name="amount" type="text" inputmode="decimal"
                       placeholder="0.00" autocomplete="off" required>
              </div>
            </div>
            <div class="field">
              <label class="label" for="req-message">Message <span class="hint">optional</span></label>
              <textarea class="textarea" id="req-message" name="message" maxlength="200"
                        placeholder="e.g. Dinner on Saturday 🍕"></textarea>
            </div>
            <button class="btn btn-primary btn-lg btn-block" id="request-btn" type="submit">
              ${icon('receive', 17)} Create Payment Request
            </button>
          </form>
        </div>
      </div>

      <div class="stack gap-16">
        <div class="card" id="request-result" style="display:none"></div>

        <div class="card card-pad-0">
          <div class="card-head" style="padding:18px 20px 0;margin-bottom:12px">
            <h2>${icon('receipt', 18)} My payment requests</h2>
            <button class="btn btn-soft btn-sm" data-nav="/transactions">History ${icon('chevronRight', 14)}</button>
          </div>
          <div id="requests-list"><p class="muted" style="padding:0 20px 20px">Loading…</p></div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  qs('#copy-email', container).addEventListener('click', () => copyWithToast(user.email, 'Email'));
  qs('#copy-username', container).addEventListener('click', () => copyWithToast(user.username, 'Username'));

  const form = qs('#request-form', container);
  const resultCard = qs('#request-result', container);
  const listWrap = qs('#requests-list', container);

  async function loadRequests() {
    try {
      const data = await api('/api/requests');
      if (!data.items.length) {
        listWrap.innerHTML =
          '<div class="empty" style="padding:34px 20px">' +
          '<div class="empty-ico">' + icon('receive', 32) + '</div>' +
          '<h3>No payment requests yet</h3>' +
          '<p>Create your first request above and share the link with anyone.</p></div>';
        return;
      }
      listWrap.innerHTML = data.items
        .map((r) => {
          const link = paymentLink(r.reference);
          return `
          <div class="request-row">
            <span class="rq-amt">${esc(money(r.amount))}</span>
            <span class="rq-meta">
              <span class="row gap-8" style="flex-wrap:wrap">
                <span class="mono" style="font-size:.8rem">${esc(r.reference)}</span>
                ${statusBadge(r.status)}
              </span>
              <span class="rq-msg" style="display:block">${r.note ? esc(r.note) : '<span class="muted">No message</span>'} · ${esc(fmtDate(r.createdAt))} ${esc(fmtTime(r.createdAt))}</span>
            </span>
            <span class="rq-actions">
              <button class="btn btn-outline btn-sm" data-copy="${esc(link)}">${icon('copy', 14)} Copy link</button>
              ${r.status === 'pending'
                ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(r.reference)}">${icon('trash', 14)} Cancel</button>`
                : `<button class="btn btn-soft btn-sm" data-tx="${esc(r.id)}">${icon('receipt', 14)} View</button>`}
            </span>
          </div>`;
        })
        .join('');

      listWrap.querySelectorAll('[data-copy]').forEach((btn) => {
        btn.addEventListener('click', () => copyWithToast(btn.getAttribute('data-copy'), 'Payment link'));
      });
      listWrap.querySelectorAll('[data-tx]').forEach((btn) => {
        btn.addEventListener('click', () => openTransactionDetail(btn.getAttribute('data-tx')));
      });
      listWrap.querySelectorAll('[data-cancel]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ref = btn.getAttribute('data-cancel');
          setLoading(btn, true);
          try {
            await api('/api/requests/' + encodeURIComponent(ref), { method: 'DELETE' });
            toast('info', 'Payment request cancelled.');
            await loadRequests();
          } catch (err) {
            toast('error', err.message);
          } finally {
            setLoading(btn, false);
          }
        });
      });
    } catch (err) {
      if (err.status !== 401) toast('error', 'Could not load your requests.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const amount = form.amount.value.trim();
    const message = form.message.value.trim();
    const fields = {};
    if (!amount) fields.amount = 'Enter an amount.';
    else if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
    else if (Number(amount) <= 0) fields.amount = 'Amount must be greater than zero.';
    if (message.length > 200) fields.message = 'Message must be 200 characters or fewer.';
    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }

    const btn = qs('#request-btn', form);
    setLoading(btn, true, 'Creating…');
    try {
      const data = await api('/api/requests', { method: 'POST', body: { amount, message } });
      const link = paymentLink(data.reference);
      form.reset();
      resultCard.style.display = '';
      resultCard.innerHTML = `
        <div class="card-head"><h2>${icon('checkCircle', 18)} Request created</h2>
          <span class="badge badge-pending">Pending</span></div>
        <div class="success-hero" style="text-align:left;padding-top:0">
          <div class="sh-amount">${esc(money(data.transaction.amount))}</div>
          <p class="sh-msg">Share this reference or link — anyone with a demo wallet can pay it.</p>
        </div>
        <div class="label mt-16">Reference</div>
        <div class="code-box">
          <span>${esc(data.reference)}</span>
          <button class="copy-btn" type="button" id="copy-ref">${icon('copy', 14)} Copy</button>
        </div>
        <div class="label mt-16">Shareable demo payment link</div>
        <div class="code-box">
          <span style="font-size:.78rem;letter-spacing:.02em;word-break:break-all">${esc(link)}</span>
          <button class="copy-btn" type="button" id="copy-link">${icon('copy', 14)} Copy</button>
        </div>
        <div class="row gap-8 mt-16" style="flex-wrap:wrap">
          <button class="btn btn-primary btn-sm grow" id="open-link">${icon('external', 14)} Open Payment Page</button>
          <button class="btn btn-ghost btn-sm" id="dismiss-result">Dismiss</button>
        </div>
      `;
      qs('#copy-ref', resultCard).addEventListener('click', () => copyWithToast(data.reference, 'Reference'));
      qs('#copy-link', resultCard).addEventListener('click', () => copyWithToast(link, 'Payment link'));
      qs('#open-link', resultCard).addEventListener('click', () => {
        location.hash = '/pay/' + data.reference;
      });
      qs('#dismiss-result', resultCard).addEventListener('click', () => {
        resultCard.style.display = 'none';
        resultCard.innerHTML = '';
      });
      toast('success', 'Payment request created.');
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await loadRequests();
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  await loadRequests();
}
