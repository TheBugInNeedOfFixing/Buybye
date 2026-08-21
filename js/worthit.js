/* BuyBye — the Worth it tab: what a purchase really costs, in hours of
   your life and in the retirement money you are giving up. */
window.App = window.App || {};

App.worthit = (function () {
  var f = App.format, ui = App.ui, store = App.store, fin = App.finance;
  var taxOpen = false;

  function el() { return document.getElementById('screen-worthit'); }
  function wishEl() { return document.getElementById('screen-wishlist'); }

  function salesTax() { return Number(store.get().settings.salesTax || 0); }

  /* ---------- main screen ---------- */

  function render() {
    var host = el();
    if (!host) return;
    var count = store.get().wishlist.length;

    host.innerHTML =
      '<div class="topbar">' +
        '<div class="spacer"></div>' +
        '<button class="icon-btn" data-wishlist aria-label="Still want it">' +
          '<span class="glyph">⌛</span>' +
          '<span>' + (count ? count + ' saved' : 'Saved') + '</span>' +
        '</button>' +
      '</div>' +
      '<div class="worth-wrap">' +
        '<h2>Purchase price</h2>' +
        '<input class="field" inputmode="decimal" data-price placeholder="' +
          f.symbolFor(store.currency()) + '50">' +
        '<button class="tax-toggle" data-tax-toggle>Tax ' + (taxOpen ? '⌃' : '⌄') + '</button>' +
        (taxOpen
          ? '<div class="tax-box"><input class="field" inputmode="decimal" data-tax ' +
            'value="' + salesTax() + '" placeholder="Sales tax %">' +
            '<p class="tiny muted center" style="margin:8px 0 0">Added to the price before the maths</p></div>'
          : '') +
        '<div style="height:22px"></div>' +
        '<button class="btn" data-submit style="max-width:240px">Submit</button>' +
      '</div>' +
      '<button class="fab" data-add aria-label="Add entry">+</button>';
  }

  function bind() {
    var host = el();

    ui.on(host, '[data-tax-toggle]', 'click', function () {
      var input = host.querySelector('[data-tax]');
      if (input) {
        store.update(function (s) { s.settings.salesTax = ui.readNumber(input); }, { skipRender: true });
      }
      taxOpen = !taxOpen;
      var price = host.querySelector('[data-price]');
      var keep = price ? price.value : '';
      render();
      var again = host.querySelector('[data-price]');
      if (again) again.value = keep;
    });

    ui.on(host, '[data-submit]', 'click', function () { submit(); });
    ui.on(host, '[data-price]', 'keydown', function (ev) {
      if (ev.key === 'Enter') submit();
    });
    ui.on(host, '[data-wishlist]', 'click', function () { App.app.showScreen('wishlist'); });
    ui.on(host, '[data-add]', 'click', function () { App.budget.openEntrySheet(); });

    /* Wishlist screen */
    var w = wishEl();
    ui.on(w, '[data-back]', 'click', function () { App.app.showMain('worthit'); });
    ui.on(w, '[data-buy]', 'click', function (ev, t) {
      var item = findWish(t.getAttribute('data-buy'));
      if (!item) return;
      store.update(function (s) {
        s.wishlist = s.wishlist.filter(function (x) { return x.id !== item.id; });
      });
      App.budget.openEntrySheet({ amount: item.price, note: item.name });
    });
    ui.on(w, '[data-drop]', 'click', function (ev, t) {
      var item = findWish(t.getAttribute('data-drop'));
      if (!item) return;
      store.update(function (s) {
        s.wishlist = s.wishlist.filter(function (x) { return x.id !== item.id; });
        s.decisions.push({
          id: store.uid('dec'), price: item.price, choice: 'dont',
          hours: fin.timeCostHours(item.price, s.settings),
          futureValue: fin.futureValue(item.price, s.settings),
          date: f.dayKey()
        });
      });
      ui.toast('Kept ' + f.money(item.price));
    });
  }

  function findWish(id) {
    var list = store.get().wishlist;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- verdict ---------- */

  function submit() {
    var host = el();
    var raw = ui.readNumber(host.querySelector('[data-price]'));
    if (raw <= 0) { ui.toast('Enter a price first'); return; }

    var taxInput = host.querySelector('[data-tax]');
    if (taxInput) {
      store.update(function (s) { s.settings.salesTax = ui.readNumber(taxInput); }, { skipRender: true });
    }

    var settings = store.get().settings;
    if (!fin.hourlyRate(settings)) {
      ui.toast('Add what you earn in Settings first');
      return;
    }

    var price = raw * (1 + salesTax() / 100);
    showVerdict(price);
  }

  function showVerdict(price) {
    var settings = store.get().settings;
    var hours = fin.timeCostHours(price, settings);
    var fv = fin.futureValue(price, settings);
    var years = fin.yearsToRetirement(settings);

    var body =
      '<div class="verdict">' +
        '<h3>Worth it?</h3>' +
        '<div class="stat">' +
          '<div class="cap">Time at Work</div>' +
          '<div class="val">' + f.duration(hours) + '</div>' +
        '</div>' +
        '<div class="stat">' +
          '<div class="cap">Invested Instead</div>' +
          '<div class="val money">' + f.moneyExact(fv) + '</div>' +
          '<div class="tiny muted" style="margin-top:4px">' +
            (years > 0
              ? 'in ' + years + (years === 1 ? ' year' : ' years') + ' at ' +
                (settings.returnRate || 0) + '% a year'
              : 'set a birthday in Settings to project this') +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn" data-dont>Don’t Buy</button>' +
          '<button class="btn btn-accent" data-buy>Buy</button>' +
        '</div>' +
        '<button class="btn btn-soft" data-unsure style="margin-top:10px">Unsure</button>' +
        '<div class="foot">' + f.money(price) + ' at ' +
          f.money(fin.hourlyRate(settings)) + ' an hour</div>' +
      '</div>';

    var m = ui.modal(body);

    function record(choice) {
      store.update(function (s) {
        s.decisions.push({
          id: store.uid('dec'),
          price: price,
          choice: choice,
          hours: hours,
          futureValue: fv,
          date: f.dayKey()
        });
      });
    }

    m.el.querySelector('[data-dont]').addEventListener('click', function () {
      record('dont');
      m.close();
      ui.toast('Kept ' + f.money(price) + ' — worth ' + f.moneyExact(fv) + ' later');
      clearPrice();
    });

    m.el.querySelector('[data-buy]').addEventListener('click', function () {
      record('buy');
      m.close();
      clearPrice();
      App.budget.openEntrySheet({ amount: Math.round(price * 100) / 100 });
    });

    m.el.querySelector('[data-unsure]').addEventListener('click', function () {
      m.close();
      askName(price);
    });
  }

  function clearPrice() {
    var input = el().querySelector('[data-price]');
    if (input) input.value = '';
  }

  /* Unsure items need a label, or the wishlist is a column of prices. */
  function askName(price) {
    var m = ui.modal(
      '<h3 style="font-size:20px;margin-bottom:6px">Save it for later</h3>' +
      '<p class="tiny muted" style="margin:0 0 14px">' +
        'It will wait on the Still want it? screen.</p>' +
      '<input class="field" data-name placeholder="What is it?" style="margin-bottom:12px">' +
      '<button class="btn" data-save>Save ' + f.money(price) + '</button>' +
      '<button class="btn btn-ghost" data-close style="margin-top:6px">Cancel</button>'
    );
    var input = m.el.querySelector('[data-name]');
    input.focus();

    function save() {
      var name = String(input.value || '').trim() || 'Unnamed item';
      store.update(function (s) {
        s.wishlist.push({ id: store.uid('wish'), name: name, price: price, savedAt: new Date().toISOString() });
        s.decisions.push({
          id: store.uid('dec'), price: price, choice: 'unsure',
          hours: fin.timeCostHours(price, s.settings),
          futureValue: fin.futureValue(price, s.settings),
          date: f.dayKey()
        });
      });
      m.close();
      clearPrice();
      ui.toast('Saved to Still want it?');
    }

    m.el.querySelector('[data-save]').addEventListener('click', save);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') save(); });
  }

  /* ---------- wishlist: "Still want it?" ---------- */

  function renderWishlist() {
    var host = wishEl();
    if (!host) return;
    var list = store.get().wishlist.slice().sort(function (a, b) {
      return a.savedAt < b.savedAt ? 1 : -1;
    });
    var settings = store.get().settings;

    var body = list.length
      ? '<div class="scroll">' + list.map(function (item) {
          return '<div class="list-item">' +
            '<span class="grow">' +
              '<span class="name">' + f.escape(item.name) + '</span>' +
              '<span class="sub">' + f.money(item.price) + ' · ' +
                f.hoursShort(fin.timeCostHours(item.price, settings)) + ' · saved ' +
                f.ago(item.savedAt) + '</span>' +
            '</span>' +
            '<button class="link" data-drop="' + item.id + '">Let go</button>' +
            '<button class="btn btn-sm btn-accent" style="width:auto;padding:0 14px;margin-left:10px" ' +
              'data-buy="' + item.id + '">Buy</button>' +
          '</div>';
        }).join('') + '</div>'
      : ui.emptyState(null,
          'Tap <b>Unsure</b> on the "Worth it" screen to save an item here.');

    host.innerHTML =
      '<h1 class="title" style="margin-top:26px">Still want it?</h1>' +
      body +
      '<button class="fab fab-center" data-back aria-label="Close">✕</button>';
  }

  return { render: render, bind: bind, renderWishlist: renderWishlist };
})();
