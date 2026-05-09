/* ================================================================
   PNL Journal — script.js  (Multi-Account Edition v3)
   ================================================================ */

// ── Storage Keys ──────────────────────────────────────────────────
const STORAGE_KEY_V3 = 'pnl_journal_v3';
const STORAGE_KEY_V2 = 'pnl_journal_v2'; // legacy key for migration

// ── Data Migration from v2 ────────────────────────────────────────
function migrateFromV2() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!old) return null;

    const id = String(Date.now());
    console.info('[PNL Journal] Migrating v2 data → "My First Account"');
    return {
      accounts: [{
        id,
        name: 'My First Account',
        baseline: parseFloat(old.startingCapital) || 10000,
        logs: old.days || {},
        createdAt: new Date().toISOString(),
      }],
      currentAccountId: id,
      theme: old.theme || 'light',
    };
  } catch (e) {
    return null;
  }
}

// ── Load / Save State ─────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V3);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.accounts)) return parsed;
    }
  } catch (e) {}

  const migrated = migrateFromV2();
  if (migrated) return migrated;

  return { accounts: [], currentAccountId: null, theme: 'light' };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(state));
}

let state = loadState();

// ── Account Accessors ─────────────────────────────────────────────
function getCurrentAccount() {
  return state.accounts.find(a => a.id === state.currentAccountId) || null;
}

// ── View State ────────────────────────────────────────────────────
const today    = new Date();
let viewYear   = today.getFullYear();
let viewMonth  = today.getMonth(); // 0-based
let activeDate = null;

// ── Helpers ───────────────────────────────────────────────────────
function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtMoney(val, always = false) {
  if (val === 0 && !always) return '$0.00';
  const abs = Math.abs(val);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return val < 0 ? '-' + str : (val > 0 ? '+' + str : str);
}

function fmtMoneyPlain(val) {
  return '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDayData(key) {
  const acc = getCurrentAccount();
  if (!acc) return null;
  return acc.logs[key] || null;
}

function getMonthKeys(year, month) {
  const keys = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) keys.push(dateKey(year, month, d));
  return keys;
}

function getAllTimeStats() {
  const acc = getCurrentAccount();
  if (!acc) return { totalPnl: 0, wins: 0, losses: 0, trades: 0 };

  let totalPnl = 0, wins = 0, losses = 0, trades = 0;
  for (const key in acc.logs) {
    const d = acc.logs[key];
    if (d && d.pnl !== undefined && d.pnl !== null && d.pnl !== '') {
      const p = parseFloat(d.pnl) || 0;
      totalPnl += p;
      if (p > 0) wins++;
      else if (p < 0) losses++;
      trades += parseInt(d.trades) || 0;
    }
  }
  return { totalPnl, wins, losses, trades };
}

function getMonthStats(year, month) {
  const keys = getMonthKeys(year, month);
  let total = 0, wins = 0, losses = 0, trades = 0, tradedDays = 0;
  let bestDay = -Infinity, worstDay = Infinity;
  let bestKey = null, worstKey = null;

  for (const k of keys) {
    const d = getDayData(k);
    if (d && d.pnl !== undefined && d.pnl !== null && d.pnl !== '') {
      const p = parseFloat(d.pnl) || 0;
      total += p;
      tradedDays++;
      trades += parseInt(d.trades) || 0;
      if (p > 0) wins++;
      else if (p < 0) losses++;
      if (p > bestDay)  { bestDay  = p; bestKey  = k; }
      if (p < worstDay) { worstDay = p; worstKey = k; }
    }
  }

  return {
    total, wins, losses, trades, tradedDays,
    bestDay:  bestKey  ? bestDay  : 0,
    worstDay: worstKey ? worstDay : 0,
  };
}

function getStreak() {
  const acc = getCurrentAccount();
  if (!acc) return { streak: 0, type: null };

  const allKeys = Object.keys(acc.logs).sort().reverse();
  let streak = 0, type = null;

  for (const k of allKeys) {
    const d = acc.logs[k];
    if (!d || d.pnl === undefined || d.pnl === null || d.pnl === '') break;
    const p = parseFloat(d.pnl) || 0;
    if (type === null) {
      type = p >= 0 ? 'win' : 'loss';
      streak = 1;
    } else if ((type === 'win' && p >= 0) || (type === 'loss' && p < 0)) {
      streak++;
    } else {
      break;
    }
  }

  return { streak, type };
}

