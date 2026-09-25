/* UI toolkit: icons, escaping, formatters, modal, toast, form helpers. */
import { store } from './store.js';

/* ---------------- escaping (XSS safety) ---------------- */
export function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- icons ---------------- */
const ICONS = {
  home: '<path d="M3.5 10.6 12 3.5l8.5 7.1"/><path d="M5.5 9.6V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.6"/>',
  wallet: '<path d="M20 8.5V7a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a2 2 0 0 0 2-2v-1.5"/><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17v3.5"/><circle cx="16.4" cy="13.4" r="1.1"/>',
  send: '<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z"/>',
  receive: '<path d="M12 3.5v11"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  receipt: '<path d="M6 3h12v18l-2.4-1.6L13.2 21l-2.4-1.6L8.4 21 6 19.4V3Z"/><path d="M9.2 8h5.6"/><path d="M9.2 12h5.6"/>',
  bell: '<path d="M18 9.5a6 6 0 1 0-12 0c0 4.6-2 6.2-2 6.2h16s-2-1.6-2-6.2"/><path d="M10.4 19.5a2 2 0 0 0 3.2 0"/>',
  settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
  shield: '<path d="M12 3 4.5 6v5.4c0 4.6 3.2 8.2 7.5 9.6 4.3-1.4 7.5-5 7.5-9.6V6L12 3Z"/>',
  shieldCheck: '<path d="M12 3 4.5 6v5.4c0 4.6 3.2 8.2 7.5 9.6 4.3-1.4 7.5-5 7.5-9.6V6L12 3Z"/><path d="m9 11.8 2.2 2.2 4-4.2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.2-2.5 3.7"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none"/>',
  logout: '<path d="M9.5 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3h4"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/>',
  menu: '<path d="M4 6.5h16"/><path d="M4 12h16"/><path d="M4 17.5h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
  plus: '<path d="M12 5.5v13"/><path d="M5.5 12h13"/>',
  check: '<path d="m5 13 4.5 4.5L19 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.4 2.4 4.8-5.2"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M6.5 14.6h3.5"/>',
  bank: '<path d="M12 3.2 4 7.5h16L12 3.2Z"/><path d="M5.5 10.5v7M9.5 10.5v7M14.5 10.5v7M18.5 10.5v7"/><path d="M3.5 20.5h17"/>',
  topup: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2.2"/><path d="M6 15H5.2A2.2 2.2 0 0 1 3 12.8V5.2A2.2 2.2 0 0 1 5.2 3h7.6A2.2 2.2 0 0 1 15 5.2V6"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  printer: '<path d="M7 8.5V4h10v4.5"/><rect x="4" y="8.5" width="16" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.5-3.4 4.2-5 7.5-5s6 1.6 7.5 5"/>',
  users: '<circle cx="9.5" cy="8.5" r="3.5"/><path d="M3 20c1.2-3 3.6-4.5 6.5-4.5S14.8 17 16 20"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M18 15.7c2 .7 3.3 2.1 4 4.3"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.4"/>',
  key: '<circle cx="8" cy="15.2" r="4.3"/><path d="m11.2 12 8-8"/><path d="m16.4 6.8 2.4 2.4"/><path d="m14 9.2 2.4 2.4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-2.7 3.6"/><path d="M6.4 7.6A16.9 16.9 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"/><path d="m9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  alert: '<path d="M12 4.2 20.8 19.8H3.2L12 4.2Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19.5 12H5"/><path d="m11 6-6 6 6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  arrowDownLeft: '<path d="M17 7 7 17"/><path d="M15.5 17H7V8.5"/>',
  trendingUp: '<path d="m3 16 5.5-5.5 3.5 3.5L21 5"/><path d="M15.5 5H21v5.5"/>',
  trendingDown: '<path d="m3 8 5.5 5.5L12 10l9 9"/><path d="M15.5 19H21v-13.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m4 7.5 8 5.5 8-5.5"/>',
  phone: '<rect x="6.5" y="3" width="11" height="18" rx="2.4"/><path d="M10.5 17.6h3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5h17"/><path d="M3.5 14.5h17"/><path d="M12 3a14.5 14.5 0 0 1 0 18"/><path d="M12 3a14.5 14.5 0 0 0 0 18"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.7 6.6"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.4-1.4"/>',
  external: '<path d="M13.5 5H19v5.5"/><path d="M19 5 11 13"/><path d="M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H11"/>',
  trash: '<path d="M4.5 6.5h15"/><path d="M9 6.5V5.2A1.7 1.7 0 0 1 10.7 3.5h2.6A1.7 1.7 0 0 1 15 5.2v1.3"/><path d="M6.6 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.8-12.5"/><path d="M10.4 10.5v6"/><path d="M13.6 10.5v6"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5"/><path d="M4 4.5v4h4"/><path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M20 19.5v-4h-4"/>',
  zap: '<path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z"/>',
  sparkles: '<path d="m12 4 1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z"/><path d="m18.6 15.4.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  activity: '<path d="M3.5 12h4L10 6l4 12 2.5-6h4"/>',
  qr: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><path d="M13.5 13.5h3.2v3.2h-3.2z"/><path d="M20 13.5v3"/><path d="M16.8 20H20"/>',
  filter: '<path d="M4 6.5h16"/><path d="M7 12h10"/><path d="M10 17.5h4"/>',
  sort: '<path d="M7 4.5v15"/><path d="m4 8 3-3.5L10 8"/><path d="M17 19.5v-15"/><path d="m14 16 3 3.5 3-3.5"/>',
  dollar: '<path d="M12 3.5v17"/><path d="M16.5 7.6c0-1.8-2-2.8-4.5-2.8s-4.5 1-4.5 3 2 2.6 4.5 3.1 4.5 1.4 4.5 3.3-2 2.9-4.5 2.9-4.5-1-4.5-2.8"/>',
  cart: '<path d="M3.5 4.5h2l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h7.6a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  file: '<path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z"/><path d="M13.5 3.5V9H19"/>',
  lightning: '<path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z"/>'
};

