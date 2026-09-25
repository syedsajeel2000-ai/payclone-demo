/* Auth pages: login (+2FA step), signup, forgot password, reset password. */
import { api } from '../api.js';
import { store, isDisposableEmailLocal } from '../store.js';
import { icon, esc, toast, qs, setLoading, clearFormErrors, applyFieldErrors, formBanner, copyWithToast } from '../ui.js';

/* ---------- shared helpers ---------- */

function authLayout(container, { asideTitle, asideText, items, cardHtml }) {
  container.innerHTML = `
    <div class="auth-page">
      <aside class="auth-aside reveal reveal-left">
        <button class="brand" data-nav="/">
          <span class="brand-mark">P</span>
          <span class="brand-word">Pay<span>Clone</span></span>
          <span class="brand-demo">DEMO</span>
        </button>
        <div>
          <h2>${esc(asideTitle)}</h2>
          <p style="margin-top:10px;color:#b9d2ff;line-height:1.6">${esc(asideText)}</p>
          <div class="aside-list">
            ${items
              .map(
                (i) =>
                  `<div class="aside-item">${icon(i.icon, 18)}<span>${esc(i.text)}</span></div>`
              )
              .join('')}
          </div>
        </div>
        <div class="aside-note">
          ${icon('shieldCheck', 15)}
          <strong>Demo payment environment.</strong> No real money is transferred and no banking credentials are requested.
          Passwords are hashed with scrypt and never stored or displayed in plain text.
        </div>
      </aside>

      <main class="auth-panel reveal reveal-right">
        <div class="auth-topbar">
          <button class="brand" data-nav="/">
            <span class="brand-mark">P</span>
            <span class="brand-word">Pay<span>Clone</span></span>
            <span class="brand-demo">DEMO</span>
          </button>
          <a class="btn btn-ghost btn-sm" href="#/">${icon('arrowLeft', 15)} Home</a>
        </div>
        <div class="auth-card">${cardHtml}</div>
        <div class="auth-foot">${icon('lock', 13)} Secured demo session · HTTP-only cookies</div>
      </main>
    </div>
  `;
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = el.getAttribute('data-nav');
    });
  });
}

function wirePasswordToggles(root) {
  root.querySelectorAll('[data-pw-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = root.querySelector('#' + btn.getAttribute('data-pw-toggle'));
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = icon(showing ? 'eye' : 'eyeOff', 18);
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
}

function strengthOf(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) && pw.length >= 10) s++;
  return Math.min(4, s);
}

const STRENGTH_LABELS = ['Too weak — needs 8+ chars, upper, lower & number', 'Weak', 'Fair', 'Good', 'Strong'];

function wireStrength(pwInput, meterEl) {
  if (!pwInput || !meterEl) return;
  const label = meterEl.parentElement.querySelector('.strength-label');
  const update = () => {
    const s = strengthOf(pwInput.value);
    meterEl.className = 'strength' + (s ? ' s-' + s : '');
    if (label) label.textContent = pwInput.value ? STRENGTH_LABELS[s] : 'Use 8+ characters with upper, lower case and a number.';
  };
  pwInput.addEventListener('input', update);
  update();
}

async function afterLogin(data) {
  store.setUser(data.user);
  await store.sync();
  const dest = store.prefs.defaultHome || '/dashboard';
  toast('success', 'Welcome back, ' + (data.user.fullName || '').split(' ')[0] + '!');
  location.hash = dest;
}

/* =========================================================
   LOGIN (with simulated 2FA challenge step)
   ========================================================= */
export async function renderLogin(container) {
  authLayout(container, {
    asideTitle: 'Welcome back to your demo wallet.',
    asideText: 'Log in to send, receive and track demo payments across your secure demo account.',
    items: [
      { icon: 'wallet', text: 'View your demo wallet balance instantly' },
      { icon: 'send', text: 'Send demo money by email or username' },
      { icon: 'receipt', text: 'Search, filter and export your transactions' },
      { icon: 'shieldCheck', text: 'Optional two-factor login challenge' }
    ],
    cardHtml: `
      <div class="auth-head">
        <h1>Log in</h1>
        <p>Enter your email or username to access your demo wallet.</p>
      </div>

      <form id="login-form" novalidate>
        <div class="field">
          <label class="label" for="identifier">Email or username</label>
          <div class="input-wrap">
            <input class="input" id="identifier" name="identifier" type="text" autocomplete="username"
                   placeholder="you@demo.test or username" required>
            <span class="input-icon">${icon('user', 17)}</span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="password">
            <span>Password</span>
            <a href="#/forgot" style="font-weight:700">Forgot password?</a>
          </label>
          <div class="input-wrap">
            <input class="input" id="password" name="password" type="password" autocomplete="current-password"
                   placeholder="Your password" required>
            <span class="input-icon">${icon('lock', 17)}</span>
            <button class="pw-toggle" type="button" data-pw-toggle="password" aria-label="Show password">${icon('eye', 18)}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="login-btn" type="submit">Log In</button>
      </form>

      <div class="auth-alt">New to PayClone? <a href="#/signup">Create an account</a></div>
      <div class="auth-alt" style="font-size:.82rem">Demo mode — this is an educational platform and does not transfer real money.</div>
    `
  });

  wirePasswordToggles(container);
  const form = qs('#login-form', container);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const identifier = form.identifier.value.trim();
    const password = form.password.value;
    const fields = {};
    if (!identifier) fields.identifier = 'Enter your email or username.';
    if (!password) fields.password = 'Enter your password.';
    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }
    const btn = qs('#login-btn', form);
    setLoading(btn, true, 'Logging in…');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
      if (data.requires2fa) {
        renderTwoFactorStep(container, data);
        return;
      }
      await afterLogin(data);
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

