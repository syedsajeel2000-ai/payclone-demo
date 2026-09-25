/* Account settings: profile, security, notifications, preferences. */
import { api } from '../api.js';
import { store, isDisposableEmailLocal } from '../store.js';
import {
  icon, esc, qs, qsa, toast, setLoading, clearFormErrors, applyFieldErrors, statusBadge
} from '../ui.js';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Sweden', 'Norway',
  'Denmark', 'Finland', 'Ireland', 'Poland', 'Portugal', 'Greece', 'Austria',
  'Turkey', 'United Arab Emirates', 'Saudi Arabia', 'India', 'Pakistan',
  'Bangladesh', 'Singapore', 'Malaysia', 'Indonesia', 'Philippines', 'Japan',
  'South Korea', 'China', 'Nigeria', 'Kenya', 'South Africa', 'Egypt',
  'Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile', 'New Zealand', 'Other'
];

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'security', label: 'Security', icon: 'shieldCheck' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'preferences', label: 'Preferences', icon: 'settings' }
];

export async function renderSettings(container) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Account Settings</h1>
        <p class="ph-sub">Manage your profile, security, notification preferences and display options.</p>
      </div>
      <div class="ph-actions">
        <span class="pill">${icon('user', 15)} <span id="set-handle">@…</span></span>
      </div>
    </div>

    <div class="chip-row" style="margin-bottom:18px" id="section-nav">
      ${SECTIONS.map(
        (s, i) => `<button class="chip" data-section="${s.id}" aria-pressed="${i === 0}">${icon(s.icon, 14)} ${s.label}</button>`
      ).join('')}
    </div>

    <!-- PROFILE -->
    <section class="card reveal-stagger" data-panel="profile">
      <div class="card-head"><h2>${icon('user', 18)} Profile</h2><span class="ch-sub">Public details used for payments</span></div>
      <form id="profile-form" novalidate>
        <div class="form-row">
          <div class="field">
            <label class="label" for="fullName">Full name</label>
            <input class="input" id="fullName" name="fullName" type="text" maxlength="80" autocomplete="name">
          </div>
          <div class="field">
            <label class="label" for="username">Username</label>
            <input class="input" id="username" name="username" type="text" maxlength="20" autocomplete="username">
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label class="label" for="email">Email</label>
            <input class="input" id="email" name="email" type="email" autocomplete="email">
          </div>
          <div class="field">
            <label class="label" for="phone">Phone <span class="hint">optional</span></label>
            <input class="input" id="phone" name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="+1 (555) 010-2233">
          </div>
        </div>
        <div class="field">
          <label class="label" for="country">Country</label>
          <select class="select" id="country" name="country">
            <option value="">Select your country</option>
            ${COUNTRIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="profile-btn" type="submit">${icon('check', 16)} Save Changes</button>
      </form>
    </section>

    <!-- SECURITY -->
    <section class="card mt-16" data-panel="security" style="display:none">
      <div class="card-head"><h2>${icon('shieldCheck', 18)} Security</h2></div>
      <div class="detail-list">
        <div class="detail-row">
          <span class="dr-key">Password</span>
          <span class="dr-val"><span class="badge badge-success">Hashed (scrypt)</span></span>
        </div>
        <div class="detail-row">
          <span class="dr-key">Two-factor authentication</span>
          <span class="dr-val" id="set-2fa">…</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">Login activity</span>
          <span class="dr-val">Tracked on the Security page</span>
        </div>
      </div>
      <div class="row gap-8 mt-16" style="flex-wrap:wrap">
        <button class="btn btn-outline grow" data-nav="/security">${icon('key', 16)} Open Security Center</button>
        <button class="btn btn-soft grow" id="goto-password">${icon('lock', 16)} Change Password</button>
      </div>
      <div class="demo-strip-inline mt-16">${icon('info', 15)} Passwords are never shown in the UI and never stored in plain text.</div>
    </section>

    <!-- NOTIFICATIONS -->
    <section class="card mt-16" data-panel="notifications" style="display:none">
      <div class="card-head"><h2>${icon('bell', 18)} Notifications</h2></div>
      <form id="notifications-form">
        <div class="switch-row">
          <span>
            <span class="sw-title" style="display:block">Payment notifications</span>
            <span class="sw-desc" style="display:block">Alerts when you send or receive demo money.</span>
          </span>
          <button class="switch" type="button" role="switch" data-toggle="payments" aria-checked="true" aria-label="Payment notifications"></button>
        </div>
        <div class="switch-row">
          <span>
            <span class="sw-title" style="display:block">Payment request updates</span>
            <span class="sw-desc" style="display:block">When someone pays a request you created.</span>
          </span>
          <button class="switch" type="button" role="switch" data-toggle="requests" aria-checked="true" aria-label="Payment request updates"></button>
        </div>
        <div class="switch-row">
          <span>
            <span class="sw-title" style="display:block">Security alerts</span>
            <span class="sw-desc" style="display:block">New logins, password changes and 2FA events.</span>
          </span>
          <button class="switch" type="button" role="switch" data-toggle="security" aria-checked="true" aria-label="Security alerts"></button>
        </div>
        <div class="switch-row">
          <span>
            <span class="sw-title" style="display:block">Email notifications <span class="badge badge-demo" style="margin-left:6px">Demo</span></span>
            <span class="sw-desc" style="display:block">No email provider is connected in this demo — the preference is stored but no email is sent.</span>
          </span>
          <button class="switch" type="button" role="switch" data-toggle="emailDemo" aria-checked="true" aria-label="Email notifications"></button>
        </div>
        <button class="btn btn-primary mt-16" id="notif-btn" type="submit">${icon('check', 16)} Save Changes</button>
      </form>
    </section>

    <!-- PREFERENCES -->
    <section class="card mt-16" data-panel="preferences" style="display:none">
      <div class="card-head"><h2>${icon('settings', 18)} Preferences</h2></div>
      <form id="preferences-form" novalidate>
        <div class="form-row">
          <div class="field">
            <label class="label" for="dateFormat">Date format</label>
            <select class="select" id="dateFormat" name="dateFormat">
              <option value="MM/DD/YYYY">MM/DD/YYYY (09/24/2026)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (24/09/2026)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2026-09-24)</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="timeFormat">Time format</label>
            <select class="select" id="timeFormat" name="timeFormat">
              <option value="12h">12-hour (2:30 PM)</option>
              <option value="24h">24-hour (14:30)</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="label" for="defaultHome">Default page after login</label>
          <select class="select" id="defaultHome" name="defaultHome">
            <option value="/dashboard">Dashboard</option>
            <option value="/wallet">Wallet</option>
            <option value="/transactions">Transaction History</option>
          </select>
        </div>
        <button class="btn btn-primary" id="pref-btn" type="submit">${icon('check', 16)} Save Changes</button>
      </form>
    </section>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  /* ---- section switching ---- */
  qsa('[data-section]', container).forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.getAttribute('data-section');
      qsa('[data-section]', container).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      qsa('[data-panel]', container).forEach((p) => {
        p.style.display = p.getAttribute('data-panel') === id ? '' : 'none';
      });
    });
  });

  const profileForm = qs('#profile-form', container);
  const notifForm = qs('#notifications-form', container);
  const prefForm = qs('#preferences-form', container);

  /* ---- load current settings ---- */
  try {
    const data = await api('/api/settings');
    store.setUser(data.profile);
    store.setPrefs(data.preferences);
    qs('#set-handle', container).textContent = '@' + data.profile.username;
    profileForm.fullName.value = data.profile.fullName || '';
    profileForm.username.value = data.profile.username || '';
    profileForm.email.value = data.profile.email || '';
    profileForm.phone.value = data.profile.phone || '';
    profileForm.country.value = data.profile.country || '';

    qsa('[data-toggle]', notifForm).forEach((sw) => {
      const key = sw.getAttribute('data-toggle');
      sw.setAttribute('aria-checked', String(data.notifications[key] !== false));
      sw.addEventListener('click', () => {
        const on = sw.getAttribute('aria-checked') === 'true';
        sw.setAttribute('aria-checked', String(!on));
      });
    });

    prefForm.dateFormat.value = data.preferences.dateFormat || 'MM/DD/YYYY';
    prefForm.timeFormat.value = data.preferences.timeFormat || '12h';
    prefForm.defaultHome.value = data.preferences.defaultHome || '/dashboard';

    const sec = await api('/api/security');
    qs('#set-2fa', container).innerHTML = sec.twoFactorEnabled
      ? '<span class="badge badge-success">Enabled</span>'
      : '<span class="badge badge-pending">Not enabled</span>';
  } catch (err) {
    if (err.status !== 401) toast('error', 'Could not load your settings.');
  }

  /* ---- save profile ---- */
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(profileForm);
    const body = {
      fullName: profileForm.fullName.value.trim(),
      username: profileForm.username.value.trim(),
      email: profileForm.email.value.trim(),
      phone: profileForm.phone.value.trim(),
      country: profileForm.country.value
    };
    const fields = {};
    if (body.fullName.length < 2) fields.fullName = 'Enter your full name (2–80 characters).';
    if (!/^[A-Za-z0-9][A-Za-z0-9._]{1,18}[A-Za-z0-9]$/.test(body.username)) {
      fields.username = '3–20 letters, numbers, dots or underscores.';
    }
    if (/@[^@\s]*@/.test(body.email)) {
      fields.email = 'This email looks malformed (multiple @ signs) and cannot be used.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) {
      fields.email = 'Enter a valid email address.';
    } else if (isDisposableEmailLocal(body.email)) {
      fields.email = 'Disposable / temporary email addresses are not allowed. Please use a permanent email.';
    }
    if (Object.keys(fields).length) {
      applyFieldErrors(profileForm, fields);
      return;
    }
    const btn = qs('#profile-btn', profileForm);
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api('/api/settings/profile', { method: 'PUT', body });
      store.setUser(data.profile);
      qs('#set-handle', container).textContent = '@' + data.profile.username;
      toast('success', 'Profile updated successfully.');
    } catch (err) {
      applyFieldErrors(profileForm, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---- save notifications ---- */
  notifForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {};
    qsa('[data-toggle]', notifForm).forEach((sw) => {
      body[sw.getAttribute('data-toggle')] = sw.getAttribute('aria-checked') === 'true';
    });
    const btn = qs('#notif-btn', notifForm);
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api('/api/settings/notifications', { method: 'PUT', body });
      toast('success', data.message || 'Notification preferences saved.');
    } catch (err) {
      toast('error', err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  /* ---- save preferences ---- */
  prefForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(prefForm);
    const body = {
      dateFormat: prefForm.dateFormat.value,
      timeFormat: prefForm.timeFormat.value,
      defaultHome: prefForm.defaultHome.value
    };
    const btn = qs('#pref-btn', prefForm);
    setLoading(btn, true, 'Saving…');
    try {
      const data = await api('/api/settings/preferences', { method: 'PUT', body });
      store.setPrefs(data.preferences);
      toast('success', 'Preferences saved.');
    } catch (err) {
      applyFieldErrors(prefForm, err.fields, err.message);
    } finally {
      setLoading(btn, false);
    }
  });

  qs('#goto-password', container).addEventListener('click', () => {
    location.hash = '/security';
    setTimeout(() => {
      const pw = document.getElementById('password-card');
      if (pw) pw.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  });
}
