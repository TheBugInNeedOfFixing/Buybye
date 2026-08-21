/* BuyBye — state. localStorage is the source of truth; Firestore mirrors it. */
window.App = window.App || {};

App.store = (function () {
  var KEY = 'buybye.state.v1';
  var listeners = [];
  var state = null;

  /* Seed catalog for the onboarding pickers. No mascot art anywhere —
     emoji are kept only as category markers. */
  var CATALOG = {
    home: [
      { name: 'Rent',         emoji: '🔑', group: 'needs' },
      { name: 'Mortgage',     emoji: '🏠', group: 'needs' },
      { name: 'Insurance',    emoji: '🛡️', group: 'needs' },
      { name: 'Utilities',    emoji: '🚰', group: 'needs' },
      { name: 'Maintenance',  emoji: '🧰', group: 'needs' },
      { name: 'Property tax', emoji: '🧮', group: 'needs' }
    ],
    debt: [
      { name: 'Credit Card',  emoji: '💳', group: 'needs' },
      { name: 'Auto loan',    emoji: '🚗', group: 'needs' },
      { name: 'Student loan', emoji: '🎓', group: 'needs' },
      { name: 'Medical debt', emoji: '🩺', group: 'needs' }
    ],
    spending: [
      { name: 'Groceries',       emoji: '🛒', group: 'needs' },
      { name: 'Phone/Internet',  emoji: '📱', group: 'needs' },
      { name: 'Clothing',        emoji: '🧥', group: 'wants' },
      { name: 'Personal care',   emoji: '🧴', group: 'wants' },
      { name: 'Household items', emoji: '🧽', group: 'needs' }
    ],
    goals: [
      { name: 'Travel',               emoji: '🏝️', group: 'goals' },
      { name: 'Big Purchase',         emoji: '🛍️', group: 'goals' },
      { name: 'Home',                 emoji: '🏠', group: 'goals' },
      { name: 'Emergency Fund',       emoji: '🛟', group: 'goals' },
      { name: 'Investments',          emoji: '💵', group: 'goals' },
      { name: 'Family & Life Events', emoji: '💍', group: 'goals' }
    ]
  };

  function defaults() {
    return {
      version: 1,
      updatedAt: 0,
      settings: {
        currency: 'USD',
        hourlyMode: false,
        salaryType: 'yearly',
        salary: 0,
        hourlyRate: 0,
        taxRate: 25,
        returnRate: 10,
        retirementAge: 65,
        birthday: '',
        monthlyIncome: 0,
        salesTax: 0
      },
      onboarding: { complete: false, step: 0 },
      categories: [{ id: 'income', name: 'Income', emoji: '💵', group: 'income', custom: false }],
      budgets: {},
      transactions: [],
      wishlist: [],
      decisions: [],
      daily: {},
      notifications: {
        tracking:   { on: true,  time: '21:00' },
        reflection: { on: true,  day: 1, time: '10:00' },
        bills:      { on: false, time: '09:00' }
      },
      ui: { monthKey: null, budgetMode: 'left', collapsed: {}, authSeen: false }
    };
  }

  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(saved).forEach(function (k) {
      var v = saved[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && !Array.isArray(base[k])) {
        base[k] = merge(base[k], v);
      } else if (v !== undefined) {
        base[k] = v;
      }
    });
    return base;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    state = merge(defaults(), parsed);
    if (!state.ui.monthKey) state.ui.monthKey = App.format.monthKey();
    return state;
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  }

  function get() { return state; }

  /* Every mutation goes through here so persistence, sync and re-render
     all happen in one place. */
  function update(mutator, opts) {
    var o = opts || {};
    if (typeof mutator === 'function') mutator(state);
    if (!o.silentTimestamp) state.updatedAt = Date.now();
    persist();
    if (!o.skipSync && App.sync && App.sync.schedulePush) App.sync.schedulePush();
    if (!o.skipRender) emit();
  }

  /* Used by sync when remote data wins — does not push back up. */
  function replace(next) {
    state = merge(defaults(), next);
    if (!state.ui.monthKey) state.ui.monthKey = App.format.monthKey();
    persist();
    emit();
  }

  function reset() {
    state = defaults();
    persist();
    emit();
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) { console.error(e); }
    }
  }

  function currency() { return state && state.settings ? state.settings.currency : 'USD'; }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- derived helpers ---------- */

  function categoriesIn(group) {
    return state.categories.filter(function (c) { return c.group === group; });
  }

  function categoryById(id) {
    for (var i = 0; i < state.categories.length; i++) {
      if (state.categories[i].id === id) return state.categories[i];
    }
    return null;
  }

  function addCategory(name, emoji, group) {
    var cat = { id: uid('cat'), name: name, emoji: emoji || '•', group: group, custom: true };
    state.categories.push(cat);
    return cat;
  }

  function removeCategory(id) {
    state.categories = state.categories.filter(function (c) { return c.id !== id; });
    state.transactions = state.transactions.filter(function (t) { return t.categoryId !== id; });
  }

  function transactionsFor(monthKey) {
    return state.transactions.filter(function (t) {
      return String(t.date).slice(0, 7) === monthKey;
    });
  }

  function transactionsOn(dayKey) {
    return state.transactions.filter(function (t) { return String(t.date).slice(0, 10) === dayKey; });
  }

  function spentByCategory(monthKey) {
    var out = {};
    transactionsFor(monthKey).forEach(function (t) {
      out[t.categoryId] = (out[t.categoryId] || 0) + Number(t.amount || 0);
    });
    return out;
  }

  /* Totals for a month, grouped the way the Budget screen shows them.
     "left" is what the summary card reports: income minus everything out. */
  function monthTotals(monthKey) {
    var totals = { income: 0, needs: 0, wants: 0, goals: 0 };
    transactionsFor(monthKey).forEach(function (t) {
      var cat = categoryById(t.categoryId);
      var group = cat ? cat.group : (t.type === 'income' ? 'income' : 'needs');
      totals[group] = (totals[group] || 0) + Number(t.amount || 0);
    });
    totals.spent = totals.needs + totals.wants;
    totals.left = totals.income - totals.spent - totals.goals;
    return totals;
  }

  function plannedFor(monthKey, categoryId) {
    var m = state.budgets[monthKey];
    if (m && m[categoryId] != null) return Number(m[categoryId]);
    if (categoryId === 'income') return Number(state.settings.monthlyIncome || 0);
    return 0;
  }

  function setPlanned(monthKey, categoryId, amount) {
    if (!state.budgets[monthKey]) state.budgets[monthKey] = {};
    state.budgets[monthKey][categoryId] = Number(amount) || 0;
  }

  function plannedTotal(monthKey, group) {
    var sum = 0;
    categoriesIn(group).forEach(function (c) { sum += plannedFor(monthKey, c.id); });
    return sum;
  }

  function addTransaction(tx) {
    var row = {
      id: uid('tx'),
      date: tx.date || App.format.dayKey(),
      categoryId: tx.categoryId,
      amount: Number(tx.amount) || 0,
      type: tx.type || 'expense',
      note: tx.note || ''
    };
    state.transactions.push(row);
    return row;
  }

  function removeTransaction(id) {
    state.transactions = state.transactions.filter(function (t) { return t.id !== id; });
  }

  /* Months that have any activity, oldest first — used by Insights. */
  function activeMonths(limit) {
    var seen = {};
    state.transactions.forEach(function (t) { seen[String(t.date).slice(0, 7)] = true; });
    seen[App.format.monthKey()] = true;
    var keys = Object.keys(seen).sort();
    return limit ? keys.slice(-limit) : keys;
  }

  return {
    KEY: KEY,
    CATALOG: CATALOG,
    defaults: defaults,
    load: load,
    get: get,
    update: update,
    replace: replace,
    reset: reset,
    subscribe: subscribe,
    emit: emit,
    currency: currency,
    uid: uid,
    categoriesIn: categoriesIn,
    categoryById: categoryById,
    addCategory: addCategory,
    removeCategory: removeCategory,
    transactionsFor: transactionsFor,
    transactionsOn: transactionsOn,
    spentByCategory: spentByCategory,
    monthTotals: monthTotals,
    plannedFor: plannedFor,
    setPlanned: setPlanned,
    plannedTotal: plannedTotal,
    addTransaction: addTransaction,
    removeTransaction: removeTransaction,
    activeMonths: activeMonths
  };
})();
