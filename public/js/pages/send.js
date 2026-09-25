/* Send money: recipient lookup by email/username, validation, confirm + success modals. */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  icon, esc, money, qs, qsa, toast, debounce, setLoading,
  clearFormErrors, applyFieldErrors, formBanner, initials, openModal
} from '../ui.js';
import { openPaymentSuccess } from '../transaction-view.js';

export async function renderSend(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Send Money</h1>
        <p class="ph-sub">Send demo funds to any user by email or username. You will review everything before it is sent.</p>
      </div>
      <div class="ph-actions">
        <span class="pill">${icon('wallet', 15)} Balance: <strong id="send-balance">$0.00</strong></span>
        <span class="badge badge-demo">${icon('zap', 13)} Demo transfer</span>
      </div>
    </div>

    <div class="grid grid-main-side">
      <div class="card reveal">
        <div class="card-head">
          <h2>${icon('send', 18)} New payment</h2>
          <span class="ch-sub">Fee: $0.00 (demo — no fee)</span>
        </div>

        <form id="send-form" novalidate>
          <div class="field">
            <label class="label" for="recipient">
              <span>Recipient email or username</span>
              <span class="hint">Type at least 1 character to search</span>
            </label>
            <div class="input-wrap" id="recipient-wrap" style="position:relative">
              <input class="input" id="recipient" name="recipient" type="text" autocomplete="off"
                     placeholder="someone@demo.test or username" required>
              <span class="input-icon">${icon('user', 17)}</span>
            </div>
            <div id="recipient-selected"></div>
          </div>

          <div class="field">
            <label class="label" for="amount">
              <span>Amount</span>
              <span class="hint">USD · demo funds</span>
            </label>
            <div class="input-wrap has-prefix">
              <span class="input-prefix">$</span>
              <input class="input" id="amount" name="amount" type="text" inputmode="decimal"
                     placeholder="0.00" autocomplete="off" required>
            </div>
            <div class="chip-row" style="margin-top:9px">
              <button class="chip" type="button" data-quick="10">$10</button>
              <button class="chip" type="button" data-quick="25">$25</button>
              <button class="chip" type="button" data-quick="50">$50</button>
              <button class="chip" type="button" data-quick="100">$100</button>
            </div>
          </div>

          <div class="field">
            <label class="label" for="note">
              <span>Note (optional)</span>
              <span class="hint"><span id="note-count">0</span>/200</span>
            </label>
            <textarea class="textarea" id="note" name="note" maxlength="200"
                      placeholder="What's this for? e.g. Dinner split"></textarea>
          </div>

          <button class="btn btn-primary btn-lg btn-block" id="review-btn" type="submit">
            ${icon('search', 17)} Review Payment
          </button>
        </form>
      </div>

      <div class="stack gap-16">
        <div class="card">
          <div class="card-head"><h2>${icon('help', 18)} How sending works</h2></div>
          <div class="steps">
            <div class="step active">
              <span class="step-dot">1</span>
              <span class="step-body">
                <span class="sb-title" style="display:block">Find your recipient</span>
                <span class="sb-desc" style="display:block">Search by email or username — live suggestions appear as you type.</span>
              </span>
            </div>
            <div class="step">
              <span class="step-dot">2</span>
              <span class="step-body">
                <span class="sb-title" style="display:block">Review &amp; confirm</span>
                <span class="sb-desc" style="display:block">Check recipient, amount, fee and total before anything moves.</span>
              </span>
            </div>
            <div class="step">
              <span class="step-dot">3</span>
              <span class="step-body">
                <span class="sb-title" style="display:block">Instant demo settlement</span>
                <span class="sb-desc" style="display:block">Both wallets update and matching transaction IDs are recorded.</span>
              </span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>${icon('shieldCheck', 18)} Good to know</h2></div>
          <div class="detail-list">
            <div class="detail-row"><span class="dr-key">Transfer fee</span><span class="dr-val">$0.00</span></div>
            <div class="detail-row"><span class="dr-key">Speed</span><span class="dr-val">Instant (demo)</span></div>
            <div class="detail-row"><span class="dr-key">Limits</span><span class="dr-val">Your wallet balance</span></div>
            <div class="detail-row"><span class="dr-key">Currency</span><span class="dr-val">USD (demo)</span></div>
          </div>
          <div class="demo-strip-inline mt-16">${icon('info', 15)} Demo payment environment. No real money is transferred.</div>
        </div>

        <button class="btn btn-outline btn-block" data-nav="/wallet">${icon('topup', 16)} Need funds? Add demo money</button>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  const form = qs('#send-form', container);
  const recipientInput = qs('#recipient', container);
  const suggestWrap = qs('#recipient-wrap', container);
  const selectedWrap = qs('#recipient-selected', container);
  const amountInput = qs('#amount', container);
  const noteInput = qs('#note', container);
  const balanceEl = qs('#send-balance', container);

  let selected = null;

  function setBalance(cents) {
    balanceEl.textContent = money(cents);
    store.user = { ...store.user, balance: cents };
  }

  async function loadBalance() {
    try {
      const data = await api('/api/wallet');
      setBalance(data.balance);
    } catch (e) { /* 401 handled globally */ }
  }

  /* ---------- recipient suggestions ---------- */
  function closeSuggestions() {
    const s = suggestWrap.querySelector('.suggest');
    if (s) s.remove();
  }

  function showSuggestions(results) {
    closeSuggestions();
    if (!results.length) {
      const div = document.createElement('div');
      div.className = 'suggest';
      div.innerHTML = '<div class="suggest-empty">No users match — check the email/username and try again.</div>';
      suggestWrap.appendChild(div);
      return;
    }
    const div = document.createElement('div');
    div.className = 'suggest';
    div.setAttribute('role', 'listbox');
    div.innerHTML = results
      .map(
        (u) => `
      <button type="button" class="suggest-item" data-user='${esc(JSON.stringify({ username: u.username, fullName: u.fullName, email: u.email }))}'>
        <span class="avatar">${esc(initials(u.fullName))}</span>
        <span class="grow">
          <span class="si-name" style="display:block">${esc(u.fullName)} ${u.exact ? '<span class="badge badge-success" style="margin-left:4px">exact</span>' : ''}</span>
          <span class="si-sub" style="display:block">@${esc(u.username)} · ${esc(u.email)}</span>
        </span>
        ${icon('chevronRight', 16)}
      </button>`
      )
      .join('');
    suggestWrap.appendChild(div);

    div.querySelectorAll('[data-user]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = JSON.parse(btn.getAttribute('data-user'));
        selectRecipient(u);
      });
    });
  }

  function selectRecipient(u) {
    selected = u;
    recipientInput.value = u.username;
    recipientInput.setAttribute('readonly', 'true');
    recipientInput.setAttribute('aria-invalid', 'false');
    recipientInput.removeAttribute('aria-invalid');
    closeSuggestions();
    selectedWrap.innerHTML = `
      <div class="recipient-card" style="margin-top:10px">
        <span class="avatar">${esc(initials(u.fullName))}</span>
        <span class="rc-meta">
          <span class="rc-nm" style="display:block">${esc(u.fullName)}</span>
          <span class="rc-hd" style="display:block">@${esc(u.username)} · ${esc(u.email)}</span>
        </span>
        <button class="rc-change" type="button" id="change-recipient">Change</button>
      </div>
    `;
    qs('#change-recipient', selectedWrap).addEventListener('click', () => {
      selected = null;
      recipientInput.removeAttribute('readonly');
      recipientInput.value = '';
      selectedWrap.innerHTML = '';
      recipientInput.focus();
    });
    const err = selectedWrap.parentElement.querySelector('.error-text');
    if (err) err.remove();
  }

  const runLookup = debounce(async () => {
    const q = recipientInput.value.trim();
    if (q.length < 1) { closeSuggestions(); return; }
    try {
      const data = await api('/api/users/lookup?q=' + encodeURIComponent(q));
      if (document.activeElement === recipientInput || (selected === null)) {
        showSuggestions(data.results);
      }
    } catch (e) { /* ignore lookup errors */ }
  }, 260);

  recipientInput.addEventListener('input', () => {
    if (recipientInput.hasAttribute('readonly')) return;
    runLookup();
  });
  recipientInput.addEventListener('focus', () => {
    if (!recipientInput.hasAttribute('readonly') && recipientInput.value.trim().length >= 1) runLookup();
  });
  document.addEventListener('click', (e) => {
    if (!suggestWrap.contains(e.target)) closeSuggestions();
  });

  /* ---------- quick amounts + note counter ---------- */
  qsa('[data-quick]', container).forEach((chip) => {
    chip.addEventListener('click', () => {
      amountInput.value = chip.getAttribute('data-quick');
      amountInput.focus();
    });
  });
  noteInput.addEventListener('input', () => {
    qs('#note-count', container).textContent = String(noteInput.value.length);
  });

  /* ---------- review → confirm → send ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);

    const recipient = selected ? selected.username : recipientInput.value.trim();
    const amount = amountInput.value.trim();
    const note = noteInput.value.trim();
    const balance = (store.user && store.user.balance) || 0;
    const fields = {};

    if (!recipient) fields.recipient = 'Enter a recipient email or username.';
    if (!amount) fields.amount = 'Enter an amount.';
    else if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) fields.amount = 'Enter a valid amount (numbers only, max 2 decimals).';
    else if (Number(amount) <= 0) fields.amount = 'Amount must be greater than zero.';
    else if (Math.round(Number(amount) * 100) > balance) {
      fields.amount = 'Insufficient demo balance. Your available balance is ' + money(balance) + '.';
    }
    if (note.length > 200) fields.note = 'Note must be 200 characters or fewer.';

    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }

    const cents = Math.round(Number(amount) * 100);
    const recipientLabel = selected
      ? selected.fullName + ' (@' + selected.username + ')'
      : recipient;
    const recipientSub = selected ? selected.email : 'Will be validated on send';

    openConfirmModal({ recipient, recipientLabel, recipientSub, cents, amount, note });
  });

  function openConfirmModal({ recipient, recipientLabel, recipientSub, cents, amount, note }) {
    const modal = openModal({
      title: 'Confirm Payment',
      titleIcon: 'shieldCheck',
      body: `
        <div class="pay-summary">
          <div class="detail-row">
            <span class="dr-key">Recipient</span>
            <span class="dr-val">${esc(recipientLabel)}<br><span class="muted" style="font-weight:500;font-size:.82rem">${esc(recipientSub)}</span></span>
          </div>
          <div class="detail-row"><span class="dr-key">Amount</span><span class="dr-val">${esc(money(cents))}</span></div>
          <div class="detail-row"><span class="dr-key">Fee</span><span class="dr-val">${esc(money(0))} <span class="muted" style="font-weight:500">(no fee)</span></span></div>
          <div class="detail-row"><span class="dr-key">Total</span><span class="dr-val total-val">${esc(money(cents))}</span></div>
        </div>
        ${note ? `<div class="detail-row" style="border:0;padding-top:12px"><span class="dr-key">Note</span><span class="dr-val">${esc(note)}</span></div>` : ''}
        <div id="confirm-error-slot"></div>
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
            const slot = m.body.querySelector('#confirm-error-slot');
            slot.innerHTML = '';
            setLoading(btn, true, 'Sending…');
            try {
              const data = await api('/api/send', {
                method: 'POST',
                body: { recipient, amount, note }
              });
              m.close();
              setBalance(data.balance);
              toast('success', 'Payment sent successfully.');
              form.reset();
              qs('#note-count', container).textContent = '0';
              if (selected) {
                selected = null;
                recipientInput.removeAttribute('readonly');
                selectedWrap.innerHTML = '';
              }
              openPaymentSuccess({
                tx: data.transaction,
                headline: 'You sent ' + money(data.transaction.amount) + ' to @' +
                  (data.recipient ? data.recipient.username : recipient) + '.'
              });
            } catch (err) {
              slot.innerHTML =
                '<div class="form-error" role="alert" style="margin-top:14px">' +
                icon('alert', 18) + '<span>' + esc(err.message) + '</span></div>';
              if (err.fields && err.fields.amount) amountInput.setAttribute('aria-invalid', 'true');
              if (err.fields && err.fields.recipient && !selected) recipientInput.setAttribute('aria-invalid', 'true');
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

  await loadBalance();
}