export function icon(name, size, cls) {
  const s = size || 20;
  const c = cls ? ' ' + cls : '';
  return (
    '<svg class="ico' + c + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || ICONS.info) + '</svg>'
  );
}

/* ---------------- formatters ---------------- */
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function money(cents) {
  const n = (Number(cents) || 0) / 100;
  try {
    return moneyFmt.format(n);
  } catch (e) {
    return '$' + n.toFixed(2);
  }
}

export function signedMoney(cents, direction) {
  if (direction === 'added') return '+' + money(cents);
  return (direction === 'sent' ? '-' : '+') + money(cents);
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

export function fmtDate(iso, overrideFormat) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const fmt = overrideFormat || store.prefs.dateFormat || 'MM/DD/YYYY';
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  if (fmt === 'DD/MM/YYYY') return dd + '/' + mm + '/' + yyyy;
  if (fmt === 'YYYY-MM-DD') return yyyy + '-' + mm + '-' + dd;
  return mm + '/' + dd + '/' + yyyy;
}

export function fmtTime(iso, overrideFormat) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const fmt = overrideFormat || store.prefs.timeFormat || '12h';
  if (fmt === '24h') return pad(d.getHours()) + ':' + pad(d.getMinutes());
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + pad(d.getMinutes()) + ' ' + ampm;
}

export function fmtDateTime(iso) {
  return fmtDate(iso) + ' · ' + fmtTime(iso);
}

export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const secs = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return fmtDate(iso);
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

export function qs(sel, root) { return (root || document).querySelector(sel); }
export function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

export function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments;
    const self = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(self, args), ms);
  };
}

