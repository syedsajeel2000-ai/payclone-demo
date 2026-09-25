/* Security center: password, simulated 2FA, login activity, security alerts. */
import { api } from '../api.js';
import {
  icon, esc, qs, qsa, toast, setLoading, clearFormErrors, applyFieldErrors,
  openModal, fmtDate, fmtTime, timeAgo, demoQrSvg, firstName
} from '../ui.js';
import { refreshBell } from '../layout.js';

function strengthOf(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 10) s++;
  return Math.min(4, s);
}

export async function renderSecurity(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Security</h1>
        <p class="ph-sub">Protect your demo account with a strong password, simulated two-factor authentication and login monitoring.</p>
      </div>
      <div class="ph-actions">
        <span class="badge badge-demo">${icon('shieldCheck', 13)} Demo security center</span>
      </div>
    </div>

    <div class="grid grid-2 reveal-stagger">
      <!-- PASSWORD -->
      <div class="card" id="password-card">
        <div class="card-head">
          <h2>${icon('lock', 18)} Password</h2>
          <span class="badge badge-success">Protected</span>
        </div>
        <p class="muted" style="font-size:.9rem">
          Your password is hashed with <strong>scrypt + a unique salt</strong>. It is never stored or displayed in plain text.
        </p>
        <div class="detail-list mt-16">
          <div class="detail-row"><span class="dr-key">Last changed</span><span class="dr-val" id="pw-changed">—</span></div>
          <div class="dr-val" style="text-align:left"></div>
        </div>
        <form id="password-form" style="display:none" novalidate>
          <div class="field mt-16">
            <label class="label" for="currentPassword">Current password</label>
            <div class="input-wrap">
              <input class="input" id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required>
              <span class="input-icon">${icon('lock', 17)}</span>
            </div>
          </div>
          <div class="field">
            <label class="label" for="newPassword">New password</label>
            <div class="input-wrap">
              <input class="input" id="newPassword" name="newPassword" type="password" autocomplete="new-password" required>
              <span class="input-icon">${icon('key', 17)}</span>
            </div>
            <div class="strength s-0" id="pw-strength"><span></span><span></span><span></span><span></span></div>
            <div class="strength-label">Use 8+ characters with upper, lower case and a number.</div>
          </div>
          <div class="field">
            <label class="label" for="confirmPassword">Confirm new password</label>
            <div class="input-wrap">
              <input class="input" id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required>
              <span class="input-icon">${icon('lock', 17)}</span>
            </div>
          </div>
          <div class="row gap-8">
            <button class="btn btn-primary grow" id="pw-btn" type="submit">${icon('check', 16)} Update Password</button>
            <button class="btn btn-ghost" type="button" id="pw-cancel">Cancel</button>
          </div>
        </form>
        <button class="btn btn-outline btn-block mt-16" id="pw-open">${icon('key', 16)} Change Password</button>
      </div>

      <!-- 2FA -->
      <div class="card" id="twofa-card">
        <div class="card-head">
          <h2>${icon('shieldCheck', 18)} Two-Factor Authentication</h2>
          <span id="twofa-badge">…</span>
        </div>
        <div id="twofa-body"><p class="muted">Loading…</p></div>
      </div>

      <!-- LOGIN ACTIVITY -->
      <div class="card">
        <div class="card-head">
          <h2>${icon('activity', 18)} Login activity</h2>
          <button class="btn btn-soft btn-sm" id="activity-refresh">${icon('refresh', 14)} Refresh</button>
        </div>
        <div id="activity-list"><p class="muted">Loading…</p></div>
      </div>

      <!-- SECURITY NOTIFICATIONS -->
      <div class="card">
        <div class="card-head">
          <h2>${icon('bell', 18)} Security notifications</h2>
          <button class="btn btn-soft btn-sm" data-nav="/notifications">All ${icon('chevronRight', 14)}</button>
        </div>
        <div id="security-notes"><p class="muted">Loading…</p></div>
      </div>
    </div>

    <div class="demo-strip-inline mt-16">
      ${icon('info', 15)}
      <span><strong>Simulated 2FA:</strong> this demo does not connect to a real authenticator provider (Google
      Authenticator, Authy, etc.). The QR code below is a visual representation and the verification code is generated
      by this platform. Enabling it still adds a real second verification step to your demo login.</span>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  /* ---------- password change ---------- */
  const pwForm = qs('#password-form', container);
  const pwOpen = qs('#pw-open', container);
  const pwStrength = qs('#pw-strength', container);
  const pwStrengthLabel = pwStrength.parentElement.querySelector('.strength-label');

  qs('#newPassword', pwForm).addEventListener('input', (e) => {
    const s = strengthOf(e.target.value);
    pwStrength.className = 'strength' + (s ? ' s-' + s : '');
    pwStrengthLabel.textContent = e.target.value
      ? ['Too weak — needs 8+ chars, upper, lower & number', 'Weak', 'Fair', 'Good', 'Strong'][s]
      : 'Use 8+ characters with upper, lower case and a number.';
  });

  pwOpen.addEventListener('click', () => {
    pwForm.style.display = '';
    pwOpen.style.display = 'none';
    qs('#currentPassword', pwForm).focus();
  });
  qs('#pw-cancel', pwForm).addEventListener('click', () => {
    pwForm.reset();
    clearFormErrors(pwForm);
    pwForm.style.display = 'none';
    pwOpen.style.display = '';
  });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(pwForm);
    const body = {
      currentPassword: pwForm.currentPassword.value,
      newPassword: pwForm.newPassword.value,
      confirmPassword: pwForm.confirmPassword.value
    };
    const fields = {};
    if (!body.currentPassword) fields.currentPassword = 'Enter your current password.';
    if (strengthOf(body.newPassword) < 2 || body.newPassword.length < 8) {
      fields.newPassword = 'Password must be at least 8 characters with upper, lower case and a number.';
    }
    if (body.newPassword !== body.confirmPassword) fields.confirmPassword = 'Passwords do not match.';
    if (Object.keys(fields).length) {
      applyFieldErrors(pwForm, fields);
      return;
    }
    const btn = qs('#pw-btn', pwForm);
    setLoading(btn, true, 'Updating…');
    try {
      const data = await api('/api/auth/change-password', { method: 'POST', body });
      toast('success', data.message || 'Password changed successfully.');
      pwForm.reset();
      pwForm.style.display = 'none';
      pwOpen.style.display = '';
      await load();
    } catch (err) {
      applyFieldErrors(pwForm, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---------- data loading ---------- */
  async function loadActivity() {
    try {
      const data = await api('/api/security/login-activity');
      const wrap = qs('#activity-list', container);
      if (!data.items.length) {
        wrap.innerHTML = '<p class="muted" style="font-size:.9rem">No login activity recorded yet.</p>';
        return;
      }
      wrap.innerHTML = data.items
        .slice(0, 12)
        .map(
          (a) => `
        <div class="activity-item">
          <span class="activity-dot ${a.success ? '' : 'fail'}"></span>
          <span class="activity-body">
            <span class="activity-title" style="display:block">${a.success ? 'Successful sign-in' : 'Failed sign-in attempt'}${a.note ? ' · ' + esc(a.note) : ''}</span>
            <span class="activity-sub" style="display:block">${esc(a.device)} · IP ${esc(a.ip)}</span>
          </span>
          <span class="activity-time">${esc(timeAgo(a.createdAt))}</span>
        </div>`
        )
        .join('');
    } catch (err) {
      if (err.status !== 401) toast('error', 'Could not load login activity.');
    }
  }

  async function load() {
    try {
      const data = await api('/api/security');
      qs('#pw-changed', container).textContent = data.passwordUpdatedAt
        ? fmtDate(data.passwordUpdatedAt) + ' · ' + fmtTime(data.passwordUpdatedAt)
        : 'Not tracked yet (before this feature)';

      const badge = qs('#twofa-badge', container);
      const body = qs('#twofa-body', container);

      if (data.twoFactorEnabled) {
        badge.innerHTML = '<span class="badge badge-success">Enabled</span>';
        body.innerHTML = `
          <div class="form-success" style="margin-top:0">${icon('checkCircle', 18)}
            <span>Two-factor authentication enabled${data.twoFactorEnabledAt ? ' on ' + esc(fmtDate(data.twoFactorEnabledAt)) : ''}.</span>
          </div>
          <p class="muted" style="font-size:.9rem">
            A 6-digit verification code is now required when you log in. Because this is a demo without a real
            authenticator provider, your simulated code is shown below (and at the login challenge).
          </p>
          <div class="label mt-16">Your simulated demo code</div>
          <div class="code-box">
            <span>${esc(data.demoCode || '—')}</span>
            <button class="copy-btn" type="button" id="copy-code">${icon('copy', 14)} Copy</button>
          </div>
          <button class="btn btn-outline btn-block mt-16" id="disable-2fa">${icon('shield', 16)} Disable 2FA</button>
        `;
        const copyBtn = qs('#copy-code', body);
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(data.demoCode);
              toast('success', 'Demo code copied.');
            } catch (e) {
              toast('info', 'Demo code: ' + data.demoCode);
            }
          });
        }
        qs('#disable-2fa', body).addEventListener('click', () => openDisableModal(load));
      } else {
        badge.innerHTML = '<span class="badge badge-pending">Not enabled</span>';
        body.innerHTML = `
          <p class="muted" style="font-size:.9rem">
            Add a second verification step to your demo login. When enabled you will be asked for a 6-digit
            code after your password.
          </p>
          <ul class="stack gap-8 mt-16" style="font-size:.9rem">
            <li class="row gap-8">${icon('checkCircle', 16, 'text-success')} Protects against stolen passwords</li>
            <li class="row gap-8">${icon('checkCircle', 16, 'text-success')} Works with the demo login flow</li>
            <li class="row gap-8">${icon('info', 16)} Simulated — no real authenticator app required</li>
          </ul>
          <button class="btn btn-primary btn-block mt-16" id="enable-2fa">${icon('shieldCheck', 16)} Enable 2FA</button>
        `;
        qs('#enable-2fa', body).addEventListener('click', () => openSetupModal(load));
      }

      const notes = qs('#security-notes', container);
      if (!data.securityNotifications.length) {
        notes.innerHTML = '<p class="muted" style="font-size:.9rem">No security events yet — password changes, 2FA updates and new logins will appear here.</p>';
      } else {
        notes.innerHTML = data.securityNotifications
          .map(
            (n) => `
          <div class="activity-item">
            <span class="card-icon amber" style="width:36px;height:36px">${icon('shield', 16)}</span>
            <span class="activity-body">
              <span class="activity-title" style="display:block">${esc(n.title)}</span>
              <span class="activity-sub" style="display:block">${esc(n.message)}</span>
            </span>
            <span class="activity-time">${esc(timeAgo(n.createdAt))}</span>
          </div>`
          )
          .join('');
      }

      await loadActivity();
      refreshBell();
    } catch (err) {
      if (err.status !== 401) toast('error', 'Could not load security settings.');
    }
  }

  qs('#activity-refresh', container).addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    await loadActivity();
    btn.disabled = false;
    toast('info', 'Login activity refreshed.');
  });

  await load();
}