// ── All-Time Stats (comprehensive) ───────────────────────────────
function calculateAllTimeStats() {
  const acc = getCurrentAccount();
  if (!acc) return null;

  // Sort all logged entries chronologically
  const entries = Object.entries(acc.logs)
    .filter(([, d]) => d && d.pnl !== undefined && d.pnl !== null && d.pnl !== '')
    .sort(([a], [b]) => a.localeCompare(b));

  const baseline = parseFloat(acc.baseline) || 0;

  if (entries.length === 0) {
    return {
      grossPnl: 0, totalDays: 0, totalTrades: 0,
      winDays: 0, lossDays: 0, winRate: null,
      bestDay: null, bestKey: null,
      worstDay: null, worstKey: null,
      avgPerDay: null, streak: 0, streakType: null,
      balanceSeries: [{ key: null, balance: baseline, pnl: 0 }],
    };
  }

  let grossPnl = 0, totalTrades = 0, winDays = 0, lossDays = 0;
  let bestDay = -Infinity, worstDay = Infinity;
  let bestKey = null, worstKey = null;
  const balanceSeries = [];
  let running = baseline;

  for (const [key, d] of entries) {
    const p = parseFloat(d.pnl) || 0;
    grossPnl   += p;
    totalTrades += parseInt(d.trades) || 0;
    if (p > 0)       winDays++;
    else if (p < 0)  lossDays++;
    if (p > bestDay)  { bestDay  = p; bestKey  = key; }
    if (p < worstDay) { worstDay = p; worstKey = key; }
    running += p;
    balanceSeries.push({ key, balance: parseFloat(running.toFixed(2)), pnl: p });
  }

  const totalDays = entries.length;
  const winRate   = totalDays > 0 ? Math.round((winDays / totalDays) * 100) : null;
  const avgPerDay = totalDays > 0 ? grossPnl / totalDays : null;

  // Streak: walk backwards from most recent
  let streak = 0, streakType = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const p = parseFloat(entries[i][1].pnl) || 0;
    if (streakType === null) {
      streakType = p >= 0 ? 'win' : 'loss';
      streak = 1;
    } else if ((streakType === 'win' && p >= 0) || (streakType === 'loss' && p < 0)) {
      streak++;
    } else {
      break;
    }
  }

  return {
    grossPnl, totalDays, totalTrades,
    winDays, lossDays, winRate,
    bestDay:  bestKey  ? bestDay  : null,
    bestKey,
    worstDay: worstKey ? worstDay : null,
    worstKey,
    avgPerDay, streak, streakType,
    balanceSeries,
  };
}

// ── App Shell ─────────────────────────────────────────────────────
function renderApp() {
  const hasAccounts  = state.accounts.length > 0 && state.currentAccountId;
  const emptyScreen  = document.getElementById('emptyStateScreen');
  const appContent   = document.getElementById('appContent');

  if (!hasAccounts) {
    emptyScreen.style.display = 'flex';
    appContent.style.display  = 'none';
  } else {
    emptyScreen.style.display = 'none';
    appContent.style.display  = 'block';
    syncCapitalInput();
    renderAccountSwitcher();
    renderCalendar();
    renderStats();
    renderOverview();
    updateNavState();
  }
}

function syncCapitalInput() {
  const acc = getCurrentAccount();
  if (acc) document.getElementById('capitalInput').value = acc.baseline ?? 10000;
}