/* ---------------- buttons ---------------- */
export function setLoading(btn, loading, loadingText) {
  if (!btn) return;
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.classList.add('is-loading');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>' + (loadingText ? esc(loadingText) : '');
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    delete btn.dataset.originalHtml;
  }
}

/* ---------------- clipboard ---------------- */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

export function copyWithToast(text, label) {
  copyText(text).then((ok) => {
    if (ok) toast('success', (label || 'Copied') + ' to clipboard.');
    else toast('error', 'Copy failed — please copy manually.');
  });
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------------- toasts ---------------- */
const TOAST_ICONS = { success: 'checkCircle', error: 'alert', info: 'info' };

export function toast(type, message, duration) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'info');
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<span class="t-ico">' + icon(TOAST_ICONS[type] || 'info', 19) + '</span>' +
    '<div class="t-body">' + esc(message) + '</div>' +
    '<button class="t-x" aria-label="Dismiss">' + icon('x', 15) + '</button>';
  const remove = () => {
    if (!el.parentNode) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.t-x').addEventListener('click', remove);
  root.appendChild(el);
  setTimeout(remove, duration || 4200);
}

/* ---------------- modal ---------------- */
let modalStack = [];

export function openModal(opts) {
  const root = document.getElementById('modal-root');
  const title = opts.title || '';
  const dismissible = opts.dismissible !== false;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML =
    '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal-head">' +
        '<div class="grow">' +
          '<h3>' + (opts.titleIcon ? icon(opts.titleIcon, 20) : '') + esc(title) + '</h3>' +
        '</div>' +
        (dismissible ? '<button class="modal-close" data-modal-close aria-label="Close">' + icon('x', 17) + '</button>' : '') +
      '</div>' +
      '<div class="modal-body"></div>' +
      '<div class="modal-actions"></div>' +
    '</div>';

  // subtitle (supports plain text)
  if (opts.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'mh-sub';
    sub.textContent = opts.subtitle;
    backdrop.querySelector('.modal-head .grow').appendChild(sub);
  }

  const bodyEl = backdrop.querySelector('.modal-body');
  if (opts.body instanceof Node) bodyEl.appendChild(opts.body);
  else if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;

  const actionsEl = backdrop.querySelector('.modal-actions');
  (opts.actions || []).forEach((a) => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.variant || 'btn-primary');
    if (a.id) btn.id = a.id;
    btn.innerHTML = (a.icon ? icon(a.icon, 17) : '') + '<span>' + esc(a.label) + '</span>';
    btn.addEventListener('click', async () => {
      if (a.onClick) {
        const res = await a.onClick(api);
        if (res === false) return;
      } else {
        api.close();
      }
    });
    actionsEl.appendChild(btn);
  });
  if (!(opts.actions || []).length) actionsEl.style.display = 'none';

  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      close();
    }
  };
  const onBackdrop = (e) => {
    if (dismissible && e.target === backdrop) close();
  };

  function close() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.removeEventListener('click', onBackdrop);
    backdrop.remove();
    modalStack = modalStack.filter((m) => m !== api);
    if (!modalStack.length) document.body.style.overflow = '';
    if (opts.onClose) opts.onClose();
  }

  backdrop.addEventListener('click', onBackdrop);
  /* X (close) button in the modal head — delegated so it works no matter
     what re-renders inside the head; action buttons have their own handlers */
  backdrop.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-modal-close]');
    if (closer && dismissible) {
      e.stopPropagation();
      close();
    }
  });
  document.addEventListener('keydown', onKey, true);
  root.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const api = { el: backdrop, body: bodyEl, actions: actionsEl, close };
  modalStack.push(api);

  // focus first focusable control
  setTimeout(() => {
    const f = backdrop.querySelector('input, button.btn, [data-autofocus]');
    if (f) f.focus();
  }, 60);

  return api;
}

export function closeAllModals() {
  modalStack.slice().forEach((m) => m.close());
}

