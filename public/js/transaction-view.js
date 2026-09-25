/* Shared transaction rendering: rows, detail modal, receipt, success popup. */
import { api, apiRaw } from './api.js';
import { store } from './store.js';
import {
  esc, icon, money, signedMoney, fmtDate, fmtTime, fmtDateTime,
  toast, openModal, statusBadge, partyName, partySub, initials,
  downloadBlob, copyWithToast, setLoading, firstName
} from './ui.js';

export function statusLabel(status) {
  return status === 'completed' ? 'Completed' : status === 'pending' ? 'Pending' : 'Failed';
}

export function txAvatarClass(tx) {
  if (tx.type === 'topup') return 'added';
  return tx.direction === 'sent' ? 'sent' : 'received';
}

export function txAmountHtml(tx) {
  const cls = tx.direction === 'sent' ? 'amount-negative' : 'amount-positive';
  return '<span class="' + cls + '">' + esc(signedMoney(tx.amount, tx.direction)) + '</span>';
}

/* One transaction row (grid layout; collapses to a card on mobile via CSS). */
export function txRowHtml(tx, index) {
  const i = typeof index === 'number' ? index : 0;
  const label = partyName(tx);
  const sub = partySub(tx);
  const when = new Date(tx.createdAt);
  return (
    '<button class="tx-row" data-tx="' + esc(tx.id) + '" style="--i:' + i + '" ' +
      'aria-label="Transaction ' + esc(tx.id) + ', ' + esc(tx.typeLabel) + ', ' + esc(money(tx.amount)) + '">' +
      '<span class="tx-party">' +
        '<span class="tx-avatar ' + txAvatarClass(tx) + '">' + esc(initials(label)) + '</span>' +
        '<span class="grow">' +
          '<span class="tx-name">' + esc(label) + '</span>' +
          '<span class="tx-sub">' + esc(sub) + '</span>' +
        '</span>' +
      '</span>' +
      '<span class="tx-date">' + esc(fmtDate(tx.createdAt)) +
        '<span class="tx-time" style="display:block">' + esc(fmtTime(tx.createdAt)) + '</span>' +
      '</span>' +
      '<span class="tx-type">' + esc(tx.typeLabel) + '<span class="tx-id" style="display:block">' + esc(tx.id) + '</span></span>' +
      '<span class="tx-status">' + statusBadge(tx.status) + '</span>' +
      '<span class="tx-amount">' + txAmountHtml(tx) +
        '<span class="tx-fee">' + esc(money(tx.fee)) + ' fee</span>' +
      '</span>' +
    '</button>'
  );
}

export function txEmptyHtml(title, message, actionLabel, actionAttr) {
  return (
    '<div class="empty">' +
      '<div class="empty-ico">' + icon('receipt', 34) + '</div>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + esc(message) + '</p>' +
      (actionLabel ? '<button class="btn btn-primary" ' + (actionAttr || '') + '>' + esc(actionLabel) + '</button>' : '') +
    '</div>'
  );
}

/* Wire click handlers for every [data-tx] element inside `root`. */
export function bindTxRows(root) {
  root.addEventListener('click', (e) => {
    const row = e.target.closest('[data-tx]');
    if (!row) return;
    openTransactionDetail(row.getAttribute('data-tx'));
  });
}

async function receiptHtml(id) {
  const res = await apiRaw('/api/transactions/' + encodeURIComponent(id) + '/receipt');
  return { blob: await res.blob(), filename: 'receipt-' + id + '.html' };
}

async function downloadReceipt(id, btn) {
  setLoading(btn, true, 'Preparing…');
  try {
    const { blob, filename } = await receiptHtml(id);
    downloadBlob(filename, blob);
    toast('success', 'Receipt downloaded (' + filename + ').');
  } catch (err) {
    toast('error', err.message || 'Could not download the receipt.');
  } finally {
    setLoading(btn, false);
  }
}

async function printReceipt(id, btn) {
  setLoading(btn, true, 'Opening…');
  try {
    const { blob } = await receiptHtml(id);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // popup blocked → fall back to a hidden iframe print
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) { /* ignore */ }
        setTimeout(() => iframe.remove(), 2000);
      };
      iframe.src = url;
    } else {
      setTimeout(() => {
        try { win.focus(); win.print(); } catch (e) { /* user can print manually */ }
      }, 600);
    }
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  } catch (err) {
    toast('error', err.message || 'Could not print the receipt.');
  } finally {
    setLoading(btn, false);
  }
}

