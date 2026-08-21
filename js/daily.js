/* BuyBye — the Daily tab: a random allowance for today, drawn from what
   is actually left in the Wants budget. */
window.App = window.App || {};

App.daily = (function () {
  var f = App.format, ui = App.ui, store = App.store, fin = App.finance;
  var pending = null;   // the roll being shown, before it is accepted

  function el() { return document.getElementById('screen-daily'); }
  function todayKey() { return f.dayKey(); }
  function todayEntry() { return store.get().daily[todayKey()] || null; }

  /* What is left to play with, and over how many days. */
  function context() {
    var m = f.monthKey();
    var planned = store.plannedTotal(m, 'wants');
    var spent = 0;
    var byCat = store.spentByCategory(m);
    store.categoriesIn('wants').forEach(function (c) { spent += byCat[c.id] || 0; });

    var now = new Date();
    var daysLeft = f.daysInMonth(m) - now.getDate() + 1;
    return { remaining: Math.max(0, planned - spent), daysLeft: daysLeft, planned: planned };
  }

  function spentToday() {
    var rows = store.transactionsOn(todayKey());
    var sum = 0;
    rows.forEach(function (t) {
      var cat = store.categoryById(t.categoryId);
      if (cat && (cat.group === 'wants' || cat.group === 'needs')) sum += Number(t.amount || 0);
    });
    return sum;
  }

  function render() {
    var host = el();
    if (!host) return;
    var entry = todayEntry();

    var card, sub, action;
    if (entry && entry.accepted) {
      var used = spentToday();
      var left = entry.amount - used;
      card = f.money(entry.amount);
      sub = '<p class="center muted" style="margin:0">' +
        f.money(used) + ' spent today · ' +
        '<b style="color:' + (left < 0 ? 'var(--danger)' : 'var(--accent-ink)') + '">' +
        f.money(Math.abs(left)) + (left < 0 ? ' over' : ' left') + '</b></p>';
      action = '<button class="btn btn-soft" data-clear style="max-width:260px">Clear today</button>';
    } else {
      card = '???';
      sub = '<p class="center muted tiny" style="margin:0;max-width:260px">' +
        'Drawn from what is left in your Wants budget for the month.</p>';
      action = '<button class="btn" data-roll style="max-width:260px">Get Random Budget</button>';
    }

    host.innerHTML =
      '<div class="daily-wrap">' +
        '<h1 class="title" style="font-size:34px">Daily<br>Challenge</h1>' +
        '<div class="daily-card">' +
          '<span class="cap">today’s budget</span>' +
          '<span class="amt">' + card + '</span>' +
        '</div>' +
        sub +
        action +
      '</div>';
  }

  function bind() {
    var host = el();
    ui.on(host, '[data-roll]', 'click', function () { roll(); });
    ui.on(host, '[data-clear]', 'click', function () {
      store.update(function (s) { delete s.daily[todayKey()]; });
    });
  }

  function roll() {
    var c = context();
    pending = fin.rollDailyBudget(c.remaining, c.daysLeft);
    showReveal();
  }

  /* The reveal is a flat accent panel — the original rainbow gradient is
     deliberately dropped for the calmer look. */
  function showReveal() {
    var existing = document.querySelector('.reveal');
    if (existing) existing.parentNode.removeChild(existing);

    var panel = document.createElement('div');
    panel.className = 'reveal';
    panel.innerHTML =
      '<div class="msg">' + f.escape(pending.message) + '</div>' +
      '<div class="amt">' + f.money(pending.amount) + '</div>' +
      '<div class="cap">today’s budget</div>' +
      '<div class="controls">' +
        '<button class="no" data-reroll aria-label="Roll again">✕</button>' +
        '<button class="yes" data-accept aria-label="Accept">✓</button>' +
      '</div>';
    ui.root().appendChild(panel);

    panel.querySelector('[data-reroll]').addEventListener('click', function () {
      var c = context();
      pending = fin.rollDailyBudget(c.remaining, c.daysLeft);
      panel.querySelector('.msg').textContent = pending.message;
      panel.querySelector('.amt').textContent = f.money(pending.amount);
    });

    panel.querySelector('[data-accept]').addEventListener('click', function () {
      var accepted = pending;
      panel.parentNode.removeChild(panel);
      store.update(function (s) {
        s.daily[todayKey()] = {
          amount: accepted.amount,
          message: accepted.message,
          accepted: true,
          setAt: new Date().toISOString()
        };
      });
      ui.toast('Today: ' + f.money(accepted.amount));
    });
  }

  return { render: render, bind: bind, spentToday: spentToday, context: context };
})();
