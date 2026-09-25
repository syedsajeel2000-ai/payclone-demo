/* Wallet: balance, add demo funds, saved demo methods, wallet activity. */
import { api } from '../api.js';
import { icon, esc, money, qs, qsa, toast, setLoading, clearFormErrors, applyFieldErrors, fmtDate } from '../ui.js';
import { txRowHtml, txEmptyHtml, bindTxRows, openTransactionDetail, openPaymentSuccess } from '../transaction-view.js';

const METHOD_OPTIONS = [
  { id: 'demo_card', title: 'Demo Card', desc: 'Dummy credit/debit card — never stored', icon: 'card' },
  { id: 'demo_bank', title: 'Demo Bank Transfer', desc: 'Simulated bank transfer', icon: 'bank' },
  { id: 'demo_topup', title: 'Demo Wallet Top-Up', desc: 'Instant sandbox top-up', icon: 'topup' }
];

export async function renderWallet(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Wallet</h1>
        <p class="ph-sub">Manage your demo balance and add sandbox funds using dummy payment methods.</p>
      </div>
      <div class="ph-actions">
        <span class="badge badge-demo">${icon('wallet', 13)} Demo Wallet</span>
        <button class="btn btn-outline btn-sm" data-nav="/send">${icon('send', 15)} Send Money</button>
      </div>
    </div>

    <div class="grid grid-main-side">
      <div class="stack gap-16 reveal-stagger">
        <div class="card balance-card">
          <div class="bc-label">${icon('wallet', 15)} Available balance</div>
          <div class="bc-amount" id="wal-balance">$0.00</div>
          <div class="bc-note">${icon('info', 14)} Demo transactions only — no real money is transferred.</div>
          <div class="bc-actions">
            <button class="btn btn-primary" id="focus-add">${icon('plus', 16)} Add Funds</button>
            <button class="btn btn-outline" data-nav="/receive">${icon('receive', 16)} Request Money</button>
            <button class="btn btn-outline" data-nav="/transactions">${icon('receipt', 16)} History</button>
          </div>
        </div>

        <div class="card" id="add-funds-card">
          <div class="card-head">
            <h2>${icon('topup', 18)} Add demo funds</h2>
            <span class="ch-sub">Dummy payment data only</span>
          </div>

          <div class="demo-strip-inline" style="margin-bottom:16px">
            ${icon('shieldCheck', 15)}
            <span><strong>Demo payment environment. No real money is transferred.</strong> Use dummy values only —
            real card details are never requested or stored (only brand + last 4 digits are saved).</span>
          </div>

          <form id="add-funds-form" novalidate>
            <div class="field">
              <label class="label" for="amount">Amount <span class="hint">USD · max $1,000,000 per top-up</span></label>
              <div class="input-wrap has-prefix">
                <span class="input-prefix">$</span>
                <input class="input" id="amount" name="amount" type="text" inputmode="decimal"
                       placeholder="0.00" autocomplete="off" required>
              </div>
              <div class="chip-row" style="margin-top:9px">
                <button class="chip" type="button" data-quick="25">$25</button>
                <button class="chip" type="button" data-quick="50">$50</button>
                <button class="chip" type="button" data-quick="100">$100</button>
                <button class="chip" type="button" data-quick="250">$250</button>
              </div>
            </div>

            <div class="field">
              <span class="label">Payment method</span>
              <div class="radio-cards">
                ${METHOD_OPTIONS.map((m) => `
                  <label class="radio-card">
                    <input type="radio" name="method" value="${m.id}" ${m.id === 'demo_card' ? 'checked' : ''}>
                    <span class="rc-dot"></span>
                    <span class="rc-icon">${icon(m.icon, 18)}</span>
                    <span class="grow">
                      <span class="rc-title" style="display:block">${m.title}</span>
                      <span class="rc-desc" style="display:block">${m.desc}</span>
                    </span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div id="card-fields" class="stack">
              <div class="field">
                <label class="label" for="cardNumber">Demo card number <span class="hint">test: 4242 4242 4242 4242</span></label>
                <div class="input-wrap">
                  <input class="input mono" id="cardNumber" name="cardNumber" type="text" inputmode="numeric"
                         placeholder="4242 4242 4242 4242" autocomplete="off" maxlength="23">
                  <span class="input-icon">${icon('card', 17)}</span>
                </div>
              </div>
              <div class="form-row">
                <div class="field">
                  <label class="label" for="expiry">Expiration <span class="hint">MM/YY</span></label>
                  <input class="input mono" id="expiry" name="expiry" type="text" inputmode="numeric"
                         placeholder="12/29" autocomplete="off" maxlength="5">
                </div>
                <div class="field">
                  <label class="label" for="cvv">CVV <span class="hint">demo only</span></label>
                  <input class="input mono" id="cvv" name="cvv" type="text" inputmode="numeric"
                         placeholder="123" autocomplete="off" maxlength="4">
                </div>
              </div>
            </div>

            <button class="btn btn-primary btn-lg btn-block" id="add-btn" type="submit">
              ${icon('plus', 17)} Add Demo Funds
            </button>
          </form>
        </div>

        <div class="card card-pad-0">
          <div class="card-head" style="padding:18px 20px 0;margin-bottom:12px">
            <h2>${icon('activity', 18)} Recent wallet activity</h2>
            <button class="btn btn-soft btn-sm" data-nav="/transactions">View all ${icon('chevronRight', 14)}</button>
          </div>
          <div id="wal-recent"><p class="muted" style="padding:0 20px 20px">Loading…</p></div>
        </div>
      </div>

      <div class="stack gap-16">
        <div class="card">
          <div class="card-head"><h2>${icon('card', 18)} Payment methods</h2></div>
          <div id="wal-methods"><p class="muted">Loading…</p></div>
          <p class="muted" style="font-size:.78rem;margin-top:12px">
            Only demo method labels are saved (brand + last 4). Full card numbers are discarded immediately.
          </p>
        </div>

        <div class="card">
          <div class="card-head"><h2>${icon('wallet', 18)} Wallet summary</h2></div>
          <div class="detail-list">
            <div class="detail-row"><span class="dr-key">Currency</span><span class="dr-val">USD (demo)</span></div>
            <div class="detail-row"><span class="dr-key">Total added</span><span class="dr-val" id="wal-added">$0.00</span></div>
            <div class="detail-row"><span class="dr-key">Balance type</span><span class="dr-val"><span class="badge badge-demo">Demo funds</span></span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  const recentWrap = qs('#wal-recent', container);
  bindTxRows(recentWrap);

  const form = qs('#add-funds-form', container);
  const cardFields = qs('#card-fields', container);
  const amountInput = qs('#amount', container);

  qsa('[data-quick]', container).forEach((chip) => {
    chip.addEventListener('click', () => {
      amountInput.value = chip.getAttribute('data-quick');
      amountInput.focus();
    });
  });

  function syncCardFields() {
    const method = (form.querySelector('input[name="method"]:checked') || {}).value;
    cardFields.style.display = method === 'demo_card' ? '' : 'none';
  }
  qsa('input[name="method"]', form).forEach((r) => r.addEventListener('change', syncCardFields));
  syncCardFields();

  qs('#focus-add', container).addEventListener('click', () => {
    qs('#add-funds-card', container).scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => amountInput.focus(), 350);
  });

  async function load() {
    try {
      const data = await api('/api/wallet');
      const balEl = qs('#wal-balance', container);
      balEl.textContent = money(data.balance);
      balEl.classList.add('flash');
      setTimeout(() => balEl.classList.remove('flash'), 950);
      qs('#wal-added', container).textContent = money(data.totalAdded);

      const methodsWrap = qs('#wal-methods', container);
      if (!data.paymentMethods.length) {
        methodsWrap.innerHTML = '<p class="muted" style="font-size:.88rem">No demo methods saved yet — add funds to register one.</p>';
      } else {
        methodsWrap.innerHTML = data.paymentMethods.map((m) => `
          <div class="activity-item">
            <span class="card-icon navy" style="width:38px;height:38px">${icon(m.type === 'demo_card' ? 'card' : m.type === 'demo_bank' ? 'bank' : 'topup', 17)}</span>
            <span class="activity-body">
              <span class="activity-title" style="display:block">${esc(m.label)}</span>
              <span class="activity-sub" style="display:block">Added ${esc(fmtDate(m.createdAt))}</span>
            </span>
          </div>
        `).join('');
      }

      const recent = data.recentTransactions || [];
      if (!recent.length) {
        recentWrap.innerHTML = txEmptyHtml('No wallet activity', 'Add demo funds to see your wallet history here.');
      } else {
        recentWrap.innerHTML = '<div class="tx-list">' + recent.map((t, i) => txRowHtml(t, i)).join('') + '</div>';
      }
    } catch (err) {
      if (err.status !== 401) toast('error', 'Could not load your wallet.');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const amount = amountInput.value.trim();
    const method = (form.querySelector('input[name="method"]:checked') || {}).value;
    const body = { amount, method };
    if (method === 'demo_card') {
      body.cardNumber = form.cardNumber.value;
      body.expiry = form.expiry.value;
      body.cvv = form.cvv.value;
    }

    /* quick client-side checks (server re-validates everything) */
    const fields = {};
    if (!amount) fields.amount = 'Enter an amount.';
    else if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
    else if (Number(amount) <= 0) fields.amount = 'Amount must be greater than zero.';
    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }

    const btn = qs('#add-btn', form);
    setLoading(btn, true, 'Processing demo payment…');
    try {
      const data = await api('/api/wallet/add-funds', { method: 'POST', body });
      form.reset();
      syncCardFields();
      await load();
      toast('success', 'Demo funds added successfully.');
      openPaymentSuccess({
        tx: data.transaction,
        headline: 'Demo funds added successfully. ' + money(data.transaction.amount) + ' is now available in your wallet.',
        recipientLabel: 'your demo wallet',
        onDone: () => amountInput.focus()
      });
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  await load();
}