/* Detailed transaction modal (also used by "View Transaction"). */
export async function openTransactionDetail(txId, opts) {
  const options = opts || {};
  let tx;
  try {
    const data = await api('/api/transactions/' + encodeURIComponent(txId));
    tx = data.transaction;
  } catch (err) {
    if (err.status === 404 && options.silentMissing) return;
    toast('error', err.message || 'Transaction not found.');
    return;
  }

  const sender = tx.type === 'topup'
    ? 'Demo Payment Method'
    : tx.payer ? tx.payer.fullName + ' (@' + tx.payer.username + ')' : '—';
  const recipient = tx.payee
    ? tx.payee.fullName + ' (@' + tx.payee.username + ')'
    : '—';
  const typeText = tx.typeLabel + (tx.method ? ' · ' + tx.method : '');

  const body =
    '<div class="success-hero">' +
      '<div class="success-check" style="background:' + (tx.direction === 'sent' ? 'var(--accent-soft)' : 'var(--success-soft)') +
        ';color:' + (tx.direction === 'sent' ? 'var(--accent)' : 'var(--success)') + '">' +
        icon(tx.type === 'topup' ? 'topup' : tx.direction === 'sent' ? 'send' : 'receive', 34) +
      '</div>' +
      '<div class="sh-amount">' + esc(signedMoney(tx.amount, tx.direction)) + '</div>' +
      '<div style="margin-top:8px">' + statusBadge(tx.status) + '</div>' +
      '<div class="sh-msg">' + esc(tx.typeLabel) + '</div>' +
    '</div>' +
    '<div class="detail-list mt-16">' +
      row('Transaction ID', '<span class="mono">' + esc(tx.id) + '</span>') +
      row('Date', esc(fmtDate(tx.createdAt))) +
      row('Time', esc(fmtTime(tx.createdAt))) +
      row('Sender', esc(sender)) +
      row('Recipient', esc(recipient)) +
      row('Amount', esc(money(tx.amount))) +
      row('Currency', esc(tx.currency)) +
      row('Status', esc(statusLabel(tx.status))) +
      row('Note', tx.note ? esc(tx.note) : '<span class="muted">—</span>') +
      row('Payment type', esc(typeText)) +
      row('Fee', esc(money(tx.fee)) + ' <span class="muted">(demo: no fee)</span>') +
      row('Reference', '<span class="mono">' + esc(tx.reference) + '</span>') +
      (tx.paidAt ? row('Paid at', esc(fmtDateTime(tx.paidAt))) : '') +
    '</div>' +
    (tx.type === 'topup'
      ? '<div class="demo-strip-inline mt-16">' + icon('info', 15) + ' Demo top-up — no real money was charged to any card or bank account.</div>'
      : '<div class="demo-strip-inline mt-16">' + icon('info', 15) + ' Demo transfer — no real money was moved.</div>');

  function row(k, v) {
    return '<div class="detail-row"><span class="dr-key">' + k + '</span><span class="dr-val">' + v + '</span></div>';
  }

  const modal = openModal({
    title: 'Transaction Details',
    titleIcon: 'receipt',
    size: 'modal-lg',
    body,
    onClose: options.onClose,
    actions: [
      {
        label: 'Download Receipt',
        variant: 'btn-outline',
        icon: 'download',
        onClick: (m) => { downloadReceipt(tx.id, m.actions.querySelector('.btn')); return false; }
      },
      {
        label: 'Print',
        variant: 'btn-ghost',
        icon: 'printer',
        onClick: (m) => { printReceipt(tx.id, m.actions.querySelectorAll('.btn')[1]); return false; }
      },
      { label: 'Close', variant: 'btn-primary', onClick: (m) => m.close() }
    ]
  });
  return modal;
}

/* Payment success confirmation popup (required after every completed payment). */
export function openPaymentSuccess({ tx, headline, recipientLabel, onViewTransaction, onDone }) {
  const who = recipientLabel || (tx.counterparty ? '@' + tx.counterparty.username : 'recipient');
  const body =
    '<div class="success-hero">' +
      '<div class="success-check">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="m5 13 4.5 4.5L19 7" stroke-dasharray="40" stroke-dashoffset="0"/></svg>' +
      '</div>' +
      '<h3>Payment Successful</h3>' +
      '<p class="sh-msg">' + esc(headline || ('You sent ' + money(tx.amount) + ' to ' + who + '.')) + '</p>' +
    '</div>' +
    '<div class="detail-list mt-16">' +
      '<div class="detail-row"><span class="dr-key">Recipient</span><span class="dr-val">' + esc(who) + '</span></div>' +
      '<div class="detail-row"><span class="dr-key">Amount</span><span class="dr-val">' + esc(money(tx.amount)) + '</span></div>' +
      '<div class="detail-row"><span class="dr-key">Transaction ID</span><span class="dr-val mono">' + esc(tx.id) + '</span></div>' +
      '<div class="detail-row"><span class="dr-key">Date / Time</span><span class="dr-val">' + esc(fmtDateTime(tx.createdAt)) + '</span></div>' +
      '<div class="detail-row"><span class="dr-key">Status</span><span class="dr-val">' + statusBadge(tx.status) + '</span></div>' +
    '</div>';

  return openModal({
    title: 'Payment Successful',
    titleIcon: 'checkCircle',
    dismissible: true,
    body,
    actions: [
      {
        label: 'View Transaction',
        variant: 'btn-outline',
        icon: 'receipt',
        onClick: async (m) => {
          m.close();
          if (onViewTransaction) onViewTransaction(tx);
          else {
            if (location.hash === '#/transactions') await openTransactionDetail(tx.id);
            else location.hash = '/transactions/' + tx.id;
          }
        }
      },
      {
        label: 'Done',
        variant: 'btn-primary',
        onClick: (m) => {
          m.close();
          if (onDone) onDone(tx);
        }
      }
    ]
  });
}
