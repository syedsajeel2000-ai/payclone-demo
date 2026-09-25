/* Public payment request page (#/pay/REQ-XXXX) — anyone can view, logged-in users can pay. */
import { api } from '../api.js';
import { store } from '../store.js';
import { icon, esc, money, qs, toast, setLoading, openModal, initials, fmtDate, fmtTime, statusBadge } from '../ui.js';
import { openPaymentSuccess, openTransactionDetail } from '../transaction-view.js';

export async function renderPayRequest(container, params) {
  const ref = (params && params.ref) || '';

  container.innerHTML = `
    <div class="public-page">
      <header class="public-nav">
        <button class="brand" data-nav="/">
          <span class="brand-mark">P</span>
          <span class="brand-word">Pay<span>Clone</span></span>
          <span class="brand-demo">DEMO</span>
        </button>
        <div class="row gap-8">
          <a class="btn btn-ghost btn-sm" href="#/">Home</a>
          ${store.user
            ? '<a class="btn btn-primary btn-sm" href="#/dashboard">Dashboard</a>'
            : '<a class="btn btn-outline btn-sm" href="#/login">Log In</a>'}
        </div>
      </header>
      <div class="demo-strip demo-strip-top">${icon('shieldCheck', 16)} Demo payment request — no real money is transferred.</div>
      <main class="public-main" style="display:grid;place-items:center;padding:clamp(28px,6vw,64px) 18px">
        <div class="card" style="max-width:460px;width:100%" id="pay-card">
          <div class="empty"><span class="spinner" style="border-color:rgba(0,112,224,.25);border-top-color:var(--accent);margin:0 auto"></span></div>
        </div>
      </main>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  const card = qs('#pay-card', container);

  let req;
  try {
    req = await api('/api/requests/' + encodeURIComponent(ref));
  } catch (err) {
    card.innerHTML = `
      <div class="empty">
        <div class="empty-ico">${icon('alert', 34)}</div>
        <h3>Request not found</h3>
        <p>${esc(err.message || 'This payment request does not exist or was cancelled.')}</p>
        <div class="nf-actions" style="margin-top:0">
          <a class="btn btn-primary" href="#/">Go Home</a>
          ${store.user ? '<a class="btn btn-outline" href="#/receive">My Requests</a>' : '<a class="btn btn-outline" href="#/login">Log In</a>'}
        </div>
      </div>`;
    return;
  }

  function render() {
    const r = req;
    const paid = r.status === 'completed';
    const mine = r.isOwner;
    const viewer = r.viewer;

    let actionHtml = '';
    if (mine) {
      actionHtml = `
        <div class="demo-strip-inline" style="margin-top:18px">
          ${icon('info', 15)} This is <strong>your</strong> payment request — share the link to get paid.
        </div>
        <div class="row gap-8 mt-16">
          <button class="btn btn-outline grow" id="copy-link">${icon('copy', 15)} Copy Link</button>
          <button class="btn btn-primary grow" data-nav="/receive">${icon('receive', 15)} My Requests</button>
        </div>`;
    } else if (paid) {
      actionHtml = `
        <div class="form-success" style="margin-top:18px;margin-bottom:0">
          ${icon('checkCircle', 18)} <span>This payment request has already been paid.</span>
        </div>
        ${viewer ? '<button class="btn btn-soft btn-block mt-16" data-nav="/transactions">View in Transactions</button>' : ''}`;
    } else if (!viewer) {
      actionHtml = `
        <div class="demo-strip-inline" style="margin-top:18px">
          ${icon('lock', 15)} Log in with a demo account to pay this request.
        </div>
        <a class="btn btn-primary btn-lg btn-block mt-16" href="#/login">${icon('lock', 16)} Log In to Pay</a>
        <a class="btn btn-ghost btn-block mt-8" href="#/signup">Create a demo account</a>`;
    } else if (viewer.balance < r.amount) {
      actionHtml = `
        <div class="form-error" style="margin-top:18px">
          ${icon('alert', 18)}
          <span>Insufficient demo balance — you have ${esc(money(viewer.balance))}. Add demo funds first.</span>
        </div>
        <button class="btn btn-outline btn-block" data-nav="/wallet">${icon('topup', 16)} Add Demo Funds</button>`;
    } else {
      actionHtml = `
        <button class="btn btn-primary btn-lg btn-block mt-18" id="pay-btn" style="margin-top:18px">
          ${icon('send', 17)} Pay ${esc(money(r.amount))}
        </button>
        <p class="muted text-center" style="font-size:.78rem;margin-top:10px">
          From your demo wallet · balance ${esc(money(viewer.balance))}
        </p>`;
    }

    card.innerHTML = `
      <div class="success-hero">
        <span class="avatar avatar-lg" style="margin:0 auto 12px">${esc(initials(r.requester.fullName))}</span>
        <div class="eyebrow" style="animation:none">${icon('receive', 14)} Payment request</div>
        <div class="sh-amount" style="margin-top:14px">${esc(money(r.amount))}</div>
        <p class="sh-msg">requested by <strong>${esc(r.requester.fullName)}</strong> (@${esc(r.requester.username)})</p>
        <div style="margin-top:10px">${statusBadge(r.status)}</div>
      </div>

      ${r.message ? `<div class="kv" style="margin-top:18px"><div class="kv-k">Message</div><div class="kv-v">${esc(r.message)}</div></div>` : ''}

      <div class="detail-list mt-16">
        <div class="detail-row"><span class="dr-key">Reference</span><span class="dr-val mono">${esc(r.reference)}</span></div>
        <div class="detail-row"><span class="dr-key">Requested</span><span class="dr-val">${esc(fmtDate(r.createdAt))} · ${esc(fmtTime(r.createdAt))}</span></div>
        <div class="detail-row"><span class="dr-key">Recipient</span><span class="dr-val">${esc(r.requester.email)}</span></div>
        <div class="detail-row"><span class="dr-key">Currency</span><span class="dr-val">${esc(r.currency)} (demo)</span></div>
        ${paid && r.paidAt ? `<div class="detail-row"><span class="dr-key">Paid at</span><span class="dr-val">${esc(fmtDate(r.paidAt))} · ${esc(fmtTime(r.paidAt))}</span></div>` : ''}
      </div>

      ${actionHtml}

      <div class="demo-strip-inline mt-16">${icon('shieldCheck', 15)} Demo payment environment. No real money is transferred.</div>
    `;

    card.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
    });
    const copyBtn = qs('#copy-link', card);
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          toast('success', 'Payment link copied.');
        } catch (e) {
          toast('info', location.href);
        }
      });
    }
    const payBtn = qs('#pay-btn', card);
    if (payBtn) payBtn.addEventListener('click', openConfirm);
  }

  function openConfirm() {
    const r = req;
    const modal = openModal({
      title: 'Confirm Payment',
      titleIcon: 'shieldCheck',
      body: `
        <div class="pay-summary">
          <div class="detail-row">
            <span class="dr-key">Recipient</span>
            <span class="dr-val">${esc(r.requester.fullName)}<br>
              <span class="muted" style="font-weight:500;font-size:.82rem">@${esc(r.requester.username)} · ${esc(r.requester.email)}</span></span>
          </div>
          <div class="detail-row"><span class="dr-key">Request</span><span class="dr-val mono">${esc(r.reference)}</span></div>
          <div class="detail-row"><span class="dr-key">Amount</span><span class="dr-val">${esc(money(r.amount))}</span></div>
          <div class="detail-row"><span class="dr-key">Fee</span><span class="dr-val">${esc(money(0))} <span class="muted" style="font-weight:500">(no fee)</span></span></div>
          <div class="detail-row"><span class="dr-key">Total</span><span class="dr-val total-val">${esc(money(r.amount))}</span></div>
        </div>
        <div id="pay-error-slot"></div>
        <div class="demo-strip-inline mt-16">${icon('info', 15)} Demo transfer — no real money will move.</div>
      `,
      actions: [
        { label: 'Cancel', variant: 'btn-ghost', onClick: (m) => m.close() },
        {
          label: 'Confirm Send',
          variant: 'btn-primary',
          icon: 'send',
          onClick: async (m) => {
            const btn = m.actions.querySelectorAll('.btn')[1];
            const slot = m.body.querySelector('#pay-error-slot');
            setLoading(btn, true, 'Sending…');
            try {
              const data = await api('/api/requests/' + encodeURIComponent(r.reference) + '/pay', {
                method: 'POST',
                body: {}
              });
              m.close();
              if (store.user) store.user.balance = data.balance;
              toast('success', 'Payment sent successfully.');
              req = Object.assign({}, r, { status: 'completed', paidAt: data.transaction.paidAt });
              render();
              openPaymentSuccess({
                tx: data.transaction,
                headline: 'You sent ' + money(data.transaction.amount) + ' to @' + r.requester.username + '.'
              });
            } catch (err) {
              slot.innerHTML =
                '<div class="form-error" role="alert" style="margin-top:14px">' +
                icon('alert', 18) + '<span>' + esc(err.message) + '</span></div>';
            } finally {
              setLoading(btn, false);
            }
            return false;
          }
        }
      ]
    });
    return modal;
  }

  render();
}
