'use strict';
/*
 * PayClone — printable receipt builder.
 *
 * Self-contained HTML receipt (no external requests): the app's webfonts
 * (Inter + Clash Display) are embedded as base64 data URIs so downloaded
 * receipts match the app typography even when opened offline from file://
 * or printed. Fonts are read once and cached at module scope.
 */
const fs = require('fs');
const path = require('path');
const { money } = require('./util');

const FONTS_DIR = path.join(__dirname, '..', 'public', 'fonts');

const FONT_MANIFEST = [
  { file: 'Inter-Regular.woff2', family: 'Inter', weight: 400, style: 'normal' },
  { file: 'Inter-Italic.woff2', family: 'Inter', weight: 400, style: 'italic' },
  { file: 'Inter-Medium.woff2', family: 'Inter', weight: 500, style: 'normal' },
  { file: 'Inter-SemiBold.woff2', family: 'Inter', weight: 600, style: 'normal' },
  { file: 'Inter-Bold.woff2', family: 'Inter', weight: 700, style: 'normal' },
  { file: 'ClashDisplay-Semibold.woff2', family: 'Clash Display', weight: 600, style: 'normal' },
  { file: 'ClashDisplay-Bold.woff2', family: 'Clash Display', weight: 700, style: 'normal' }
];

let fontFaceCssCache = null;

function fontFaceCss() {
  if (fontFaceCssCache) return fontFaceCssCache;
  const rules = [];
  for (const f of FONT_MANIFEST) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(FONTS_DIR, f.file));
    } catch (err) {
      continue; // font missing → that face silently falls back to system font
    }
    const b64 = buf.toString('base64');
    rules.push(
      `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2');}`
    );
  }
  fontFaceCssCache = rules.join('\n');
  return fontFaceCssCache;
}

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TYPE_TEXT = {
  transfer: { sent: 'Money Sent', received: 'Money Received' },
  topup: { sent: 'Wallet Top-Up', received: 'Wallet Top-Up' },
  payment_request: { sent: 'Payment Request Paid', received: 'Payment Request Received' }
};

function typeText(tx) {
  const map = TYPE_TEXT[tx.type] || {};
  return map[tx.direction] || tx.typeLabel || 'Transaction';
}

function when(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

/* Printable/downloadable demo receipt (self-contained HTML, no external assets). */
function buildReceiptHtml(tx, viewer) {
  const created = when(tx.createdAt);
  const party =
    tx.direction === 'sent'
      ? { label: 'Recipient', p: tx.counterparty }
      : tx.direction === 'received'
        ? { label: 'Sender', p: tx.counterparty }
        : { label: 'Source', p: null };

  const amountPrefix = tx.direction === 'sent' ? '-' : '+';
  const statusColor =
    tx.status === 'completed' ? '#0a7d3f' : tx.status === 'pending' ? '#b25f00' : '#c02626';

  const FONTS = fontFaceCss();
  const partyCell = party.p
    ? esc(party.p.fullName) + ' (@' + esc(party.p.username) + ') &lt;' + esc(party.p.email) + '&gt;'
    : esc(tx.partyLabel || 'Demo Payment Method');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Receipt ${esc(tx.id)} — PayClone Demo</title>
<style>
${FONTS}
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 16px; background:#f1f4f9; font-family:'Inter',-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size:14px; line-height:1.55; letter-spacing:-.011em; color:#0b1b33; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
  .receipt { max-width: 640px; margin: 0 auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 12px 40px rgba(11,27,51,.12); border:1px solid #e6ebf5; }
  .head { background: linear-gradient(135deg,#003087,#0070e0); color:#fff; padding:24px 28px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .brand { font-family:'Clash Display','Inter',-apple-system,"Segoe UI",sans-serif; font-size:23px; font-weight:600; letter-spacing:-.4px; }
  .brand span { color:#8fc9ff; }
  .demo { background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.35); padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600; letter-spacing:.08em; }
  .amount { text-align:center; padding:28px 24px 8px; }
  .amount .v { font-family:'Clash Display','Inter',-apple-system,"Segoe UI",sans-serif; font-size:42px; font-weight:600; letter-spacing:-1px; font-variant-numeric:tabular-nums; color:${tx.direction === 'sent' ? '#0b1b33' : '#0a7d3f'}; }
  .amount .l { color:#5b6b85; font-size:13px; margin-top:6px; text-transform:uppercase; letter-spacing:.1em; font-weight:600; }
  .badge { display:inline-block; margin-top:12px; padding:5px 14px; border-radius:999px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:${statusColor}; background:${statusColor}1a; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  td { padding:12px 28px; font-size:14px; border-top:1px solid #eef2f8; vertical-align:top; }
  td.k { color:#5b6b85; width:42%; font-weight:500; }
  td.v { font-weight:600; word-break:break-word; font-variant-numeric:tabular-nums; }
  .txid { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size:13px; letter-spacing:-.01em; }
  .foot { padding:18px 28px 26px; color:#7a879d; font-size:12px; line-height:1.6; border-top:1px solid #eef2f8; }
  .cta { text-align:center; margin: 18px auto 0; }
  .cta button { background:#0070e0; color:#fff; border:0; border-radius:10px; padding:11px 22px; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; }
  @media print { body { background:#fff; padding:0; } .receipt { box-shadow:none; border:0; } .cta { display:none; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="head">
      <div class="brand">Pay<span>Clone</span> Receipt</div>
      <div class="demo">DEMO · NO REAL MONEY</div>
    </div>
    <div class="amount">
      <div class="v">${amountPrefix}${esc(money(tx.amount))}</div>
      <div class="l">${esc(typeText(tx))}</div>
      <div class="badge">${esc(tx.status)}</div>
    </div>
    <table>
      <tr><td class="k">Transaction ID</td><td class="v txid">${esc(tx.id)}</td></tr>
      <tr><td class="k">Reference</td><td class="v">${esc(tx.reference)}</td></tr>
      <tr><td class="k">Date</td><td class="v">${esc(created.date)}</td></tr>
      <tr><td class="k">Time</td><td class="v">${esc(created.time)}</td></tr>
      <tr><td class="k">Paid by</td><td class="v">${esc(viewer.fullName)} (@${esc(viewer.username)}) &lt;${esc(viewer.email)}&gt;</td></tr>
      <tr><td class="k">${esc(party.label)}</td><td class="v">${partyCell}</td></tr>
      <tr><td class="k">Amount</td><td class="v">${esc(money(tx.amount))} ${esc(tx.currency)}</td></tr>
      <tr><td class="k">Fee</td><td class="v">${esc(money(tx.fee))} (demo: no fee)</td></tr>
      <tr><td class="k">Status</td><td class="v">${esc(tx.status)}</td></tr>
      <tr><td class="k">Payment type</td><td class="v">${esc(typeText(tx))}${tx.method ? ' · ' + esc(tx.method) : ''}</td></tr>
      <tr><td class="k">Note</td><td class="v">${tx.note ? esc(tx.note) : '—'}</td></tr>
    </table>
    <div class="foot">
      This receipt was generated by an educational PayPal-inspired demo platform. No real money was transferred and
      no real financial institution is involved. Generated ${esc(new Date().toLocaleString('en-US'))}.
      <div class="cta"><button onclick="window.print()">Print receipt</button></div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { buildReceiptHtml };