/* ---------- 2FA setup modal (simulated) ---------- */
function openSetupModal(onDone) {
  let setup = null;

  const modal = openModal({
    title: 'Enable Two-Factor Authentication',
    titleIcon: 'shieldCheck',
    size: 'modal-lg',
    body: '<div id="tfa-setup" class="muted">Preparing secure setup…</div>',
    actions: [
      { label: 'Cancel', variant: 'btn-ghost', onClick: (m) => m.close() },
      { label: 'Verify & Enable', variant: 'btn-primary', id: 'tfa-verify-btn', onClick: (m) => verify(m) }
    ]
  });

  async function boot() {
    const wrap = modal.body.querySelector('#tfa-setup');
    try {
      setup = await api('/api/security/2fa/setup', { method: 'POST', body: {} });
      wrap.className = '';
      wrap.innerHTML = `
        <div class="steps">
          <div class="step done">
            <span class="step-dot">${icon('check', 15)}</span>
            <span class="step-body">
              <span class="sb-title" style="display:block">1 · Setup started</span>
              <span class="sb-desc" style="display:block">A simulated authenticator secret was generated for your account.</span>
            </span>
          </div>
          <div class="step active">
            <span class="step-dot">2</span>
            <span class="step-body">
              <span class="sb-title" style="display:block">2 · Add to authenticizer</span>
              <span class="sb-desc" style="display:block">Scan or copy the demo secret below.</span>
            </span>
          </div>
        </div>

        <div class="row gap-16 mt-16" style="flex-wrap:wrap;justify-content:center;text-align:center">
          <div>
            <div class="qr-frame">${demoQrSvg(setup.secret, 152)}</div>
            <div class="qr-caption">Demo QR representation — <strong>not a real scannable code</strong> (no authenticator provider is connected).</div>
          </div>
          <div class="grow" style="min-width:220px;text-align:left">
            <div class="label">Setup key</div>
            <div class="code-box">
              <span style="font-size:.85rem;letter-spacing:.08em">${esc(setup.secret)}</span>
            </div>
            <div class="label mt-16">Simulated verification code</div>
            <div class="code-box" style="background:var(--accent);color:#fff">
              <span style="letter-spacing:.3em">${esc(setup.code)}</span>
            </div>
            <p class="muted" style="font-size:.8rem;margin-top:8px">${esc(setup.message)}</p>
          </div>
        </div>

        <div class="field mt-16">
          <label class="label" for="tfa-code-input">3 · Enter the 6-digit code to verify</label>
          <input class="input code-input" id="tfa-code-input" type="text" inputmode="numeric" maxlength="6"
                 placeholder="000000" autocomplete="one-time-code" data-autofocus>
          <span id="tfa-code-error"></span>
        </div>
      `;
      setTimeout(() => {
        const input = modal.body.querySelector('#tfa-code-input');
        if (input) input.focus();
      }, 120);
    } catch (err) {
      wrap.innerHTML = '<div class="form-error">' + icon('alert', 18) + '<span>' + esc(err.message) + '</span></div>';
    }
  }

  async function verify(m) {
    const btn = m.actions.querySelectorAll('.btn')[1];
    const input = m.body.querySelector('#tfa-code-input');
    const errSlot = m.body.querySelector('#tfa-code-error');
    const code = (input.value || '').trim();
    errSlot.innerHTML = '';
    if (!/^\d{6}$/.test(code)) {
      errSlot.innerHTML = '<span class="error-text">Enter the 6-digit verification code.</span>';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return false;
    }
    setLoading(btn, true, 'Verifying…');
    try {
      const data = await api('/api/security/2fa/verify', { method: 'POST', body: { code } });
      m.close();
      toast('success', data.message || 'Two-factor authentication enabled.');
      if (onDone) onDone();
    } catch (err) {
      errSlot.innerHTML = '<span class="error-text">' + esc(err.message) + '</span>';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return false;
    } finally {
      setLoading(btn, false);
    }
    return false;
  }

  boot();
}

