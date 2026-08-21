/* BuyBye — the Budget tab: month view, three display modes, entry sheets. */
window.App = window.App || {};

App.budget = (function () {
  var f = App.format, ui = App.ui, store = App.store, fin = App.finance;

  /* The mode button is labelled with the mode you switch TO, which is how
     the original reads: showing money, the button says "Time cost". */
  var MODES = ['left', 'time', 'spent'];
  var NEXT_LABEL = { left: 'Time cost', time: 'Spent', spent: 'Budget' };
  var MODE_GLYPH = '↻';

  function el() { return document.getElementById('screen-budget'); }
  function month() { return store.get().ui.monthKey || f.monthKey(); }
  function mode() { return store.get().ui.budgetMode || 'left'; }

  function setMode() {
    var i = MODES.indexOf(mode());
    store.update(function (s) { s.ui.budgetMode = MODES[(i + 1) % MODES.length]; });
  }

  function shift(delta) {
    store.update(function (s) { s.ui.monthKey = f.shiftMonth(month(), delta); });
  }

  /* ---------- summary ---------- */

  function summaryHTML() {
    var m = month();
    var totals = store.monthTotals(m);
    var count = store.transactionsFor(m).length;
    var settings = store.get().settings;
    var value, caption, over;

    if (mode() === 'time') {
      value = f.hoursShort(fin.timeCostHours(Math.abs(totals.left), settings));
      caption = 'left';
      over = totals.left < 0;
    } else if (mode() === 'spent') {
      value = f.money(totals.spent);
      caption = 'spent';
      over = false;
    } else {
      value = f.money(totals.left);
      caption = 'left';
      over = totals.left < 0;
    }

    var lead = count === 0
      ? '<b>Tap + to start</b><span>Add expenses, income,<br>or savings to your budget</span>'
      : '<b>' + f.monthLabel(m) + '</b><span>' + count + (count === 1 ? ' entry' : ' entries') + '</span>';

    return '<div class="summary">' +
      '<div class="lead">' + lead + '</div>' +
      '<div class="figure' + (over ? ' over' : '') + '">' +
        '<b>' + value + '</b><span>' + caption + '</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------- rows ---------- */

  function trailLabel(group) {
    if (group === 'income') return mode() === 'time' ? 'time cost' : 'made';
    if (mode() === 'time') return 'time cost';
    if (mode() === 'spent') return 'spent';
    return group === 'goals' ? 'funded' : 'left to spend';
  }

  function rowValue(catId, group) {
    var m = month();
    var spent = store.spentByCategory(m)[catId] || 0;
    var planned = store.plannedFor(m, catId);
    var settings = store.get().settings;

    if (mode() === 'time') {
      return { text: f.hoursShort(fin.timeCostHours(spent, settings)), over: false, spent: spent, planned: planned };
    }
    if (mode() === 'spent' || group === 'goals' || group === 'income') {
      return { text: f.money(spent), over: false, spent: spent, planned: planned };
    }
    var left = planned - spent;
    return { text: f.money(left), over: left < 0, spent: spent, planned: planned };
  }

  function rowHTML(cat) {
    var v = rowValue(cat.id, cat.group);
    var showBar = v.planned > 0 && cat.group !== 'income';
    var pct = showBar ? Math.min(100, (v.spent / v.planned) * 100) : 0;

    return '<button class="row' + (showBar ? ' row-stack' : '') + '" data-cat="' + cat.id + '">' +
      '<span class="line">' +
        ui.tile(cat.emoji) +
        '<span class="name">' + f.escape(cat.name) + '</span>' +
        '<span class="amt' + (v.over ? ' over' : '') + '">' + v.text + '</span>' +
        '<span class="trail">' + trailLabel(cat.group) + '</span>' +
      '</span>' +
      (showBar ? '<span class="bar"><i class="' + (v.spent > v.planned ? 'over' : '') +
        '" style="width:' + pct + '%"></i></span>' : '') +
    '</button>';
  }

  /* ---------- groups ---------- */

  function groupTotal(group) {
    var m = month();
    var spent = store.spentByCategory(m);
    var sum = 0;
    store.categoriesIn(group).forEach(function (c) { sum += spent[c.id] || 0; });
    if (mode() === 'time') return f.hoursShort(fin.timeCostHours(sum, store.get().settings));
    return f.money(sum);
  }

  function groupHTML(group, heading, sub) {
    var collapsed = !!store.get().ui.collapsed[group];
    var cats = store.categoriesIn(group);

    var body = cats.length
      ? cats.map(rowHTML).join('')
      : '<div class="row row-empty">' + trailLabel(group) + '</div>';

    return '<div class="group">' +
      '<button class="group-head" aria-expanded="' + (!collapsed) + '" data-group="' + group + '">' +
        '<span class="section-label">' + heading +
          (sub ? ' <span class="muted">' + sub + '</span>' : '') + '</span>' +
        '<span class="total">' + groupTotal(group) + '</span>' +
        '<span class="chev">▾</span>' +
      '</button>' +
      (collapsed ? '' : '<div>' + body + '</div>') +
    '</div>';
  }

  /* ---------- screen ---------- */

  function render() {
    var host = el();
    if (!host) return;

    host.innerHTML =
      '<div class="topbar">' +
        '<button class="mode-btn" data-mode>' +
          '<span class="glyph">' + MODE_GLYPH + '</span>' +
          '<span>' + NEXT_LABEL[mode()] + '</span>' +
        '</button>' +
        '<div class="spacer"></div>' +
        '<div class="month-nav">' +
          '<button class="arrow" data-shift="-1" aria-label="Previous month">◀</button>' +
          '<button class="month-pill" data-today>' + f.monthLabel(month()) + '</button>' +
          '<button class="arrow" data-shift="1" aria-label="Next month">▶</button>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<button class="icon-btn" data-edit>' +
          '<span class="glyph">✎</span><span>Edit<br>budget</span>' +
        '</button>' +
      '</div>' +
      '<div class="scroll">' +
        summaryHTML() +
        groupHTML('income', 'Made', '') +
        groupHTML('wants', 'Spent', 'Wants') +
        groupHTML('needs', 'Spent', 'Needs') +
        groupHTML('goals', 'Saved', 'Goals') +
      '</div>' +
      '<button class="fab" data-add aria-label="Add entry">+</button>';
  }

  function bind() {
    var host = el();
    ui.on(host, '[data-mode]', 'click', setMode);
    ui.on(host, '[data-shift]', 'click', function (ev, t) { shift(Number(t.getAttribute('data-shift'))); });
    ui.on(host, '[data-today]', 'click', function () {
      store.update(function (s) { s.ui.monthKey = f.monthKey(); });
    });
    ui.on(host, '[data-group]', 'click', function (ev, t) {
      var g = t.getAttribute('data-group');
      store.update(function (s) { s.ui.collapsed[g] = !s.ui.collapsed[g]; });
    });
    ui.on(host, '[data-add]', 'click', function () { openEntrySheet(); });
    ui.on(host, '[data-edit]', 'click', openEditBudget);
    ui.on(host, '[data-cat]', 'click', function (ev, t) {
      openCategorySheet(t.getAttribute('data-cat'));
    });
  }

  /* ---------- add entry ---------- */

  var TYPE_GROUPS = { expense: ['needs', 'wants'], income: ['income'], saving: ['goals'] };

  function categoryOptions(type, selected) {
    var groups = TYPE_GROUPS[type];
    var opts = [];
    groups.forEach(function (g) {
      store.categoriesIn(g).forEach(function (c) {
        opts.push('<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' +
          f.escape(c.emoji + '  ' + c.name) + '</option>');
      });
    });
    opts.push('<option value="__new">+ New category</option>');
    return opts.join('');
  }

  function openEntrySheet(prefill) {
    var p = prefill || {};
    var type = p.type || 'expense';

    function body() {
      return '<div class="segmented" data-types>' +
          '<button aria-pressed="' + (type === 'expense') + '" data-t="expense">Expense</button>' +
          '<button aria-pressed="' + (type === 'income') + '" data-t="income">Income</button>' +
          '<button aria-pressed="' + (type === 'saving') + '" data-t="saving">Saving</button>' +
        '</div>' +
        '<label class="field-label left">Amount</label>' +
        '<input class="field field-lg" inputmode="decimal" data-amount value="' +
          (p.amount != null ? f.escape(p.amount) : '') + '" placeholder="0">' +
        '<label class="field-label left">Category</label>' +
        '<select class="field" data-category>' + categoryOptions(type, p.categoryId) + '</select>' +
        '<div data-newcat class="hidden inline-add" style="margin-top:10px">' +
          '<input class="field emoji" data-new-emoji maxlength="4" placeholder="🙂">' +
          '<input class="field" data-new-name placeholder="Category name">' +
        '</div>' +
        '<label class="field-label left">Date</label>' +
        '<input class="field" type="date" data-date value="' + (p.date || f.dayKey()) + '">' +
        '<label class="field-label left">Note</label>' +
        '<input class="field" data-note placeholder="Optional" value="' + f.escape(p.note || '') + '">' +
        '<div style="height:18px"></div>' +
        '<button class="btn" data-save>Add to budget</button>' +
        '<button class="btn btn-ghost" data-close style="margin-top:6px">Cancel</button>';
    }

    var s = ui.sheet('New entry', body());

    function refreshCategories() {
      var sel = s.el.querySelector('[data-category]');
      sel.innerHTML = categoryOptions(type, null);
      toggleNewCat();
    }
    function toggleNewCat() {
      var sel = s.el.querySelector('[data-category]');
      s.el.querySelector('[data-newcat]').classList.toggle('hidden', sel.value !== '__new');
    }

    ui.on(s.el, '[data-t]', 'click', function (ev, t) {
      type = t.getAttribute('data-t');
      ui.qsa('[data-t]', s.el).forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-t') === type ? 'true' : 'false');
      });
      refreshCategories();
    });
    ui.on(s.el, '[data-category]', 'change', toggleNewCat);

    s.el.querySelector('[data-save]').addEventListener('click', function () {
      var amount = ui.readNumber(s.el.querySelector('[data-amount]'));
      if (amount <= 0) { ui.toast('Enter an amount'); return; }

      var sel = s.el.querySelector('[data-category]');
      var categoryId = sel.value;
      var date = s.el.querySelector('[data-date]').value || f.dayKey();
      var note = s.el.querySelector('[data-note]').value;

      store.update(function () {
        if (categoryId === '__new') {
          var name = String(s.el.querySelector('[data-new-name]').value || '').trim();
          if (!name) name = type === 'income' ? 'Income' : 'Other';
          var emoji = String(s.el.querySelector('[data-new-emoji]').value || '').trim() || '•';
          var group = type === 'income' ? 'income' : (type === 'saving' ? 'goals' : 'needs');
          categoryId = store.addCategory(name, emoji, group).id;
        }
        store.addTransaction({
          amount: amount, categoryId: categoryId, date: date, type: type, note: note
        });
      });

      s.close();
      ui.toast('Added ' + f.money(amount));
    });
  }

  /* ---------- edit budget ---------- */

  function openEditBudget() {
    var m = month();

    function line(cat) {
      return '<div class="list-item">' +
        ui.tile(cat.emoji, true) +
        '<span class="grow name" style="font-weight:600">' + f.escape(cat.name) + '</span>' +
        '<input class="field" style="width:118px;padding:9px 11px;text-align:right" ' +
          'inputmode="decimal" data-plan="' + cat.id + '" value="' +
          (store.plannedFor(m, cat.id) || '') + '" placeholder="0">' +
      '</div>';
    }

    function section(group, title) {
      var cats = store.categoriesIn(group);
      if (!cats.length) return '';
      return '<div class="eyebrow" style="margin:18px 0 8px">' + title + '</div>' +
        cats.map(line).join('');
    }

    var body =
      '<p class="tiny muted" style="margin:0 0 4px">Planned amounts for ' + f.monthLabel(m) + '</p>' +
      section('income', 'Expected income') +
      section('needs', 'Needs') +
      section('wants', 'Wants') +
      section('goals', 'Goals') +
      '<div style="height:18px"></div>' +
      '<button class="btn" data-save-plan>Save budget</button>' +
      '<button class="btn btn-ghost" data-close style="margin-top:6px">Cancel</button>';

    var s = ui.sheet('Edit budget', body);

    s.el.querySelector('[data-save-plan]').addEventListener('click', function () {
      store.update(function (st) {
        ui.qsa('[data-plan]', s.el).forEach(function (input) {
          var id = input.getAttribute('data-plan');
          store.setPlanned(m, id, ui.readNumber(input));
          if (id === 'income') st.settings.monthlyIncome = ui.readNumber(input);
        });
      });
      s.close();
      ui.toast('Budget saved');
    });
  }

  /* ---------- category detail ---------- */

  function openCategorySheet(catId) {
    var cat = store.categoryById(catId);
    if (!cat) return;
    var m = month();
    var settings = store.get().settings;

    var rows = store.transactionsFor(m)
      .filter(function (t) { return t.categoryId === catId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var spent = rows.reduce(function (sum, t) { return sum + Number(t.amount || 0); }, 0);
    var planned = store.plannedFor(m, catId);

    var list = rows.length
      ? rows.map(function (t) {
          return '<div class="list-item">' +
            '<span class="grow">' +
              '<span class="name">' + f.money(t.amount) + '</span>' +
              '<span class="sub">' + f.escape(t.date) + (t.note ? ' · ' + f.escape(t.note) : '') + '</span>' +
            '</span>' +
            '<button class="link" data-del="' + t.id + '">Delete</button>' +
          '</div>';
        }).join('')
      : '<p class="muted tiny" style="margin:0 0 8px">Nothing logged here this month.</p>';

    var body =
      '<div class="list-item" style="margin-bottom:14px">' +
        ui.tile(cat.emoji) +
        '<span class="grow">' +
          '<span class="name">' + f.escape(cat.name) + '</span>' +
          '<span class="sub">' + f.money(spent) + ' of ' + f.money(planned) + ' · ' +
            f.hoursShort(fin.timeCostHours(spent, settings)) + ' of work</span>' +
        '</span>' +
      '</div>' +
      '<label class="field-label left">Planned for ' + f.monthLabel(m) + '</label>' +
      '<input class="field" inputmode="decimal" data-plan value="' + (planned || '') + '" placeholder="0">' +
      '<div class="divider"></div>' +
      list +
      '<div style="height:12px"></div>' +
      '<button class="btn" data-save-one>Save</button>' +
      '<button class="btn btn-ghost" data-remove style="margin-top:6px;color:var(--danger)">' +
        'Delete category</button>';

    var s = ui.sheet(null, body);

    ui.on(s.el, '[data-del]', 'click', function (ev, t) {
      store.update(function () { store.removeTransaction(t.getAttribute('data-del')); });
      s.close();
    });

    s.el.querySelector('[data-save-one]').addEventListener('click', function () {
      store.update(function (st) {
        var v = ui.readNumber(s.el.querySelector('[data-plan]'));
        store.setPlanned(m, catId, v);
        if (catId === 'income') st.settings.monthlyIncome = v;
      });
      s.close();
    });

    s.el.querySelector('[data-remove]').addEventListener('click', function () {
      s.close();
      ui.confirm('Delete ' + cat.name + ' and everything logged to it?', 'Delete', function () {
        store.update(function () { store.removeCategory(catId); });
        ui.toast('Category deleted');
      });
    });
  }

  return { render: render, bind: bind, openEntrySheet: openEntrySheet };
})();
