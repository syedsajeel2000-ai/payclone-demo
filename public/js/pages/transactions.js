/* Transaction history: search + filters + sorting + details. */
import { api } from '../api.js';
import { icon, esc, money, qs, qsa, toast, debounce, fmtDate } from '../ui.js';
import { txRowHtml, txEmptyHtml, bindTxRows, openTransactionDetail } from '../transaction-view.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'received', label: 'Received' },
  { id: 'added', label: 'Added Funds' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' }
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'highest', label: 'Highest amount' },
  { id: 'lowest', label: 'Lowest amount' }
];

export async function renderTransactions(container, params) {
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Transaction History</h1>
        <p class="ph-sub">Search, filter and sort every demo transaction. Click any row for full details and a downloadable receipt.</p>
      </div>
      <div class="ph-actions">
        <span class="pill">${icon('trendingUp', 15)} Sent <strong id="tot-sent">$0.00</strong></span>
        <span class="pill">${icon('trendingDown', 15)} Received <strong id="tot-received">$0.00</strong></span>
        <button class="btn btn-outline btn-sm" data-nav="/send">${icon('send', 15)} Send Money</button>
      </div>
    </div>

    <div class="card card-pad-0 reveal">
      <div style="padding:18px clamp(14px,2vw,20px) 0">
        <div class="toolbar">
          <div class="toolbar-row">
            <div class="search-wrap">
              <input class="input" id="tx-search" type="search"
                     placeholder="Search by name, email, username or transaction ID…"
                     aria-label="Search transactions">
              ${icon('search', 18)}
            </div>
            <div class="sort-wrap">
              <span class="sort-ico">${icon('sort', 17)}</span>
              <select class="select" id="tx-sort" aria-label="Sort transactions">
                ${SORTS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="chip-row" id="tx-filters" role="group" aria-label="Filter transactions">
            ${FILTERS.map(
              (f) =>
                `<button class="chip" data-filter="${f.id}" aria-pressed="${f.id === 'all'}">${f.label}</button>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="tx-head" aria-hidden="true">
        <span>Transaction</span><span>Date</span><span>Type</span><span>Status</span><span style="text-align:right">Amount</span>
      </div>
      <div id="tx-list"><div class="empty"><span class="spinner" style="border-color:rgba(0,112,224,.25);border-top-color:var(--accent);margin:0 auto"></span></div></div>
      <div id="tx-meta" style="padding:14px 20px;border-top:1px solid var(--border);font-size:.82rem;color:var(--muted);display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"></div>
    </div>

    <div class="demo-strip-inline mt-16">${icon('info', 15)} All amounts are demo funds — no real money is transferred.</div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });

  let state = { search: '', filter: 'all', sort: 'newest' };
  const listWrap = qs('#tx-list', container);
  const metaWrap = qs('#tx-meta', container);
  const searchInput = qs('#tx-search', container);
  const sortSelect = qs('#tx-sort', container);
  bindTxRows(listWrap);

  async function load() {
    listWrap.innerHTML = '<div class="empty"><span class="spinner" style="border-color:rgba(0,112,224,.25);border-top-color:var(--accent);margin:0 auto"></span></div>';
    try {
      const q = new URLSearchParams({
        search: state.search,
        filter: state.filter,
        sort: state.sort
      });
      const data = await api('/api/transactions?' + q.toString());
      qs('#tot-sent', container).textContent = money(data.totals.sent);
      qs('#tot-received', container).textContent = money(data.totals.received);

      if (!data.items.length) {
        const filtered = state.search || state.filter !== 'all';
        listWrap.innerHTML = filtered
          ? txEmptyHtml('No matching transactions', 'Try a different search term or clear your filters.', 'Clear filters', 'id="clear-filters"')
          : txEmptyHtml('No transactions yet', 'Add demo funds or send your first payment to build your history.', 'Add Funds', 'data-nav="/wallet"');
        const clearBtn = qs('#clear-filters', listWrap);
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            state.search = '';
            state.filter = 'all';
            searchInput.value = '';
            qsa('[data-filter]', container).forEach((c) => c.setAttribute('aria-pressed', String(c.getAttribute('data-filter') === 'all')));
            load();
          });
        }
        qsa('[data-nav]', listWrap).forEach((el) => {
          el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
        });
        metaWrap.innerHTML = '<span>0 transactions shown</span>';
        return;
      }

      listWrap.innerHTML = '<div class="tx-list">' + data.items.map((t, i) => txRowHtml(t, i)).join('') + '</div>';
      metaWrap.innerHTML =
        '<span>' + data.items.length + ' of ' + data.totals.count + ' transaction' + (data.totals.count === 1 ? '' : 's') + ' shown</span>' +
        '<span>Click a row to view details &amp; download a receipt</span>';
    } catch (err) {
      if (err.status === 401) return;
      listWrap.innerHTML = txEmptyHtml('Could not load transactions', err.message || 'Please try again.', 'Try again', 'id="retry-load"');
      const retry = qs('#retry-load', listWrap);
      if (retry) retry.addEventListener('click', load);
    }
  }

  const runSearch = debounce(() => {
    state.search = searchInput.value.trim();
    load();
  }, 280);

  searchInput.addEventListener('input', runSearch);
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    load();
  });
  qsa('[data-filter]', container).forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.getAttribute('data-filter');
      qsa('[data-filter]', container).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      load();
    });
  });

  await load();

  /* deep link: #/transactions/TX-XXXX opens the detail modal */
  if (params && params.id) {
    openTransactionDetail(params.id.toUpperCase());
  }
}
