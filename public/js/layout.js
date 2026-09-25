/* App shell: sidebar + topbar + notification bell + user menu. */
import { store } from './store.js';
import { api } from './api.js';
import { icon, esc, initials, toast, qs, qsa } from './ui.js';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/wallet', label: 'Wallet', icon: 'wallet' },
  { path: '/send', label: 'Send Money', icon: 'send' },
  { path: '/receive', label: 'Receive Money', icon: 'receive' },
  { path: '/transactions', label: 'Transactions', icon: 'receipt' },
  { path: '/notifications', label: 'Notifications', icon: 'bell', count: true },
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/security', label: 'Security', icon: 'shieldCheck' },
  { path: '/help', label: 'Help', icon: 'help' }
];

let shell = null;

function sidebarHtml() {
  const user = store.user || {};
  return (
    '<aside class="sidebar" id="sidebar" aria-label="Main navigation">' +
      '<button class="sidebar-close" id="sidebar-close" aria-label="Close menu">' + icon('x', 18) + '</button>' +
      '<button class="brand" data-nav="/dashboard">' +
        '<span class="brand-mark">P</span>' +
        '<span class="brand-word">Pay<span>Clone</span></span>' +
        '<span class="brand-demo">DEMO</span>' +
      '</button>' +
      '<div class="side-demo">' + icon('zap', 14) + ' Demo Wallet — demo transactions only, no real money is transferred.</div>' +
      '<nav class="side-nav">' +
        '<div class="side-label">Menu</div>' +
        NAV_ITEMS.map((item) =>
          '<button class="side-link" data-nav="' + item.path + '" data-path="' + item.path + '">' +
            icon(item.icon, 19) +
            '<span>' + item.label + '</span>' +
            (item.count ? '<span class="side-count" data-side-count hidden>0</span>' : '') +
          '</button>'
        ).join('') +
        '<div class="side-divider"></div>' +
        '<button class="side-link" id="logout-btn">' + icon('logout', 19) + '<span>Logout</span></button>' +
      '</nav>' +
      '<div class="sidebar-foot">' +
        '<div class="side-user">' +
          '<span class="avatar">' + esc(initials(user.fullName)) + '</span>' +
          '<span class="grow">' +
            '<span class="su-name" style="display:block">' + esc(user.fullName || '') + '</span>' +
            '<span class="su-handle" style="display:block">@' + esc(user.username || '') + '</span>' +
          '</span>' +
        '</div>' +
      '</div>' +
    '</aside>' +
    '<div class="sidebar-overlay" id="sidebar-overlay"></div>'
  );
}

function topbarHtml() {
  const user = store.user || {};
  return (
    '<header class="topbar">' +
      '<button class="hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false">' + icon('menu', 21) + '</button>' +
      '<div class="grow">' +
        '<div class="top-title" id="top-title">Dashboard</div>' +
        '<div class="top-sub">PayClone demo payment platform</div>' +
      '</div>' +
      '<button class="bell-btn" id="bell-btn" aria-label="Notifications">' +
        icon('bell', 20) +
        '<span class="bell-count" data-bell-count hidden>0</span>' +
      '</button>' +
      '<div class="user-menu">' +
        '<button class="avatar-btn" id="user-menu-btn" aria-haspopup="true" aria-expanded="false">' +
          '<span class="avatar">' + esc(initials(user.fullName)) + '</span>' +
          '<span class="ab-name">' + esc((user.fullName || '').split(' ')[0] || 'Account') + '</span>' +
          icon('chevronDown', 15) +
        '</button>' +
      '</div>' +
    '</header>'
  );
}

