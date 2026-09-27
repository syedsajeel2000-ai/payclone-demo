/* Dashboard: balance, totals, quick actions, recent transactions, security status. */
import { api } from '../api.js';
import { store } from '../store.js';
import { icon, esc, money, qs, toast, firstName, initials } from '../ui.js';
import { txRowHtml, txEmptyHtml, bindTxRows } from '../transaction-view.js';
import { refreshBell } from '../layout.js';

/* Email-verification nudge: only shows when unverified; dismissible this session. */
function renderVerifyBanner(container, user) {
  const slot = qs('#verify-banner', container);
  if (!slot || !user || user.emailVerified !== false || sessionStorage.getItem('verifyDismissed')) return;
  slot.innerHTML = `
    <div class="card row gap-12 reveal" style="align-items:center;border-color:#f2d492;background:#fff8e6;padding:14px 18px">
      <span style="color:#b45309">${icon('alert', 20)}</span>
      <div style="flex:1;font-size:.88rem;color:#5b430f;line-height:1.5">
        <strong>Verify your email address.</strong>
        We sent a confirmation link to ${esc(user.email)} when you signed up.
      </div>
      <button class="btn btn-primary btn-sm" id="resend-verify">Resend link</button>
      <button class="btn btn-ghost btn-sm" id="dismiss-verify" aria-label="Dismiss">${icon('x', 16)}</button>
    </div>
  `;
  qs('#resend-verify', slot).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await api('/api/auth/resend-verification', { method: 'POST', body: {} });
      toast(r.emailSent ? 'success' : 'info', r.message);
    } catch (err) {
      toast('error', err.message || 'Could not resend.');
    } finally {
      btn.disabled = false;
    }
  });
  qs('#dismiss-verify', slot).addEventListener('click', () => {
    sessionStorage.setItem('verifyDismissed', '1');
    slot.innerHTML = '';
  });
}