/* ---------------- form helpers ---------------- */
export function clearFormErrors(form) {
  qsa('.error-text', form).forEach((el) => el.remove());
  qsa('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  const banner = form.querySelector('.form-error, .form-success');
  if (banner) banner.remove();
}

export function applyFieldErrors(form, fields, fallbackMessage) {
  clearFormErrors(form);
  let first = null;
  Object.keys(fields || {}).forEach((name) => {
    const input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const err = document.createElement('span');
    err.className = 'error-text';
    err.textContent = fields[name];
    input.insertAdjacentElement('afterend', err);
    if (!first) first = input;
  });
  if (first) {
    first.focus({ preventScroll: false });
    return false;
  }
  if (fallbackMessage) formBanner(form, 'error', fallbackMessage);
  return true;
}

export function formBanner(form, type, message) {
  const old = form.querySelector('.form-error, .form-success');
  if (old) old.remove();
  const div = document.createElement('div');
  div.className = type === 'success' ? 'form-success' : 'form-error';
  div.setAttribute('role', 'alert');
  div.innerHTML = icon(type === 'success' ? 'checkCircle' : 'alert', 18) + '<span>' + esc(message) + '</span>';
  form.insertAdjacentElement('afterbegin', div);
  return div;
}

/* ---------------- misc ---------------- */
export function statusBadge(status) {
  const map = { completed: ['badge-success', 'Completed'], pending: ['badge-pending', 'Pending'], failed: ['badge-failed', 'Failed'] };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
}

export function partyName(tx) {
  if (tx.type === 'topup') return tx.partyLabel || 'Demo Payment Method';
  if (tx.counterparty) return tx.counterparty.fullName;
  if (tx.direction === 'received') return 'Payment request';
  return 'Unknown user';
}

export function partySub(tx) {
  if (tx.type === 'topup') return tx.reference || 'Instant demo credit';
  if (tx.counterparty) return '@' + tx.counterparty.username;
  return tx.reference || '';
}

/* Demo QR-style visual (clearly labelled as a representation, not scannable). */
export function demoQrSvg(seed, size) {
  const n = 21;
  const px = size || 152;
  const cell = px / n;
  let h = 2166136261;
  const str = String(seed || 'payclone-demo');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
  const isFinder = (x, y) => {
    const inBox = (bx, by) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
    return inBox(0, 0) || inBox(n - 7, 0) || inBox(0, n - 7);
  };
  let rects = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (isFinder(x, y)) continue;
      if (rand() > 0.52) {
        rects += '<rect x="' + (x * cell).toFixed(2) + '" y="' + (y * cell).toFixed(2) +
          '" width="' + cell.toFixed(2) + '" height="' + cell.toFixed(2) + '"/>';
      }
    }
  }
  const finder = (fx, fy) =>
    '<rect x="' + (fx * cell).toFixed(2) + '" y="' + (fy * cell).toFixed(2) +
    '" width="' + (7 * cell).toFixed(2) + '" height="' + (7 * cell).toFixed(2) + '" rx="' + (cell * 1.4).toFixed(2) + '" fill="none" stroke="#0b1b33" stroke-width="' + cell.toFixed(2) + '"/>' +
    '<rect x="' + ((fx + 2) * cell).toFixed(2) + '" y="' + ((fy + 2) * cell).toFixed(2) +
    '" width="' + (3 * cell).toFixed(2) + '" height="' + (3 * cell).toFixed(2) + '" rx="' + (cell * 0.6).toFixed(2) + '" fill="#0b1b33"/>';
  return (
    '<svg viewBox="0 0 ' + px + ' ' + px + '" width="100%" height="100%" role="img" aria-label="Demo QR representation">' +
    '<rect width="' + px + '" height="' + px + '" fill="#fff"/>' +
    '<g fill="#0b1b33">' + rects + '</g>' +
    finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7) +
    '</svg>'
  );
}
