/* ================================================================
   PNL Journal — script.js
   ================================================================ */

// ── State & Storage ──────────────────────────────────────────────
const STORAGE_KEY = 'pnl_journal_v2';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { startingCapital: 10000, days: {}, theme: 'light' };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// ── View State ───────────────────────────────────────────────────
const today = new Date();
let viewYear  = today.getFullYear();
let viewMonth = today.getMonth(); // 0-based
let activeDate = null;            // date key of the currently open modal

// ── Helpers ──────────────────────────────────────────────────────
function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format a monetary value with a leading +/- sign.
 * @param {number}  val
 * @param {boolean} always  - always show sign even for zero
 */
function fmtMoney(val, always = false) {
  if (val === 0 && !always) return '$0.00';
  const abs = Math.abs(val);
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return val < 0 ? '-' + str : (val > 0 ? '+' + str : str);
}

/** Format a monetary value without a leading sign. */
function fmtMoneyPlain(val) {
  return '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDayData(key) {
  return state.days[key] || null;
}

function getMonthKeys(year, month) {
  const keys = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) keys.push(dateKey(year, month, d));
  return keys;
}

function getAllTimeStats() {
  let totalPnl = 0, wins = 0, losses = 0, trades = 0;
  for (const key in state.days) {
    const d = state.days[key];
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

/** Returns the current win/loss streak from the most recent logged days. */
function getStreak() {
  const allKeys = Object.keys(state.days).sort().reverse();
  let streak = 0, type = null;

  for (const k of allKeys) {
    const d = state.days[k];
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

// ── Calendar Render ──────────────────────────────────────────────
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  document.getElementById('calNavTitle').textContent    = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
  document.getElementById('winRateMonth').textContent   = MONTH_NAMES[viewMonth].toLowerCase();

  // Column headers
  DAY_NAMES.forEach(name => {
    const el = document.createElement('div');
    el.className = 'day-header';
    el.textContent = name;
    grid.appendChild(el);
  });
  const weekHeader = document.createElement('div');
  weekHeader.className = 'week-header';
  weekHeader.textContent = 'Week';
  grid.appendChild(weekHeader);

  const firstDow     = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Build week rows
  const weekRows = [];
  let currentRow = [];

  for (let i = 0; i < firstDow; i++) {
    currentRow.push({ empty: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday  = d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const isFuture = new Date(viewYear, viewMonth, d) > today;
    const key      = dateKey(viewYear, viewMonth, d);
    const data     = getDayData(key);

    currentRow.push({ d, isToday, isFuture, key, data });

    const dow = new Date(viewYear, viewMonth, d).getDay();
    if (dow === 6 || d === daysInMonth) {
      // Pad trailing empty cells in the last week
      if (d === daysInMonth && dow !== 6) {
        for (let i = dow + 1; i <= 6; i++) {
          currentRow.push({ empty: true, after: true });
        }
      }
      weekRows.push([...currentRow]);
      currentRow = [];
    }
  }

  // Render each row + its week-total cell
  weekRows.forEach((row, weekIndex) => {
    let weekPnl  = 0;
    let hasData  = false;

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

      // Day number
      const numEl = document.createElement('div');
      numEl.className = 'day-num';
      numEl.textContent = cell.d;
      el.appendChild(numEl);

      // Note indicator dot
      if (cell.data && cell.data.notes && cell.data.notes.trim()) {
        const dot = document.createElement('div');
        dot.className = 'day-note-dot';
        el.appendChild(dot);
      }

      // PNL amount + trade count
      if (cell.data && cell.data.pnl !== undefined && cell.data.pnl !== '' && cell.data.pnl !== null) {
        const p = parseFloat(cell.data.pnl) || 0;

        const pnlEl = document.createElement('div');
        pnlEl.className = 'day-pnl ' + (p >= 0 ? 'pos' : 'neg');
        pnlEl.textContent = fmtMoney(p);
        el.appendChild(pnlEl);

        if (cell.data.trades) {
          const trEl = document.createElement('div');
          trEl.className = 'day-trades';
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

    const wtLabel = document.createElement('div');
    wtLabel.className   = 'week-total-label';
    wtLabel.textContent = `Wk ${weekIndex + 1}`;

    const wtVal = document.createElement('div');
    const sign  = hasData ? (weekPnl > 0 ? 'pos' : weekPnl < 0 ? 'neg' : 'zero') : 'zero';
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

  const capital = parseFloat(state.startingCapital) || 0;
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
    allTime.trades > 0 ? `${allTime.trades} total trade${allTime.trades !== 1 ? 's' : ''}` : 'Across all months';

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

  document.getElementById('winDaysVal').textContent    = monthly.wins;
  document.getElementById('lossDaysVal').textContent   = monthly.losses;
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
    ['Month',       MONTH_NAMES[viewMonth] + ' ' + viewYear,                              ''],
    ['Trading Days', monthly.tradedDays.toString(),                                        ''],
    ['Gross PNL',   fmtMoney(monthly.total, true),    monthly.total >= 0 ? 'pos' : 'neg'],
    ['Best Day',    monthly.tradedDays > 0 ? fmtMoney(monthly.bestDay, true)  : '—',      'pos'],
    ['Worst Day',   monthly.tradedDays > 0 ? fmtMoney(monthly.worstDay, true) : '—',      'neg'],
    ['Avg / Day',   monthly.tradedDays > 0 ? fmtMoney(monthly.total / monthly.tradedDays, true) : '—', monthly.total >= 0 ? 'pos' : 'neg'],
    ['Total Trades', monthly.trades.toString(),                                             ''],
    ['Win Rate',    winRate !== null ? winRate + '%' : '—',                               ''],
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
  const keys    = getMonthKeys(viewYear, viewMonth);
  const labels  = [];
  const balances = [];
  let running   = capital;

  for (const k of keys) {
    const day  = parseInt(k.split('-')[2]);
    const d    = getDayData(k);
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

  // Empty-state placeholder chart
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
      datasets: [
        {
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
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1E1C1A' : '#fff',
          borderColor:      isDark ? '#2E2B27' : '#E8E5DF',
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

// ── Modal ─────────────────────────────────────────────────────────
function openModal(key, day) {
  activeDate = key;

  const [y, m] = key.split('-');
  const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(key.split('-')[2]));
  const DAY_NAMES   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  document.getElementById('modalDate').textContent =
    `${DAY_NAMES[dateObj.getDay()]}, ${MONTH_NAMES[parseInt(m) - 1]} ${key.split('-')[2]}`;

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
    badge.textContent  = p > 0 ? '📈 Profitable Day' : p < 0 ? '📉 Loss Day' : '➖ Break Even';
    badge.style.color  = p > 0 ? 'var(--green-text)' : p < 0 ? 'var(--red-text)' : '';
  } else {
    badge.textContent = 'No entry';
    badge.style.color = '';
  }
}

function saveDay() {
  if (!activeDate) return;

  const pnl    = document.getElementById('pnlInput').value;
  const trades = document.getElementById('tradesInput').value;
  const notes  = document.getElementById('notesInput').value;

  if (pnl === '' && trades === '' && !notes.trim()) {
    delete state.days[activeDate];
  } else {
    state.days[activeDate] = { pnl, trades, notes };
  }

  saveState();

  // In-modal "Saved" flash
  const fb = document.getElementById('saveFeedback');
  fb.classList.add('show');
  setTimeout(() => fb.classList.remove('show'), 2000);

  updateModalBadge(pnl);
  renderCalendar();
  renderStats();
  showToast('Entry saved ✓');
}

function clearDay() {
  if (!activeDate) return;

  delete state.days[activeDate];
  saveState();

  document.getElementById('pnlInput').value   = '';
  document.getElementById('tradesInput').value = '';
  document.getElementById('notesInput').value  = '';
  updateModalBadge(undefined);

  renderCalendar();
  renderStats();
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
  if (chartInstance) renderStats(); // refresh chart colors
}

// ── Event Listeners ───────────────────────────────────────────────
document.getElementById('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
  renderStats();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
  renderStats();
});

document.getElementById('todayBtn').addEventListener('click', () => {
  viewYear  = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar();
  renderStats();
});

document.getElementById('themeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  saveState();
});

document.getElementById('capitalInput').addEventListener('input', e => {
  state.startingCapital = parseFloat(e.target.value) || 0;
  saveState();
  renderStats();
});

document.getElementById('capitalInput').addEventListener('blur', () => {
  renderStats();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Reset ALL data? This cannot be undone.')) {
    state = { startingCapital: 10000, days: {}, theme: state.theme };
    saveState();
    document.getElementById('capitalInput').value = 10000;
    renderCalendar();
    renderStats();
    showToast('All data reset');
  }
});

document.getElementById('modalClose').addEventListener('click', closeModal);

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('saveDayBtn').addEventListener('click', saveDay);
document.getElementById('clearDayBtn').addEventListener('click', clearDay);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && activeDate) saveDay();
});

// ── Init ──────────────────────────────────────────────────────────
(function init() {
  document.getElementById('capitalInput').value = state.startingCapital || 10000;
  applyTheme(state.theme || 'light');
  renderCalendar();
  renderStats();
})();