function animateNumber(el, to) {
  const duration = 750;
  const start = performance.now();
  const from = 0;
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = money(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(frame);
    else {
      el.textContent = money(to);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 950);
    }
  }
  requestAnimationFrame(frame);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${greeting()}, <span id="dash-name">…</span></h1>
        <p class="ph-sub">Here is what is happening with your demo wallet today.</p>
      </div>
      <div class="ph-actions">
        <span class="badge badge-demo">${icon('zap', 13)} Demo Wallet · no real money</span>
        <button class="btn btn-outline btn-sm" id="dash-refresh">${icon('refresh', 15)} Refresh</button>
      </div>
    </div>
    <div id="verify-banner"></div>

    <div class="grid grid-main-side">
      <div class="stack gap-16">
        <div class="grid grid-2">
          <div class="card balance-card">
            <div class="bc-label">${icon('wallet', 15)} Available balance</div>
            <div class="bc-amount" id="dash-balance">$0.00</div>
            <div class="bc-note">${icon('info', 14)} Demo Wallet — demo transactions only, no real money is transferred.</div>
            <div class="bc-actions">
              <button class="btn btn-primary" data-nav="/send">${icon('send', 16)} Send Money</button>
              <button class="btn btn-outline" data-nav="/wallet">${icon('plus', 16)} Add Funds</button>
            </div>
          </div>

          <div class="stack gap-16 reveal-stagger">
            <div class="stat">
              <span class="card-icon red">${icon('trendingUp', 18)}</span>
              <span class="grow">
                <span class="st-value" id="dash-sent">$0.00</span>
                <span class="st-label" style="display:block">Total money sent</span>
              </span>
            </div>
            <div class="stat">
              <span class="card-icon green">${icon('trendingDown', 18)}</span>
              <span class="grow">
                <span class="st-value text-success" id="dash-received">$0.00</span>
                <span class="st-label" style="display:block">Total money received</span>
              </span>
            </div>
          </div>
        </div>

        <div class="card reveal">
          <div class="card-head">
            <h2>${icon('zap', 18)} Quick actions</h2>
          </div>
          <div class="quick-actions reveal-stagger">
            <button class="qa-btn" data-nav="/send"><span class="qa-ico">${icon('send', 21)}</span>Send Money</button>
            <button class="qa-btn green" data-nav="/receive"><span class="qa-ico">${icon('receive', 21)}</span>Receive Money</button>
            <button class="qa-btn navy" data-nav="/wallet"><span class="qa-ico">${icon('topup', 21)}</span>Add Funds</button>
            <button class="qa-btn amber" data-nav="/transactions"><span class="qa-ico">${icon('receipt', 21)}</span>View Transactions</button>
            <button class="qa-btn" data-nav="/settings"><span class="qa-ico">${icon('settings', 21)}</span>Settings</button>
          </div>
        </div>

        <div class="card card-pad-0 reveal" style="--rd:0.12s">
          <div class="card-head" style="padding:18px 20px 0;margin-bottom:12px">
            <h2>${icon('receipt', 18)} Recent transactions</h2>
            <button class="btn btn-soft btn-sm" data-nav="/transactions">View all ${icon('chevronRight', 14)}</button>
          </div>
          <div id="dash-recent"><div class="empty"><span class="spinner" style="border-color:rgba(0,112,224,.25);border-top-color:var(--accent);margin:0 auto"></span></div></div>
        </div>
      </div>

      <div class="stack gap-16 reveal-stagger">
        <div class="card hover-lift">
          <div class="card-head">
            <h2>${icon('shieldCheck', 18)} Account status</h2>
          </div>
          <div class="detail-list">
            <div class="detail-row">
              <span class="dr-key">Two-factor auth</span>
              <span class="dr-val" id="sec-2fa">…</span>
            </div>
            <div class="detail-row">
              <span class="dr-key">Password</span>
              <span class="dr-val" id="sec-pw">Protected</span>
            </div>
            <div class="detail-row">
              <span class="dr-key">Member since</span>
              <span class="dr-val" id="sec-since">…</span>
            </div>
            <div class="detail-row">
              <span class="dr-key">Transactions</span>
              <span class="dr-val" id="sec-count">…</span>
            </div>
          </div>
          <button class="btn btn-outline btn-block mt-16" data-nav="/security">${icon('shieldCheck', 16)} Open Security Center</button>
        </div>

        <div class="card hover-lift">
          <div class="card-head">
            <h2>${icon('bell', 18)} Notifications</h2>
            <span class="badge badge-info" id="dash-unread">0</span>
          </div>
          <div id="dash-notifs" class="stack"><p class="muted">Loading…</p></div>
          <button class="btn btn-soft btn-block mt-16" data-nav="/notifications">View all notifications</button>
        </div>

        <div class="card" style="background:linear-gradient(150deg,#001c53,#003087);border:0;color:#fff">
          <div class="row gap-8" style="color:#9dc4ff;font-weight:800;font-size:.78rem;letter-spacing:.1em">
            ${icon('zap', 15)} DEMO ENVIRONMENT
          </div>
          <p style="margin-top:10px;font-size:.88rem;color:#c6d9fb;line-height:1.6">
            Every balance, card and payment on this platform is simulated. No real money is transferred and
            no banking credentials are requested.
          </p>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  const recentWrap = qs('#dash-recent', container);
  bindTxRows(recentWrap);

  async function load() {
    try {
      const data = await api('/api/dashboard');
      store.setUser(data.user);
      store.setPrefs(data.preferences);
      qs('#dash-name', container).textContent = firstName(data.user.fullName);
      renderVerifyBanner(container, data.user);
      animateNumber(qs('#dash-balance', container), data.balance);
      qs('#dash-sent', container).textContent = money(data.totalSent);
      qs('#dash-received', container).textContent = money(data.totalReceived);
      qs('#sec-count', container).textContent = data.transactionCount + ' total';
      qs('#sec-since', container).textContent = new Date(data.security.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const twoFa = qs('#sec-2fa', container);
      twoFa.innerHTML = data.security.twoFactorEnabled
        ? '<span class="badge badge-success">Enabled</span>'
        : '<span class="badge badge-pending">Not enabled</span>';
      qs('#sec-pw', container).innerHTML = '<span class="badge badge-success">Hashed &amp; protected</span>';

      qs('#dash-unread', container).textContent = String(data.unreadNotifications);

      const notifWrap = qs('#dash-notifs', container);
      const notifs = await api('/api/notifications');
      if (!notifs.items.length) {
        notifWrap.innerHTML = '<p class="muted" style="font-size:.88rem">No notifications yet — they will appear here as you use your wallet.</p>';
      } else {
        notifWrap.innerHTML = notifs.items.slice(0, 3).map((n) => `
          <div class="activity-item">
            <span class="activity-dot ${n.read ? '' : ''}" style="background:${n.read ? 'var(--border-strong)' : 'var(--accent)'}"></span>
            <span class="activity-body">
              <span class="activity-title" style="display:block">${esc(n.title)}</span>
              <span class="activity-sub" style="display:block">${esc(n.message)}</span>
            </span>
          </div>
        `).join('');
      }
      refreshBell();

      const recent = data.recent || [];
      if (!recent.length) {
        recentWrap.innerHTML = txEmptyHtml(
          'No transactions yet',
          'Add demo funds or send your first demo payment to get started.',
          'Add Funds',
          'data-nav="/wallet"'
        );
        recentWrap.querySelectorAll('[data-nav]').forEach((el) => {
          el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
        });
      } else {
        recentWrap.innerHTML = '<div class="tx-list">' + recent.map((t, i) => txRowHtml(t, i)).join('') + '</div>';
      }
    } catch (err) {
      if (err.status !== 401) toast('error', 'Could not load the dashboard.');
    }
  }

  qs('#dash-refresh', container).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await load();
    btn.disabled = false;
    toast('info', 'Dashboard refreshed.');
  });

  await load();
}