// ── Account Switcher Render ───────────────────────────────────────
function renderAccountSwitcher() {
  const acc = getCurrentAccount();
  document.getElementById('accountBtnName').textContent = acc ? acc.name : 'Select Account';

  const list = document.getElementById('accountList');
  list.innerHTML = '';

  if (state.accounts.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:12px 14px; font-size:0.78rem; color:var(--text-muted); text-align:center;';
    empty.textContent = 'No accounts yet';
    list.appendChild(empty);
    return;
  }

  state.accounts.forEach(account => {
    const item = document.createElement('div');
    item.className = 'account-item' + (account.id === state.currentAccountId ? ' active' : '');

    const nameEl = document.createElement('span');
    nameEl.className   = 'account-item-name';
    nameEl.textContent = account.name;

    const actions = document.createElement('div');
    actions.className = 'account-item-actions';

    if (account.id === state.currentAccountId) {
      const check = document.createElement('span');
      check.className = 'account-check';
      check.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      actions.appendChild(check);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'account-delete-btn';
    delBtn.title     = 'Delete account';
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
    </svg>`;
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteAccount(account.id, account.name);
    });
    actions.appendChild(delBtn);

    item.appendChild(nameEl);
    item.appendChild(actions);
    item.addEventListener('click', () => {
      if (account.id !== state.currentAccountId) switchAccount(account.id);
      closeAccountDropdown();
    });

    list.appendChild(item);
  });
}

// ── Account Switch with Fade ──────────────────────────────────────
function switchAccount(id) {
  state.currentAccountId = id;
  saveState();

  const content = document.getElementById('appContent');
  content.classList.add('fade-out');

  setTimeout(() => {
    syncCapitalInput();
    renderAccountSwitcher();
    renderCalendar();
    renderStats();
    renderOverview();
    content.classList.remove('fade-out');
  }, 180);
}

// ── Delete Account ────────────────────────────────────────────────
function deleteAccount(id, name) {
  const logCount = Object.keys(
    (state.accounts.find(a => a.id === id) || {}).logs || {}
  ).length;

  const warning = logCount > 0
    ? `\n\nThis account has ${logCount} trading day${logCount !== 1 ? 's' : ''} logged — all data will be lost.`
    : '';

  if (!confirm(`Delete "${name}"?${warning}\n\nThis cannot be undone.`)) return;

  state.accounts = state.accounts.filter(a => a.id !== id);

  if (state.currentAccountId === id) {
    state.currentAccountId = state.accounts.length > 0 ? state.accounts[0].id : null;
  }

  saveState();
  renderApp();
  showToast(`"${name}" deleted`);
}

// ── Account Dropdown Toggle ───────────────────────────────────────
let dropdownOpen = false;

function openAccountDropdown() {
  renderAccountSwitcher();
  document.getElementById('accountDropdown').classList.add('open');
  dropdownOpen = true;
}

function closeAccountDropdown() {
  document.getElementById('accountDropdown').classList.remove('open');
  dropdownOpen = false;
}

document.getElementById('accountBtn').addEventListener('click', e => {
  e.stopPropagation();
  dropdownOpen ? closeAccountDropdown() : openAccountDropdown();
});

document.addEventListener('click', () => {
  if (dropdownOpen) closeAccountDropdown();
});

document.getElementById('accountDropdown').addEventListener('click', e => e.stopPropagation());

// ── Create Account Modal ──────────────────────────────────────────
function openCreateAccountModal(isFirst = false) {
  closeAccountDropdown();
  document.getElementById('newAccName').value     = '';
  document.getElementById('newAccBaseline').value = '10000';
  document.getElementById('newAccName').style.borderColor = '';
  document.getElementById('createAccTitle').textContent =
    isFirst ? 'Create Your First Account' : 'New Trading Account';
  document.getElementById('createAccOverlay').classList.add('active');
  setTimeout(() => document.getElementById('newAccName').focus(), 220);
}

function closeCreateAccountModal() {
  document.getElementById('createAccOverlay').classList.remove('active');
}

function submitCreateAccount() {
  const name     = document.getElementById('newAccName').value.trim();
  const baseline = parseFloat(document.getElementById('newAccBaseline').value) || 10000;

  if (!name) {
    const input = document.getElementById('newAccName');
    input.focus();
    input.style.borderColor = 'var(--red-text)';
    input.addEventListener('input', () => { input.style.borderColor = ''; }, { once: true });
    return;
  }

  const id = String(Date.now());
  state.accounts.push({ id, name, baseline, logs: {}, createdAt: new Date().toISOString() });
  state.currentAccountId = id;
  saveState();
  closeCreateAccountModal();
  renderApp();
  showToast(`"${name}" created ✓`);
}

document.getElementById('newAccountBtn').addEventListener('click', () => openCreateAccountModal(false));
document.getElementById('createFirstAccBtn').addEventListener('click', () => openCreateAccountModal(true));
document.getElementById('createAccOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCreateAccountModal();
});
document.getElementById('createAccClose').addEventListener('click', closeCreateAccountModal);
document.getElementById('createAccSaveBtn').addEventListener('click', submitCreateAccount);
document.getElementById('createAccCancelBtn').addEventListener('click', closeCreateAccountModal);
document.getElementById('newAccName').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitCreateAccount();
});

// ── Nav State Update ──────────────────────────────────────────────
function updateNavState() {
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Today button: dim when already on current month
  const todayBtn = document.getElementById('todayBtn');
  if (todayBtn) {
    todayBtn.classList.toggle('is-current', isCurrentMonth);
  }

  // Offset badge
  const offsetEl = document.getElementById('calNavOffset');
  if (!offsetEl) return;

  if (isCurrentMonth) {
    offsetEl.textContent = '';
    return;
  }

  const diffMonths = (viewYear - today.getFullYear()) * 12 + (viewMonth - today.getMonth());
  const abs = Math.abs(diffMonths);

  if (Math.abs(diffMonths) >= 12 && diffMonths % 12 === 0) {
    const yrs = Math.abs(diffMonths) / 12;
    offsetEl.textContent = `${yrs} year${yrs !== 1 ? 's' : ''} ${diffMonths < 0 ? 'ago' : 'ahead'}`;
  } else {
    offsetEl.textContent = `${abs} month${abs !== 1 ? 's' : ''} ${diffMonths < 0 ? 'ago' : 'ahead'}`;
  }
}

// ── Calendar Render ───────────────────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('calNavTitle').textContent  = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  document.getElementById('winRateMonth').textContent = MONTH_NAMES[viewMonth].toLowerCase();

  // Column headers
  DAY_NAMES.forEach(name => {
    const el = document.createElement('div');
    el.className   = 'day-header';
    el.textContent = name;
    grid.appendChild(el);
  });
  const weekHeader = document.createElement('div');
  weekHeader.className   = 'week-header';
  weekHeader.textContent = 'Week';
  grid.appendChild(weekHeader);

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const weekRows = [];
  let currentRow = [];

  for (let i = 0; i < firstDow; i++) currentRow.push({ empty: true });

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday  = d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isFuture = new Date(viewYear, viewMonth, d) > today;
    const key      = dateKey(viewYear, viewMonth, d);
    const data     = getDayData(key);

    currentRow.push({ d, isToday, isFuture, key, data });

    const dow = new Date(viewYear, viewMonth, d).getDay();
    if (dow === 6 || d === daysInMonth) {
      if (d === daysInMonth && dow !== 6) {
        for (let i = dow + 1; i <= 6; i++) currentRow.push({ empty: true, after: true });
      }
      weekRows.push([...currentRow]);
      currentRow = [];
    }
  }

  weekRows.forEach((row, weekIndex) => {
    let weekPnl = 0, hasData = false;

    row.forEach(cell => {
      const el = document.createElement('div');

      if (cell.empty) {
        el.className = 'calendar-day empty';
        grid.appendChild(el);
        return;
      }

      el.className = 'calendar-day';
      if (cell.isToday)  el.classList.add('today');
      if (cell.isFuture) el.classList.add('future');

      if (cell.data && cell.data.pnl !== undefined && cell.data.pnl !== '' && cell.data.pnl !== null) {
        const p = parseFloat(cell.data.pnl) || 0;
        if (p > 0) el.classList.add('positive');
        else if (p < 0) el.classList.add('negative');
        weekPnl += p;
        hasData = true;
      }

      const numEl = document.createElement('div');
      numEl.className   = 'day-num';
      numEl.textContent = cell.d;
      el.appendChild(numEl);

      if (cell.data && cell.data.notes && cell.data.notes.trim()) {
        const dot = document.createElement('div');
        dot.className = 'day-note-dot';
        el.appendChild(dot);
      }

      if (cell.data && cell.data.pnl !== undefined && cell.data.pnl !== '' && cell.data.pnl !== null) {
        const p = parseFloat(cell.data.pnl) || 0;

        const pnlEl = document.createElement('div');
        pnlEl.className   = 'day-pnl ' + (p >= 0 ? 'pos' : 'neg');
        pnlEl.textContent = fmtMoney(p);
        el.appendChild(pnlEl);

        if (cell.data.trades) {
          const trEl = document.createElement('div');
          trEl.className   = 'day-trades';
          trEl.textContent = `${cell.data.trades} trade${parseInt(cell.data.trades) !== 1 ? 's' : ''}`;
          el.appendChild(trEl);
        }
      }

      el.addEventListener('click', () => openModal(cell.key, cell.d));
      grid.appendChild(el);
    });

    // Week total cell
    const wtEl    = document.createElement('div');
    wtEl.className = 'week-total-cell';
    const wtLabel  = document.createElement('div');
    wtLabel.className   = 'week-total-label';
    wtLabel.textContent = `Wk ${weekIndex + 1}`;
    const wtVal   = document.createElement('div');
    const sign    = hasData ? (weekPnl > 0 ? 'pos' : weekPnl < 0 ? 'neg' : 'zero') : 'zero';
    wtVal.className   = `week-total-val ${sign}`;
    wtVal.textContent = hasData ? fmtMoney(weekPnl) : '—';
    wtEl.appendChild(wtLabel);
    wtEl.appendChild(wtVal);
    grid.appendChild(wtEl);
  });
}

// ── Stats Render ─────────────────────────────────────────────────
function renderStats() {
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const acc     = getCurrentAccount();
  const capital = acc ? parseFloat(acc.baseline) || 0 : 0;
  const allTime = getAllTimeStats();
  const monthly = getMonthStats(viewYear, viewMonth);

  // Account balance
  const balance = capital + allTime.totalPnl;
  const balEl   = document.getElementById('balanceVal');
  balEl.textContent = fmtMoneyPlain(balance);
  balEl.className   = 'stat-value ' + (balance >= capital ? 'positive' : 'negative');

  // Monthly PNL
  const mPnlEl = document.getElementById('monthPnlVal');
  mPnlEl.textContent = fmtMoney(monthly.total, true);
  mPnlEl.className   = 'stat-value ' + (monthly.total > 0 ? 'positive' : monthly.total < 0 ? 'negative' : '');
  document.getElementById('monthPnlMeta').textContent =
    monthly.tradedDays > 0
      ? `${monthly.tradedDays} trading day${monthly.tradedDays !== 1 ? 's' : ''} logged`
      : 'No trades this month';

  // All-time PNL
  const atEl = document.getElementById('allTimePnlVal');
  atEl.textContent = fmtMoney(allTime.totalPnl, true);
  atEl.className   = 'stat-value ' + (allTime.totalPnl > 0 ? 'positive' : allTime.totalPnl < 0 ? 'negative' : '');
  document.getElementById('allTimeMeta').textContent =
    allTime.trades > 0
      ? `${allTime.trades} total trade${allTime.trades !== 1 ? 's' : ''}`
      : 'Across all months';

  // Win rate
  const totalDays = monthly.wins + monthly.losses;
  const winRate   = totalDays > 0 ? Math.round((monthly.wins / totalDays) * 100) : null;

  const wnEl = document.getElementById('winRateNum');
  const wbEl = document.getElementById('winRateBreakdown');
  if (winRate !== null) {
    wnEl.textContent = winRate + '%';
    wbEl.textContent = `${monthly.wins}W / ${monthly.losses}L this month`;
    document.getElementById('winRateFill').style.width = winRate + '%';
  } else {
    wnEl.textContent = '—';
    wbEl.textContent = 'No trades logged';
    document.getElementById('winRateFill').style.width = '0%';
  }

  document.getElementById('winDaysVal').textContent     = monthly.wins;
  document.getElementById('lossDaysVal').textContent    = monthly.losses;
  document.getElementById('totalTradesVal').textContent = monthly.trades;

  // Streak
  const { streak, type } = getStreak();
  const streakEl = document.getElementById('streakVal');
  if (streak > 0 && type) {
    streakEl.innerHTML = `<span class="streak-badge ${type === 'win' ? 'win' : 'loss'}">${streak} ${type === 'win' ? '🟢' : '🔴'} ${type}</span>`;
  } else {
    streakEl.textContent = '—';
  }

  // Month summary table
  const summaryData = [
    ['Month',        MONTH_NAMES[viewMonth] + ' ' + viewYear,                            ''],
    ['Trading Days', monthly.tradedDays.toString(),                                       ''],
    ['Gross PNL',    fmtMoney(monthly.total, true),   monthly.total >= 0 ? 'pos' : 'neg'],
    ['Best Day',     monthly.tradedDays > 0 ? fmtMoney(monthly.bestDay, true)  : '—',    'pos'],
    ['Worst Day',    monthly.tradedDays > 0 ? fmtMoney(monthly.worstDay, true) : '—',    'neg'],
    ['Avg / Day',    monthly.tradedDays > 0
      ? fmtMoney(monthly.total / monthly.tradedDays, true) : '—',
      monthly.total >= 0 ? 'pos' : 'neg'],
    ['Total Trades', monthly.trades.toString(),                                           ''],
    ['Win Rate',     winRate !== null ? winRate + '%' : '—',                             ''],
  ];

  document.getElementById('monthSummaryList').innerHTML = summaryData
    .map(([k, v, cls]) => `
      <div class="summary-row">
        <span class="summary-key">${k}</span>
        <span class="summary-val ${cls}">${v}</span>
      </div>`)
    .join('');

  renderChart(capital);
}

// ── Chart ─────────────────────────────────────────────────────────
let chartInstance = null;

function renderChart(capital) {
  const keys     = getMonthKeys(viewYear, viewMonth);
  const labels   = [];
  const balances = [];
  let running    = capital;

  for (const k of keys) {
    const day = parseInt(k.split('-')[2]);
    const d   = getDayData(k);
    if (d && d.pnl !== undefined && d.pnl !== '' && d.pnl !== null) {
      running += parseFloat(d.pnl) || 0;
      labels.push(day);
      balances.push(parseFloat(running.toFixed(2)));
    }
  }

  const canvas    = document.getElementById('balanceChart');
  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#5C5955' : '#A09D97';
  const lineColor = isDark ? '#4DC87A' : '#1A7A44';
  const fillColor = isDark ? 'rgba(77,200,122,0.08)' : 'rgba(26,122,68,0.07)';

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (labels.length === 0) {
    chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['—'],
        datasets: [{ data: [capital], borderColor: gridColor, pointRadius: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    return;
  }

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Balance',
        data: balances,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: lineColor,
        pointBorderColor: 'transparent',
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1E1C1A' : '#fff',
          borderColor:     isDark ? '#2E2B27' : '#E8E5DF',
          borderWidth: 1,
          titleColor:  isDark ? '#F0EDE8' : '#1A1916',
          bodyColor:   isDark ? '#908D87' : '#6B6860',
          padding: 10,
          callbacks: {
            title: ctx => `Day ${ctx[0].label}`,
            label: ctx => ' Balance: ' + fmtMoneyPlain(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor, drawBorder: false },
          ticks: { color: textColor, font: { family: "'DM Mono', monospace", size: 10 }, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: textColor,
            font:  { family: "'DM Mono', monospace", size: 10 },
            maxTicksLimit: 5,
            callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v),
          },
        },
      },
    },
  });
}

// ── Overview Panel ────────────────────────────────────────────────
let allTimeChartInstance = null;

function renderOverview() {
  const acc = getCurrentAccount();
  if (!acc) return;

  const stats    = calculateAllTimeStats();
  const capital  = parseFloat(acc.baseline) || 0;
  const balance  = capital + (stats ? stats.grossPnl : 0);
  const metricsEl = document.getElementById('overviewMetrics');

  if (!stats || stats.totalDays === 0) {
    metricsEl.innerHTML =
      `<div class="ov-empty">No trading data yet for <strong>${acc.name}</strong>.<br>
       Click any day on the calendar below to log your first entry.</div>`;
    renderAllTimeChart([], capital);
    return;
  }

  // ── Format date label helper ──────────────────────────────────
  function fmtDateLabel(key) {
    if (!key) return '—';
    const [y, m, d] = key.split('-');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label = `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}`;
    return parseInt(y) !== today.getFullYear() ? `${label} '${String(y).slice(-2)}` : label;
  }

  // ── Card definitions ──────────────────────────────────────────
  const streakLabel = stats.streak > 0 && stats.streakType
    ? `${stats.streak} ${stats.streakType === 'win' ? 'W' : 'L'}`
    : '—';
  const streakSub = stats.streakType
    ? `${stats.streakType === 'win' ? 'winning' : 'losing'} streak`
    : 'no data yet';

  const cards = [
    {
      label:    'Gross PNL',
      value:    fmtMoney(stats.grossPnl, true),
      cls:      stats.grossPnl >= 0 ? 'pos' : 'neg',
      sub:      `from ${fmtMoneyPlain(capital)} baseline`,
      featured: true,
    },
    {
      label:    'Account Balance',
      value:    fmtMoneyPlain(balance),
      cls:      balance >= capital ? 'pos' : 'neg',
      sub:      `${balance >= capital ? '+' : ''}${((stats.grossPnl / capital) * 100).toFixed(1)}% return`,
      featured: true,
    },
    {
      label:    'Win Rate',
      value:    stats.winRate !== null ? `${stats.winRate}%` : '—',
      cls:      stats.winRate !== null ? (stats.winRate >= 50 ? 'pos' : 'neg') : '',
      sub:      `${stats.winDays}W / ${stats.lossDays}L days`,
      featured: true,
    },
    {
      label:    'Current Streak',
      value:    streakLabel,
      cls:      stats.streakType === 'win' ? 'pos' : stats.streakType === 'loss' ? 'neg' : '',
      sub:      streakSub,
      featured: true,
    },
    {
      label: 'Best Day',
      value: stats.bestDay !== null ? fmtMoney(stats.bestDay, true) : '—',
      cls:   'pos',
      sub:   stats.bestKey ? fmtDateLabel(stats.bestKey) : '',
    },
    {
      label: 'Worst Day',
      value: stats.worstDay !== null ? fmtMoney(stats.worstDay, true) : '—',
      cls:   'neg',
      sub:   stats.worstKey ? fmtDateLabel(stats.worstKey) : '',
    },
    {
      label: 'Avg PNL / Day',
      value: stats.avgPerDay !== null ? fmtMoney(stats.avgPerDay, true) : '—',
      cls:   stats.avgPerDay !== null ? (stats.avgPerDay >= 0 ? 'pos' : 'neg') : '',
      sub:   'across all trading days',
    },
    {
      label: 'Trading Days',
      value: String(stats.totalDays),
      cls:   '',
      sub:   `${stats.winDays} wins · ${stats.lossDays} losses`,
    },
    {
      label: 'Total Trades',
      value: String(stats.totalTrades),
      cls:   '',
      sub:   stats.totalDays > 0
        ? `~${(stats.totalTrades / stats.totalDays).toFixed(1)} per day`
        : '',
    },
  ];

  metricsEl.innerHTML = cards
    .map((c, i) => `
      <div class="ov-card${c.featured ? ' featured' : ''}${i === 0 ? '" data-action="pnl-breakdown' : ''}">
        ${i === 0 ? `<svg class="ov-drill-hint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><polyline points="8 3 3 3 3 21 21 21 21 16"/></svg>` : ''}
        <div class="ov-label">${c.label}</div>
        <div class="ov-value ${c.cls}">${c.value}</div>
        ${c.sub ? `<div class="ov-sub">${c.sub}</div>` : ''}
      </div>`)
    .join('');

  renderAllTimeChart(stats.balanceSeries, capital);

  // Update chart sub-label
  const sub = document.getElementById('overviewChartSub');
  if (sub) {
    sub.textContent  = fmtMoney(stats.grossPnl, true);
    sub.className    = `overview-chart-sub ${stats.grossPnl >= 0 ? 'pos' : 'neg'}`;
  }
}

function renderAllTimeChart(series, capital) {
  const canvas  = document.getElementById('allTimeChart');
  const isDark  = document.documentElement.getAttribute('data-theme') === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const textColor = isDark ? '#5C5955' : '#A09D97';
  const MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (allTimeChartInstance) { allTimeChartInstance.destroy(); allTimeChartInstance = null; }

  // Empty state chart
  if (!series || series.length === 0 || (series.length === 1 && !series[0].key)) {
    allTimeChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['—'],
        datasets: [{ data: [capital], borderColor: gridColor, pointRadius: 0 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    return;
  }

  // Derive line colour from final balance vs baseline
  const finalBalance = series[series.length - 1].balance;
  const isPositive   = finalBalance >= capital;
  const lineColor    = isDark
    ? (isPositive ? '#4DC87A' : '#E06060')
    : (isPositive ? '#1A7A44' : '#B83232');
  const fillColor    = isDark
    ? (isPositive ? 'rgba(77,200,122,0.08)' : 'rgba(224,96,96,0.08)')
    : (isPositive ? 'rgba(26,122,68,0.07)'  : 'rgba(184,50,50,0.07)');

  // Build labels: format key as "May 5" or "May '25"
  const labels = series.map(({ key }) => {
    const [y, m, d] = key.split('-');
    const label = `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}`;
    return parseInt(y) !== today.getFullYear() ? `${label} '${String(y).slice(-2)}` : label;
  });
  const balances = series.map(s => s.balance);

  // Prefix the chart with the baseline so it starts flat
  const fullLabels   = ['Start', ...labels];
  const fullBalances = [parseFloat(capital.toFixed(2)), ...balances];

  allTimeChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: fullLabels,
      datasets: [{
        label: 'Balance',
        data: fullBalances,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointRadius: fullLabels.length <= 30 ? 3 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: lineColor,
        pointBorderColor: 'transparent',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1E1C1A' : '#fff',
          borderColor:     isDark ? '#2E2B27' : '#E8E5DF',
          borderWidth: 1,
          titleColor:  isDark ? '#F0EDE8' : '#1A1916',
          bodyColor:   isDark ? '#908D87' : '#6B6860',
          padding: 10,
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => ' Balance: ' + fmtMoneyPlain(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: textColor,
            font: { family: "'DM Mono', monospace", size: 10 },
            maxTicksLimit: 10,
            maxRotation: 0,
          },
        },
        y: {
          grid: { color: gridColor, drawBorder: false },
          ticks: {
            color: textColor,
            font: { family: "'DM Mono', monospace", size: 10 },
            maxTicksLimit: 5,
            callback: v => '$' + (Math.abs(v) >= 1000
              ? (v / 1000).toFixed(1) + 'k'
              : v.toFixed(0)),
          },
        },
      },
    },
  });
}