function renderTwoFactorStep(container, challenge) {
  authLayout(container, {
    asideTitle: 'Two-factor check.',
    asideText: 'Your demo account has simulated two-factor authentication enabled, so a verification code is required.',
    items: [
      { icon: 'shieldCheck', text: 'Extra verification step before your wallet opens' },
      { icon: 'key', text: 'Demo code is generated by this platform (no real authenticator)' },
      { icon: 'lock', text: 'Challenge expires automatically after 5 minutes' }
    ],
    cardHtml: `
      <div class="tfa-hero">${icon('shieldCheck', 30)}</div>
      <div class="auth-head">
        <h1>Two-factor authentication</h1>
        <p>Enter the 6-digit code for <strong>${esc(challenge.account.username)}</strong> to finish logging in.</p>
      </div>

      <form id="tfa-form" novalidate>
        <div class="field">
          <label class="label" for="tfa-code">Verification code</label>
          <input class="input code-input" id="tfa-code" name="code" type="text" inputmode="numeric"
                 maxlength="6" autocomplete="one-time-code" placeholder="000000" required>
        </div>
        <div class="demo-strip-inline" style="margin-bottom:16px">
          ${icon('info', 15)}
          <span><strong>Simulated 2FA demo:</strong> no real authenticator app is connected, so your current demo code is
          <strong class="mono">${esc(challenge.demoCode)}</strong>.</span>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="tfa-btn" type="submit">Verify &amp; Log In</button>
        <button class="btn btn-ghost btn-block mt-8" type="button" id="tfa-back">Back to login</button>
      </form>

      <div class="auth-alt">Wrong account? <a href="#/login">Log in again</a></div>
    `
  });

  const form = qs('#tfa-form', container);
  qs('#tfa-back', container).addEventListener('click', () => renderLogin(container));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const code = form.code.value.trim();
    if (!/^\d{6}$/.test(code)) {
      applyFieldErrors(form, { code: 'Enter the 6-digit verification code.' });
      return;
    }
    const btn = qs('#tfa-btn', form);
    setLoading(btn, true, 'Verifying…');
    try {
      const data = await api('/api/auth/login-2fa', {
        method: 'POST',
        body: { pendingToken: challenge.pendingToken, code }
      });
      await afterLogin(data);
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* =========================================================
   SIGN UP
   ========================================================= */
export async function renderSignup(container) {
  authLayout(container, {
    asideTitle: 'Create your demo wallet in under a minute.',
    asideText: 'Sign up, get instant demo funds, and start sending and receiving payments in the sandbox.',
    items: [
      { icon: 'sparkles', text: '$1,000 in welcome demo funds (sandbox money)' },
      { icon: 'send', text: 'Send & receive demo payments instantly' },
      { icon: 'receipt', text: 'Full transaction history with receipts' },
      { icon: 'shieldCheck', text: 'Strong password rules & optional 2FA' }
    ],
    cardHtml: `
      <div class="auth-head">
        <h1>Create your account</h1>
        <p>Join the PayClone demo platform — it only takes a moment.</p>
      </div>

      <form id="signup-form" novalidate>
        <div class="field">
          <label class="label" for="fullName">Full name</label>
          <div class="input-wrap">
            <input class="input" id="fullName" name="fullName" type="text" autocomplete="name"
                   placeholder="e.g. Alex Morgan" maxlength="80" required>
            <span class="input-icon">${icon('user', 17)}</span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="username">Username</label>
          <div class="input-wrap">
            <input class="input" id="username" name="username" type="text" autocomplete="username"
                   placeholder="e.g. alex.morgan" maxlength="20" required>
            <span class="input-icon">${icon('users', 17)}</span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="email">Email</label>
          <div class="input-wrap">
            <input class="input" id="email" name="email" type="email" autocomplete="email"
                   placeholder="you@demo.test" required>
            <span class="input-icon">${icon('mail', 17)}</span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="password">Password</label>
          <div class="input-wrap">
            <input class="input" id="password" name="password" type="password" autocomplete="new-password"
                   placeholder="Strong password" required>
            <span class="input-icon">${icon('lock', 17)}</span>
            <button class="pw-toggle" type="button" data-pw-toggle="password" aria-label="Show password">${icon('eye', 18)}</button>
          </div>
          <div class="strength s-0" id="pw-strength"><span></span><span></span><span></span><span></span></div>
          <div class="strength-label">Use 8+ characters with upper, lower case and a number.</div>
        </div>
        <div class="field">
          <label class="label" for="confirmPassword">Confirm password</label>
          <div class="input-wrap">
            <input class="input" id="confirmPassword" name="confirmPassword" type="password"
                   autocomplete="new-password" placeholder="Repeat your password" required>
            <span class="input-icon">${icon('lock', 17)}</span>
            <button class="pw-toggle" type="button" data-pw-toggle="confirmPassword" aria-label="Show password">${icon('eye', 18)}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="signup-btn" type="submit">Create Account</button>
      </form>

      <div class="auth-alt">Already have an account? <a href="#/login">Log in</a></div>
      <div class="auth-alt" style="font-size:.82rem">Educational demo — accounts hold demo funds only.</div>
    `
  });

  wirePasswordToggles(container);
  wireStrength(qs('#password', container), qs('#pw-strength', container));

  const form = qs('#signup-form', container);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const values = {
      fullName: form.fullName.value.trim(),
      username: form.username.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
      confirmPassword: form.confirmPassword.value
    };
    const fields = {};
    if (values.fullName.length < 2) fields.fullName = 'Enter your full name (2–80 characters).';
    if (!/^[A-Za-z0-9][A-Za-z0-9._]{1,18}[A-Za-z0-9]$/.test(values.username)) {
      fields.username = '3–20 letters, numbers, dots or underscores.';
    }
    if (/@[^@\s]*@/.test(values.email)) {
      fields.email = 'This email looks malformed (multiple @ signs) and cannot be used.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) {
      fields.email = 'Enter a valid email address.';
    } else if (isDisposableEmailLocal(values.email)) {
      fields.email = 'Disposable / temporary email addresses are not allowed. Please use a permanent email.';
    }
    if (strengthOf(values.password) < 2 || values.password.length < 8) {
      fields.password = 'Password must be at least 8 characters with upper, lower case and a number.';
    }
    if (values.password !== values.confirmPassword) fields.confirmPassword = 'Passwords do not match.';
    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }

    const btn = qs('#signup-btn', form);
    setLoading(btn, true, 'Creating account…');
    try {
      const data = await api('/api/auth/signup', { method: 'POST', body: values });
      store.setUser(data.user);
      await store.sync();
      toast('success', 'Welcome to PayClone, ' + values.fullName.split(' ')[0] + '! Your demo wallet is ready.');
      location.hash = store.prefs.defaultHome || '/dashboard';
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* =========================================================
   FORGOTTEN PASSWORD (honest simulated email)
   ========================================================= */
export async function renderForgot(container) {
  authLayout(container, {
    asideTitle: 'Recover your demo account.',
    asideText: 'Reset your password securely — the reset link is simulated in this demo environment.',
    items: [
      { icon: 'mail', text: 'Request a reset token by email' },
      { icon: 'key', text: 'Choose a brand new strong password' },
      { icon: 'shieldCheck', text: 'All other sessions are signed out' }
    ],
    cardHtml: `
      <div class="auth-head">
        <h1>Forgot password?</h1>
        <p>Enter the email address registered on your demo account.</p>
      </div>

      <form id="forgot-form" novalidate>
        <div class="field">
          <label class="label" for="email">Email address</label>
          <div class="input-wrap">
            <input class="input" id="email" name="email" type="email" autocomplete="email"
                   placeholder="you@demo.test" required>
            <span class="input-icon">${icon('mail', 17)}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="forgot-btn" type="submit">Reset Password</button>
      </form>

      <div id="forgot-result"></div>
      <div class="auth-alt">Remembered it? <a href="#/login">Back to log in</a></div>
    `
  });

  const form = qs('#forgot-form', container);
  const result = qs('#forgot-result', container);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const email = form.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      applyFieldErrors(form, { email: 'Enter a valid email address.' });
      return;
    }
    const btn = qs('#forgot-btn', form);
    setLoading(btn, true, 'Requesting…');
    try {
      const data = await api('/api/auth/forgot', { method: 'POST', body: { email } });
      result.innerHTML = `
        <div class="card mt-16" style="border-color:#bfe8d0;background:var(--success-soft)">
          <div class="row gap-8" style="align-items:flex-start;color:#075e31">
            ${icon('info', 18)}
            <div style="font-size:.88rem;line-height:1.6">
              <strong>Demo mode — no email was sent.</strong><br>
              ${esc(data.message)}
            </div>
          </div>
          <div class="label mt-16">Simulated reset token</div>
          <div class="code-box">
            <span style="font-size:.8rem;letter-spacing:.04em;word-break:break-all">${esc(data.resetToken)}</span>
            <button class="copy-btn" type="button" id="copy-token">${icon('copy', 14)} Copy</button>
          </div>
          <div class="row gap-8 mt-16" style="flex-wrap:wrap">
            <button class="btn btn-primary btn-sm grow" id="open-reset" type="button">Open Reset Page</button>
            <button class="btn btn-ghost btn-sm" id="request-again" type="button">Send Again</button>
          </div>
        </div>
      `;
      qs('#copy-token', result).addEventListener('click', () => copyWithToast(data.resetToken, 'Reset token'));
      qs('#open-reset', result).addEventListener('click', () => {
        location.hash = data.resetPath.replace(/^#/, '');
      });
      qs('#request-again', result).addEventListener('click', () => {
        result.innerHTML = '';
        form.email.focus();
      });
      toast('info', 'Demo reset token created — no email was sent.');
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}

/* =========================================================
   RESET PASSWORD
   ========================================================= */
export async function renderReset(container, params) {
  const token = (params && params.token) || '';
  authLayout(container, {
    asideTitle: 'Choose a new password.',
    asideText: 'Paste the simulated reset token and set a new strong password for your demo account.',
    items: [
      { icon: 'key', text: 'Token-based reset (expires in 30 minutes)' },
      { icon: 'lock', text: 'New password is hashed immediately' },
      { icon: 'shieldCheck', text: 'Every other session is signed out' }
    ],
    cardHtml: `
      <div class="auth-head">
        <h1>Reset password</h1>
        <p>Paste your reset token and choose a new strong password.</p>
      </div>

      <form id="reset-form" novalidate>
        <div class="field">
          <label class="label" for="token">Reset token</label>
          <div class="input-wrap">
            <input class="input mono" id="token" name="token" type="text" value="${esc(token)}"
                   placeholder="Paste your reset token" required>
            <span class="input-icon">${icon('key', 17)}</span>
          </div>
        </div>
        <div class="field">
          <label class="label" for="password">New password</label>
          <div class="input-wrap">
            <input class="input" id="password" name="password" type="password" autocomplete="new-password"
                   placeholder="Strong password" required>
            <span class="input-icon">${icon('lock', 17)}</span>
            <button class="pw-toggle" type="button" data-pw-toggle="password" aria-label="Show password">${icon('eye', 18)}</button>
          </div>
          <div class="strength s-0" id="pw-strength"><span></span><span></span><span></span><span></span></div>
          <div class="strength-label">Use 8+ characters with upper, lower case and a number.</div>
        </div>
        <div class="field">
          <label class="label" for="confirmPassword">Confirm new password</label>
          <div class="input-wrap">
            <input class="input" id="confirmPassword" name="confirmPassword" type="password"
                   autocomplete="new-password" placeholder="Repeat your new password" required>
            <span class="input-icon">${icon('lock', 17)}</span>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" id="reset-btn" type="submit">Update Password</button>
      </form>

      <div class="auth-alt">Need a token? <a href="#/forgot">Request a reset</a></div>
    `
  });

  wirePasswordToggles(container);
  wireStrength(qs('#password', container), qs('#pw-strength', container));

  const form = qs('#reset-form', container);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const values = {
      token: form.token.value.trim(),
      password: form.password.value,
      confirmPassword: form.confirmPassword.value
    };
    const fields = {};
    if (!values.token) fields.token = 'Reset token is required.';
    if (strengthOf(values.password) < 2 || values.password.length < 8) {
      fields.password = 'Password must be at least 8 characters with upper, lower case and a number.';
    }
    if (values.password !== values.confirmPassword) fields.confirmPassword = 'Passwords do not match.';
    if (Object.keys(fields).length) {
      applyFieldErrors(form, fields);
      return;
    }
    const btn = qs('#reset-btn', form);
    setLoading(btn, true, 'Updating…');
    try {
      const data = await api('/api/auth/reset', { method: 'POST', body: values });
      toast('success', data.message || 'Password updated.');
      location.hash = '/login';
    } catch (err) {
      applyFieldErrors(form, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });
}
