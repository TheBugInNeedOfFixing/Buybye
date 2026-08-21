/* BuyBye — the Insights tab. Replaces the mascot screen with the numbers
   the rest of the app is already collecting. */
window.App = window.App || {};

App.insights = (function () {
  var f = App.format, ui = App.ui, store = App.store, fin = App.finance;

  function el() { return document.getElementById('screen-insights'); }
  function month() { return f.monthKey(); }

  function card(title, side, body) {
    return '<div class="card stat-card">' +
      '<div class="head"><h3>' + title + '</h3>' +
        (side ? '<span class="side">' + side + '</span>' : '') + '</div>' +
      body +
    '</div>';
  }

  /* ---------- pieces ---------- */

  function headline() {
    var t = store.monthTotals(month());
    var settings = store.get().settings;
    var hours = fin.timeCostHours(t.spent, settings);
    return card('Spent this month', f.monthLabel(month()),
      '<div class="big-stat">' + f.money(t.spent) + '</div>' +
      '<p class="tiny muted" style="margin:6px 0 0">' +
        'That is ' + f.duration(hours) + ' of work' +
        (t.income > 0 ? ' · ' + Math.round((t.spent / t.income) * 100) + '% of what you made' : '') +
      '</p>');
  }

  function splitCard() {
    var t = store.monthTotals(month());
    var total = t.needs + t.wants;
    if (total <= 0) {
      return card('Needs vs wants', null,
        '<p class="tiny muted" style="margin:0">Log some spending to see the split.</p>');
    }
    var needsPct = (t.needs / total) * 100;
    return card('Needs vs wants', Math.round(needsPct) + '% needs',
      '<div class="split">' +
        '<i class="needs" style="width:' + needsPct + '%"></i>' +
        '<i class="wants" style="width:' + (100 - needsPct) + '%"></i>' +
      '</div>' +
      '<div class="legend">' +
        '<span><span class="dot" style="background:var(--text)"></span>Needs <b>' + f.money(t.needs) + '</b></span>' +
        '<span><span class="dot" style="background:var(--accent)"></span>Wants <b>' + f.money(t.wants) + '</b></span>' +
      '</div>');
  }

  function byCategory() {
    var m = month();
    var spent = store.spentByCategory(m);
    var rows = store.get().categories
      .filter(function (c) { return c.group === 'needs' || c.group === 'wants'; })
      .map(function (c) { return { cat: c, value: spent[c.id] || 0 }; })
      .filter(function (r) { return r.value > 0; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);

    if (!rows.length) {
      return card('Where it went', null,
        '<p class="tiny muted" style="margin:0">Nothing logged yet this month.</p>');
    }

    var max = rows[0].value;
    var body = rows.map(function (r) {
      return '<div class="bar-row">' +
        '<span class="name">' + f.escape(r.cat.emoji + ' ' + r.cat.name) + '</span>' +
        '<span class="track"><i style="width:' + ((r.value / max) * 100) + '%"></i></span>' +
        '<span class="val">' + f.money(r.value) + '</span>' +
      '</div>';
    }).join('');

    return card('Where it went', rows.length + ' categories', body);
  }

  function trend() {
    var months = store.activeMonths(6);
    var data = months.map(function (key) {
      var t = store.monthTotals(key);
      return { key: key, value: t.spent };
    });
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var current = month();

    var body = '<div class="trend">' + data.map(function (d) {
      var h = Math.max(3, (d.value / max) * 100);
      return '<div class="col' + (d.key === current ? ' current' : '') + '">' +
        '<i style="height:' + h + '%"></i>' +
        '<span>' + f.monthLabel(d.key).slice(0, 3) + '</span>' +
      '</div>';
    }).join('') + '</div>';

    return card('Month by month', 'spending', body);
  }

  function goals() {
    var m = month();
    var cats = store.categoriesIn('goals');
    if (!cats.length) {
      return card('Goals', null,
        '<p class="tiny muted" style="margin:0">No savings goals yet.</p>');
    }
    var spent = store.spentByCategory(m);
    var body = cats.map(function (c) {
      var funded = spent[c.id] || 0;
      var target = store.plannedFor(m, c.id);
      var pct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
      return '<div class="bar-row">' +
        '<span class="name">' + f.escape(c.emoji + ' ' + c.name) + '</span>' +
        '<span class="track"><i style="width:' + pct + '%"></i></span>' +
        '<span class="val">' + f.money(funded) + (target > 0 ? '/' + f.money(target) : '') + '</span>' +
      '</div>';
    }).join('');
    return card('Goals', f.monthLabel(m), body);
  }

  /* The payoff for every "Don't Buy" — the thing the Worth it screen is
     really arguing for. */
  function notBought() {
    var decisions = store.get().decisions.filter(function (d) { return d.choice === 'dont'; });
    if (!decisions.length) {
      return card('Talked yourself out of it', null,
        '<p class="tiny muted" style="margin:0">' +
          'Every time you tap Don’t Buy on the Worth it screen, the saving lands here.</p>');
    }
    var saved = decisions.reduce(function (sum, d) { return sum + Number(d.price || 0); }, 0);
    var future = decisions.reduce(function (sum, d) { return sum + Number(d.futureValue || 0); }, 0);
    var hours = fin.timeCostHours(saved, store.get().settings);

    return card('Talked yourself out of it', decisions.length + ' times',
      '<div class="big-stat">' + f.money(saved) + '</div>' +
      '<p class="tiny muted" style="margin:6px 0 0">' +
        f.duration(hours) + ' of work kept · worth ' +
        '<b style="color:var(--accent-ink)">' + f.moneyExact(future) + '</b> at retirement</p>');
  }

  function timeCost() {
    var t = store.monthTotals(month());
    var settings = store.get().settings;
    var rate = fin.hourlyRate(settings);
    if (!rate) {
      return card('Your hourly rate', null,
        '<p class="tiny muted" style="margin:0">Add what you earn in Settings.</p>');
    }
    return card('Your hourly rate', null,
      '<div class="big-stat">' + f.moneyExact(rate) + '</div>' +
      '<p class="tiny muted" style="margin:6px 0 0">' +
        'Everything you buy is priced in this · ' +
        f.hoursShort(fin.timeCostHours(t.spent + t.goals, settings)) + ' committed this month</p>');
  }

  function render() {
    var host = el();
    if (!host) return;
    host.innerHTML =
      '<div class="topbar"><div class="spacer"></div>' +
        '<div class="month-pill">Insights</div>' +
        '<div class="spacer"></div></div>' +
      '<div class="scroll">' +
        headline() +
        splitCard() +
        byCategory() +
        trend() +
        goals() +
        notBought() +
        timeCost() +
      '</div>';
  }

  function bind() { /* read-only screen */ }

  return { render: render, bind: bind };
})();