/* ---------- 2FA disable modal (password confirmation) ---------- */
function openDisableModal(onDone) {
  const modal = openModal({
    title: 'Disable Two-Factor Authentication',
    titleIcon: 'shield',
    body: `
      <p class="muted" style="font-size:.92rem">
        Enter your account password to confirm turning off the 2FA login challenge.
      </p>
      <div class="field mt-16">
        <label class="label" for="disable-pw">Password</label>
        <div class="input-wrap">
          <input class="input" id="disable-pw" type="password" autocomplete="current-password" placeholder="Your password" data-autofocus>
          <span class="input-icon">${icon('lock', 17)}</span>
        </div>
        <span id="disable-error"></span>
      </div>
      <div class="demo-strip-inline">${icon('info', 15)} Your demo account will only require a password to log in again.</div>
    `,
    actions: [
      { label: 'Keep 2FA', variant: 'btn-ghost', onClick: (m) => m.close() },
      {
        label: 'Disable 2FA',
        variant: 'btn-danger',
        onClick: async (m) => {
          const btn = m.actions.querySelectorAll('.btn')[1];
          const input = m.body.querySelector('#disable-pw');
          const errSlot = m.body.querySelector('#disable-error');
          errSlot.innerHTML = '';
          if (!input.value) {
            errSlot.innerHTML = '<span class="error-text">Password is required.</span>';
            input.focus();
            return false;
          }
          setLoading(btn, true, 'Disabling…');
          try {
            const data = await api('/api/security/2fa/disable', { method: 'POST', body: { password: input.value } });
            m.close();
            toast('success', data.message || 'Two-factor authentication disabled.');
            if (onDone) onDone();
          } catch (err) {
            errSlot.innerHTML = '<span class="error-text">' + esc(err.message) + '</span>';
            return false;
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