// ── Monthly PNL Breakdown ─────────────────────────────────────────
function aggregateMonthlyPNL() {
  const acc = getCurrentAccount();
  if (!acc) return [];

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const map = {}; // "YYYY-MM" → { year, month, label, pnl, winDays, lossDays, tradedDays }

  for (const [key, d] of Object.entries(acc.logs)) {
    if (!d || d.pnl === undefined || d.pnl === null || d.pnl === '') continue;
    const [y, m] = key.split('-');
    const mk = `${y}-${m}`;
    if (!map[mk]) {
      map[mk] = {
        year:       parseInt(y),
        month:      parseInt(m) - 1,
        label:      `${MONTH_NAMES[parseInt(m) - 1]} ${y}`,
        pnl:        0,
        winDays:    0,
        lossDays:   0,
        tradedDays: 0,
      };
    }
    const p = parseFloat(d.pnl) || 0;
    map[mk].pnl        += p;
    map[mk].tradedDays++;
    if (p > 0)      map[mk].winDays++;
    else if (p < 0) map[mk].lossDays++;
  }

  // Sort reverse-chronologically (newest first)
  return Object.values(map).sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );
}

function openMonthlyBreakdownModal() {
  const acc = getCurrentAccount();
  if (!acc) return;

  const months = aggregateMonthlyPNL();

  document.getElementById('breakdownAccName').textContent = acc.name;

  const listEl = document.getElementById('breakdownList');
  listEl.innerHTML = '';

  if (months.length === 0) {
    listEl.innerHTML = '<div class="breakdown-empty">No trading data logged yet.</div>';
    document.getElementById('breakdownMonthCount').textContent   = '0';
    document.getElementById('breakdownProfitMonths').textContent = '0';
    document.getElementById('breakdownGrandTotal').textContent   = '$0.00';
    document.getElementById('breakdownGrandTotal').className     = 'breakdown-footer-val total';
    document.getElementById('breakdownOverlay').classList.add('active');
    return;
  }

  // Max |PNL| across all months — used to scale the magnitude background bar
  const maxAbsPnl = Math.max(...months.map(m => Math.abs(m.pnl)), 1);

  months.forEach(m => {
    const winRate = m.tradedDays > 0
      ? Math.round((m.winDays / m.tradedDays) * 100) : 0;
    const pnlCls  = m.pnl >= 0 ? 'pos' : 'neg';
    // Scale faint background: min 8%, max 90%
    const magPct  = Math.max(8, Math.round((Math.abs(m.pnl) / maxAbsPnl) * 88));

    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <div class="breakdown-row-bg ${pnlCls}" style="width:${magPct}%"></div>
      <div class="breakdown-left">
        <div class="breakdown-month-name">${m.label}</div>
        <div class="breakdown-meta">
          <span>${m.tradedDays} day${m.tradedDays !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>${m.winDays}W&nbsp;/&nbsp;${m.lossDays}L</span>
        </div>
      </div>
      <div class="breakdown-bar-track" title="${winRate}% win rate">
        <div class="breakdown-bar-fill ${pnlCls}" style="width:${winRate}%"></div>
      </div>
      <div class="breakdown-right">
        <div class="breakdown-pnl ${pnlCls}">${fmtMoney(m.pnl, true)}</div>
        <div class="breakdown-win-rate">${winRate}% win rate</div>
      </div>
    `;
    listEl.appendChild(row);
  });

  // Footer totals
  const grossPnl     = months.reduce((s, m) => s + m.pnl, 0);
  const profitMonths = months.filter(m => m.pnl >= 0).length;
  const gtEl         = document.getElementById('breakdownGrandTotal');

  document.getElementById('breakdownMonthCount').textContent   = months.length;
  document.getElementById('breakdownProfitMonths').textContent = `${profitMonths} / ${months.length}`;
  gtEl.textContent = fmtMoney(grossPnl, true);
  gtEl.className   = `breakdown-footer-val total ${grossPnl >= 0 ? 'pos' : 'neg'}`;

  document.getElementById('breakdownOverlay').classList.add('active');
}

function closeMonthlyBreakdownModal() {
  document.getElementById('breakdownOverlay').classList.remove('active');
}

// ── Breakdown modal event listeners ──────────────────────────────
document.getElementById('breakdownClose').addEventListener('click', closeMonthlyBreakdownModal);
document.getElementById('breakdownOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeMonthlyBreakdownModal();
});

// Event delegation: click Gross PNL card → open breakdown
document.getElementById('overviewMetrics').addEventListener('click', e => {
  const card = e.target.closest('[data-action="pnl-breakdown"]');
  if (card) openMonthlyBreakdownModal();
});

// ── Day Entry Modal ───────────────────────────────────────────────
function openModal(key, day) {
  activeDate = key;

  const [y, m] = key.split('-');
  const dateObj = new Date(parseInt(y), parseInt(m) - 1, day);
  const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  document.getElementById('modalDate').textContent =
    `${DAY_NAMES[dateObj.getDay()]}, ${MONTH_NAMES[parseInt(m) - 1]} ${day}`;

  const data = getDayData(key);
  document.getElementById('pnlInput').value    = data?.pnl    ?? '';
  document.getElementById('tradesInput').value  = data?.trades ?? '';
  document.getElementById('notesInput').value   = data?.notes  ?? '';

  updateModalBadge(data?.pnl);
  document.getElementById('saveFeedback').classList.remove('show');
  document.getElementById('modalOverlay').classList.add('active');
  setTimeout(() => document.getElementById('pnlInput').focus(), 220);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  activeDate = null;
}

function updateModalBadge(pnlRaw) {
  const badge = document.getElementById('modalDayBadge');
  if (pnlRaw !== undefined && pnlRaw !== '' && pnlRaw !== null) {
    const p = parseFloat(pnlRaw) || 0;
    badge.textContent = p > 0 ? '📈 Profitable Day' : p < 0 ? '📉 Loss Day' : '➖ Break Even';
    badge.style.color = p > 0 ? 'var(--green-text)' : p < 0 ? 'var(--red-text)' : '';
  } else {
    badge.textContent = 'No entry';
    badge.style.color = '';
  }
}

function saveDay() {
  if (!activeDate) return;
  const acc = getCurrentAccount();
  if (!acc) return;

  const pnl    = document.getElementById('pnlInput').value;
  const trades = document.getElementById('tradesInput').value;
  const notes  = document.getElementById('notesInput').value;

  if (pnl === '' && trades === '' && !notes.trim()) {
    delete acc.logs[activeDate];
  } else {
    acc.logs[activeDate] = { pnl, trades, notes };
  }

  saveState();

  const fb = document.getElementById('saveFeedback');
  fb.classList.add('show');
  setTimeout(() => fb.classList.remove('show'), 2000);

  updateModalBadge(pnl);
  renderCalendar();
  renderStats();
  renderOverview();
  showToast('Entry saved ✓');
}

function clearDay() {
  if (!activeDate) return;
  const acc = getCurrentAccount();
  if (!acc) return;

  delete acc.logs[activeDate];
  saveState();

  document.getElementById('pnlInput').value    = '';
  document.getElementById('tradesInput').value = '';
  document.getElementById('notesInput').value  = '';
  updateModalBadge(undefined);

  renderCalendar();
  renderStats();
  renderOverview();
  showToast('Day cleared');
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ── Theme ─────────────────────────────────────────────────────────
const SUN_ICON  = `<circle cx="12" cy="12" r="5"/>
  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
const MOON_ICON = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;
  document.getElementById('themeIcon').innerHTML = theme === 'dark' ? MOON_ICON : SUN_ICON;
  if (chartInstance) renderStats();
  if (allTimeChartInstance) renderOverview();
}

// ── Event Listeners ───────────────────────────────────────────────
document.getElementById('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  updateNavState();
  renderCalendar();
  renderStats();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  updateNavState();
  renderCalendar();
  renderStats();
});

document.getElementById('prevYear').addEventListener('click', () => {
  viewYear--;
  updateNavState();
  renderCalendar();
  renderStats();
});

document.getElementById('nextYear').addEventListener('click', () => {
  viewYear++;
  updateNavState();
  renderCalendar();
  renderStats();
});

document.getElementById('todayBtn').addEventListener('click', () => {
  viewYear  = today.getFullYear();
  viewMonth = today.getMonth();
  updateNavState();
  renderCalendar();
  renderStats();
});

document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  saveState();
});

