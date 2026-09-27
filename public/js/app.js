/* PayClone SPA router + boot. */
import { store } from './store.js';
import { api } from './api.js';
import { toast, closeAllModals } from './ui.js';
import { initReveals } from './reveal.js';
import { getShell, destroyShell, updateShell, updateBell, refreshBell } from './layout.js';

import { renderLanding } from './pages/landing.js';
import { renderLogin, renderSignup, renderForgot, renderReset } from './pages/auth.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderWallet } from './pages/wallet.js';
import { renderSend } from './pages/send.js';
import { renderReceive } from './pages/receive.js';
import { renderTransactions } from './pages/transactions.js';
import { renderSettings } from './pages/settings.js';
import { renderSecurity } from './pages/security.js';
import { renderNotifications } from './pages/notifications.js';
import { renderHelp } from './pages/help.js';
import { renderPayRequest } from './pages/payrequest.js';
import { renderVerify } from './pages/auth.js';
import { renderNotFound } from './pages/notfound.js';

const ROUTES = [
  { path: '/', view: renderLanding, type: 'public', title: 'PayClone — Demo Payment Platform' },
  { path: '/login', view: renderLogin, type: 'guest', title: 'Log In' },
  { path: '/signup', view: renderSignup, type: 'guest', title: 'Sign Up' },
  { path: '/forgot', view: renderForgot, type: 'guest', title: 'Forgot Password' },
  { path: '/reset/:token', view: renderReset, type: 'guest', title: 'Reset Password' },
  { path: '/verify/:token', view: renderVerify, type: 'guest', title: 'Verify Email' },
  { path: '/dashboard', view: renderDashboard, type: 'app', title: 'Dashboard' },
  { path: '/wallet', view: renderWallet, type: 'app', title: 'Wallet' },
  { path: '/send', view: renderSend, type: 'app', title: 'Send Money' },
  { path: '/receive', view: renderReceive, type: 'app', title: 'Receive Money' },
  { path: '/transactions', view: renderTransactions, type: 'app', title: 'Transaction History' },
  { path: '/transactions/:id', view: renderTransactions, type: 'app', title: 'Transaction Details' },
  /* legacy singular links (old notifications) → same details view */
  { path: '/transaction/:id', view: renderTransactions, type: 'app', title: 'Transaction Details' },
  { path: '/settings', view: renderSettings, type: 'app', title: 'Account Settings' },
  { path: '/security', view: renderSecurity, type: 'app', title: 'Security' },
  { path: '/notifications', view: renderNotifications, type: 'app', title: 'Notifications' },
  { path: '/help', view: renderHelp, type: 'app', title: 'Help & Support' },
  { path: '/pay/:ref', view: renderPayRequest, type: 'public', title: 'Payment Request' }
];

function matchRoute(path) {
  for (const r of ROUTES) {
    const keys = [];
    const pattern = r.path.replace(/:([A-Za-z0-9_]+)/g, (m, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    const re = new RegExp('^' + pattern + '/?$');
    const m = re.exec(path);
    if (!m) continue;
    const params = {};
    keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return null;
}

const appRoot = () => document.getElementById('app');

let rendering = false;

async function render() {
  if (rendering) return;
  rendering = true;
  try {
    const raw = location.hash.replace(/^#/, '') || '/';
    const path = raw.split('?')[0] || '/';
    const matched = matchRoute(path);
    const user = store.user;

    let route, params = {};
    if (matched) {
      route = matched.route;
      params = matched.params;
    } else {
      route = { path, view: renderNotFound, type: user ? 'app' : 'public', title: 'Page Not Found', notFound: true };
    }

    /* ---- guards ---- */
    if (route.type === 'app' && !user) {
      location.replace(location.pathname + '#/login');
      rendering = false;
      return;
    }
    if (route.type === 'guest' && user) {
      location.replace(location.pathname + '#' + (store.prefs.defaultHome || '/dashboard'));
      rendering = false;
      return;
    }

    closeAllModals();
    window.scrollTo(0, 0);

    const root = appRoot();

    if (route.type === 'app') {
      const shell = getShell(root);
      updateShell(path, route.title);
      shell.page.innerHTML = '';
      await route.view(shell.page, params);
      initReveals(shell.page);
      if (route.type === 'app') refreshBellQuiet();
    } else {
      destroyShell();
      root.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'public-view';
      root.appendChild(wrap);
      document.title = route.title + ' · PayClone';
      await route.view(wrap, params);
      initReveals(wrap);
    }
  } catch (err) {
    console.error('[router]', err);
    toast('error', 'Something went wrong while loading that page.');
  } finally {
    rendering = false;
  }
}

async function refreshBellQuiet() {
  const n = await refreshBell();
  if (n === null) return;
}

/* ---------------- notification polling ---------------- */
let pollTimer = null;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (document.hidden || !store.user) return;
    const n = await refreshBell();
    if (n === null && !store.user) stopPolling();
  }, 20000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

/* ---------------- auth expiry ---------------- */
window.addEventListener('auth:expired', () => {
  if (!store.user) return;
  store.setUser(null);
  stopPolling();
  destroyShell();
  toast('error', 'Your session expired. Please log in again.');
  if (location.hash !== '#/login') location.hash = '/login';
});

/* ---------------- boot ---------------- */
async function boot() {
  const user = await store.loadMe();
  if (user) {
    await store.sync();
    startPolling();
  }
  if (!location.hash) location.hash = '/';
  window.addEventListener('hashchange', render);
  await render();
}

boot();