function wireEvents(root) {
  const sidebar = qs('#sidebar', root);
  const overlay = qs('#sidebar-overlay', root);
  const hamburger = qs('#hamburger', root);

  const openSidebar = () => {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    hamburger.setAttribute('aria-expanded', 'true');
  };
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    hamburger.setAttribute('aria-expanded', 'false');
  };

  hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);
  qs('#sidebar-close', root).addEventListener('click', closeSidebar);

  root.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn && root.contains(navBtn)) {
      e.preventDefault();
      const path = navBtn.getAttribute('data-nav');
      closeSidebar();
      if (('#' + path) !== location.hash) location.hash = path;
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  qs('#bell-btn', root).addEventListener('click', () => {
    if (location.hash !== '#/notifications') location.hash = '/notifications';
  });

  /* user dropdown menu */
  const menuBtn = qs('#user-menu-btn', root);
  const userMenuWrap = menuBtn.parentElement;
  let menuOpen = false;
  const closeMenu = () => {
    const pop = userMenuWrap.querySelector('.menu-pop');
    if (pop) pop.remove();
    menuBtn.setAttribute('aria-expanded', 'false');
    menuOpen = false;
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menuOpen) { closeMenu(); return; }
    menuOpen = true;
    menuBtn.setAttribute('aria-expanded', 'true');
    const user = store.user || {};
    const pop = document.createElement('div');
    pop.className = 'menu-pop';
    pop.innerHTML =
      '<div class="menu-head">' +
        '<div class="mh-name">' + esc(user.fullName || '') + '</div>' +
        '<div class="mh-mail">' + esc(user.email || '') + '</div>' +
      '</div>' +
      '<button class="menu-item" data-nav="/settings">' + icon('user', 17) + 'Account Settings</button>' +
      '<button class="menu-item" data-nav="/security">' + icon('shieldCheck', 17) + 'Security &amp; 2FA</button>' +
      '<button class="menu-item" data-nav="/help">' + icon('help', 17) + 'Help &amp; Support</button>' +
      '<button class="menu-item danger" id="menu-logout">' + icon('logout', 17) + 'Log Out</button>';
    userMenuWrap.appendChild(pop);
    pop.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const lo = ev.target.closest('#menu-logout');
      if (lo) { closeMenu(); doLogout(); return; }
      const item = ev.target.closest('[data-nav]');
      if (item) closeMenu();
    });
  });
  document.addEventListener('click', () => { if (menuOpen) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });

  qs('#logout-btn', root).addEventListener('click', doLogout);
}

async function doLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST', body: {} });
  } catch (e) { /* session may already be gone */ }
  store.setUser(null);
  destroyShell();
  toast('info', 'You have been logged out securely.');
  if (location.hash !== '#/login') location.hash = '/login';
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/* Create the shell once; reuse across app routes so the sidebar never re-animates. */
export function getShell(container) {
  if (shell && shell.root.isConnected && shell.container === container) return shell;
  destroyShell();
  container.innerHTML = '<div class="app-shell">' + sidebarHtml() +
    '<div class="app-main">' + topbarHtml() + '<main class="page" id="page" tabindex="-1"></main></div></div>';
  const root = container.querySelector('.app-shell');
  wireEvents(root);
  shell = { root, container, page: root.querySelector('#page') };
  return shell;
}

export function destroyShell() {
  if (shell) {
    shell.root.remove();
    shell = null;
  }
}

export function shellActive() {
  return !!shell;
}

/* Highlight the active nav item + update page title. */
export function updateShell(activePath, title) {
  if (!shell) return;
  const base = '/' + String(activePath || '').split('/')[1];
  qsa('[data-path]', shell.root).forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-path') === base);
  });
  const t = shell.root.querySelector('#top-title');
  if (t && title) t.textContent = title;
  document.title = (title ? title + ' · ' : '') + 'PayClone Demo';
}

/* ---------------- notification badge ---------------- */
let lastUnread = -1;

export function updateBell(unread, animateRing) {
  const n = Number(unread) || 0;
  store.setUnread(n);
  qsa('[data-bell-count]').forEach((el) => {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
  qsa('[data-side-count]').forEach((el) => {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
  if (animateRing && n > lastUnread && n > 0) {
    qsa('.bell-btn').forEach((b) => {
      b.classList.remove('ring');
      void b.offsetWidth;
      b.classList.add('ring');
    });
  }
  lastUnread = n;
}

export async function refreshBell() {
  try {
    const data = await api('/api/notifications');
    updateBell(data.unread, true);
    return data.unread;
  } catch (e) {
    return null;
  }
}