document.getElementById('capitalInput').addEventListener('input', e => {
  const acc = getCurrentAccount();
  if (acc) {
    acc.baseline = parseFloat(e.target.value) || 0;
    saveState();
    renderStats();
    renderOverview();
  }
});

document.getElementById('capitalInput').addEventListener('blur', () => {
  renderStats();
  renderOverview();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  const acc = getCurrentAccount();
  if (!acc) return;
  const logCount = Object.keys(acc.logs).length;
  if (logCount === 0) { showToast('No data to reset'); return; }
  if (confirm(`Reset all trading data for "${acc.name}"?\n\n${logCount} day${logCount !== 1 ? 's' : ''} will be cleared. This cannot be undone.`)) {
    acc.logs = {};
    saveState();
    renderCalendar();
    renderStats();
    renderOverview();
    showToast('Account data reset');
  }
});

document.getElementById('overviewToggle').addEventListener('click', () => {
  const panel = document.getElementById('overviewPanel');
  const label = document.getElementById('toggleLabel');
  const isCollapsed = panel.classList.toggle('collapsed');
  label.textContent = isCollapsed ? 'Show' : 'Hide';
  // Save collapsed state
  state.overviewCollapsed = isCollapsed;
  saveState();
});
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('saveDayBtn').addEventListener('click', saveDay);
document.getElementById('clearDayBtn').addEventListener('click', clearDay);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeCreateAccountModal();
    closeAccountDropdown();
    closeMonthlyBreakdownModal();
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && activeDate) saveDay();

  // Arrow key month navigation — only when no modal/input is focused
  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
  const modalOpen = document.getElementById('modalOverlay').classList.contains('active')
                 || document.getElementById('createAccOverlay').classList.contains('active');

  if (!inInput && !modalOpen) {
    if (e.key === 'ArrowLeft') {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      updateNavState(); renderCalendar(); renderStats();
    }
    if (e.key === 'ArrowRight') {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      updateNavState(); renderCalendar(); renderStats();
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────
(function init() {
  applyTheme(state.theme || 'light');
  renderApp();
  updateNavState();
  // Restore overview collapsed state
  if (state.overviewCollapsed) {
    const panel = document.getElementById('overviewPanel');
    const label = document.getElementById('toggleLabel');
    if (panel) panel.classList.add('collapsed');
    if (label) label.textContent = 'Show';
  }
})();