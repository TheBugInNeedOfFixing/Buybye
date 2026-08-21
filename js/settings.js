/* BuyBye — Settings: what you earn, how you project it, account and data. */
window.App = window.App || {};

App.settings = (function () {
  var f = App.format, ui = App.ui, store = App.store, fin = App.finance;

  function el() { return document.getElementById('screen-settings'); }

  function render() {
    var host = el();
    if (!host) return;
    var s = store.get().settings;
    var hourly = s.salaryType === 'hourly';

    var chips = f.CURRENCIES.map(function (c) {
      return '<button class="chip" aria-pressed="' + (c.code === s.currency) +
        '" data-cur="' + c.code + '">' + f.escape(c.symbol) + '</button>';
    }).join('');

    host.innerHTML =
      '<div class="topbar">' +
        '<div class="spacer"></div>' +
        '<button class="icon-btn" data-gear aria-label="Account and notifications">' +
          '<span class="glyph">⚙</span><span>More</span>' +
        '</button>' +
      '</div>' +
      '<div class="scroll">' +
        '<p class="tiny muted" style="margin:0 0 8px">Scroll for more currencies →</p>' +
        '<div class="chips">' + chips + '</div>' +

        '<div style="height:16px"></div>' +
        ui.switchRow('Hourly Mode', 'Show the budget in hours of work by default',
          s.hourlyMode, 'data-hourly-mode') +

        '<div style="height:16px"></div>' +
        '<div class="segmented">' +
          '<button aria-pressed="' + (!hourly) + '" data-type="yearly">Yearly Salary</button>' +
          '<button aria-pressed="' + hourly + '" data-type="hourly">Hourly Rate</button>' +
        '</div>' +
        '<input class="field field-lg" style="margin-top:14px" inputmode="decimal" data-amount ' +
          'value="' + f.escape(hourly ? s.hourlyRate : s.salary) + '" placeholder="0">' +
        '<p class="center tiny muted" style="margin:8px 0 0">' +
          'Works out at ' + f.moneyExact(fin.hourlyRate(s)) + ' an hour · ' +
          f.money(fin.monthlyTakeHome(s)) + ' a month after ' + Math.round(s.taxRate) + '% tax</p>' +

        '<label class="field-label">Investment return rate % ' +
          '<button class="link" data-info style="margin-left:4px">ⓘ</button></label>' +
        '<input class="field field-lg" inputmode="decimal" data-return value="' + s.returnRate + '">' +

        '<label class="field-label">Retirement age</label>' +
        '<input class="field field-lg" inputmode="numeric" data-retire value="' + s.retirementAge + '">' +

        '<label class="field-label">Birthday</label>' +
        '<input class="field field-lg" type="date" data-birthday value="' + f.escape(s.birthday) + '">' +

        '<label class="field-label">Tax rate %</label>' +
        '<input class="field field-lg" inputmode="decimal" data-tax value="' + s.taxRate + '">' +

        '<div style="height:22px"></div>' +
        '<button class="btn" data-save>Save Settings</button>' +
      '</div>';
  }

  function bind() {
    var host = el();

    ui.on(host, '[data-cur]', 'click', function (ev, t) {
      store.update(function (s) { s.settings.currency = t.getAttribute('data-cur'); });
    });

    ui.on(host, '[data-type]', 'click', function (ev, t) {
      var next = t.getAttribute('data-type');
      var amount = ui.readNumber(host.querySelector('[data-amount]'));
      store.update(function (s) {
        if (s.settings.salaryType === 'hourly') s.settings.hourlyRate = amount;
        else s.settings.salary = amount;
        s.settings.salaryType = next;
      });
    });

    ui.on(host, '[data-hourly-mode]', 'click', function (ev, t) {
      var on = t.getAttribute('aria-pressed') !== 'true';
      store.update(function (s) {
        s.settings.hourlyMode = on;
        s.ui.budgetMode = on ? 'time' : 'left';
      });
    });

    ui.on(host, '[data-info]', 'click', function () {
      ui.modal(
        '<h3 style="font-size:19px;margin-bottom:12px">Investment return rate</h3>' +
        '<p style="font-size:15px;line-height:1.5;margin:0 0 10px">' +
        'The yearly growth used to work out what a purchase could have become ' +
        'by the time you retire.</p>' +
        '<p style="font-size:15px;line-height:1.5;margin:0 0 18px">' +
        'A broad stock index has returned roughly 10% a year on average before ' +
        'inflation. It is an estimate, not a promise — real returns swing hard ' +
        'from year to year.</p>' +
        '<button class="btn" data-close>Got it</button>'
      );
    });

    ui.on(host, '[data-save]', 'click', function () {
      var amount = ui.readNumber(host.querySelector('[data-amount]'));
      store.update(function (s) {
        if (s.settings.salaryType === 'hourly') s.settings.hourlyRate = amount;
        else s.settings.salary = amount;
        s.settings.returnRate = ui.readNumber(host.querySelector('[data-return]'));
        s.settings.retirementAge = ui.readNumber(host.querySelector('[data-retire]')) || 65;
        s.settings.taxRate = ui.readNumber(host.querySelector('[data-tax]'));
        s.settings.birthday = host.querySelector('[data-birthday]').value;
      });
      ui.toast('Settings saved');
    });

    ui.on(host, '[data-gear]', 'click', openMore);
  }

  /* ---------- account / notifications / data ---------- */

  function accountHTML() {
    /* Offering a sign-in button while the saved session is still loading
       invites someone to sign in when they already are. */
    if (!App.auth.hasResolved()) {
      return '<p class="tiny muted" style="margin:0">Checking sign-in…</p>';
    }

    var user = App.auth.currentUser();
    if (user) {
      var status = App.sync.getStatus();
      var label = status === 'error' ? 'sync failed — will retry'
        : status === 'syncing' ? 'syncing…' : 'synced';
      return '<div class="list-item">' +
        ui.tile('👤', true) +
        '<span class="grow">' +
          '<span class="name">' + f.escape(user.displayName || user.email || 'Signed in') + '</span>' +
          '<span class="sub">' + f.escape(user.email || '') + ' · ' + label + '</span>' +
        '</span>' +
      '</div>' +
      '<button class="btn btn-soft btn-sm" data-signout style="margin-top:8px">Sign out</button>';
    }

    if (!App.auth.available()) {
      return '<p class="tiny muted" style="margin:0 0 10px">' +
        f.escape(App.auth.reason() || 'Sign-in unavailable') + '</p>' +
        '<p class="tiny muted" style="margin:0">Your budget is saved on this device either way.</p>';
    }

    return '<p class="tiny muted" style="margin:0 0 10px">' +
      'Sign in to back up your budget and reach it from any device.</p>' +
      '<button class="btn btn-google" data-signin>' + googleMark() + 'Continue with Google</button>';
  }

  function googleMark() {
    return '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.1h12c-.2 1.9-1.5 4.7-4.4 6.6l6.7 5.2C42.2 35.5 45 30.3 45 24z"/>' +
      '<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-7.1 5.5C8.1 41 15.4 46 24 46z"/>' +
      '<path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.8-2.9-.8-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.1-5.5z"/>' +
      '<path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.4 29.9 2 24 2 15.4 2 8.1 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-9 12.5-9z"/>' +
      '</svg>';
  }

  function openMore() {
    var body =
      '<div class="eyebrow" style="margin-bottom:10px">Account</div>' +
      '<div data-account>' + accountHTML() + '</div>' +
      '<div class="divider"></div>' +
      '<div class="eyebrow" style="margin-bottom:10px">Notifications</div>' +
      App.push.panelHTML() +
      '<div class="divider"></div>' +
      '<div class="eyebrow" style="margin-bottom:10px">Data</div>' +
      '<button class="btn btn-soft btn-sm" data-export>Export a copy</button>' +
      '<button class="btn btn-ghost btn-sm" data-reset style="margin-top:6px;color:var(--danger)">' +
        'Reset everything</button>' +
      '<div style="height:10px"></div>';

    var s = ui.sheet('More', body);
    App.push.bindPanel(s.el);

    /* The sheet is built once, so without this the account panel keeps
       showing whatever was true the instant it opened. */
    function refreshAccount() {
      var slot = s.el.querySelector('[data-account]');
      if (slot) slot.innerHTML = accountHTML();
    }
    var stopAuth = App.auth.onChange(refreshAccount);
    var stopSync = App.sync.onStatus(refreshAccount);
    var origClose = s.close;
    s.close = function () {
      if (stopAuth) stopAuth();
      if (stopSync) stopSync();
      origClose();
    };

    ui.on(s.el, '[data-signin]', 'click', function () {
      App.auth.signInWithGoogle().catch(function (e) {
        ui.toast(e && e.message ? e.message : 'Sign-in failed');
      });
    });

    ui.on(s.el, '[data-signout]', 'click', function () {
      App.auth.signOut().then(function () {
        s.close();
        ui.toast('Signed out');
      });
    });

    ui.on(s.el, '[data-export]', 'click', function () {
      exportData();
    });

    ui.on(s.el, '[data-reset]', 'click', function () {
      s.close();
      ui.confirm('Delete every budget, goal and setting on this device?', 'Reset', function () {
        store.reset();
        App.app.boot();
      });
    });
  }

  /* Opened in a new tab rather than downloaded — downloads are blocked in
     some embedded viewers, and this always works. */
  function exportData() {
    var text = JSON.stringify(store.get(), null, 2);
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var w = window.open(url, '_blank');
      if (!w) throw new Error('popup blocked');
      ui.toast('Opened your data in a new tab');
    } catch (e) {
      ui.modal(
        '<h3 style="font-size:19px;margin-bottom:10px">Your data</h3>' +
        '<textarea class="field" style="height:220px;font-size:12px" readonly>' +
          f.escape(text) + '</textarea>' +
        '<button class="btn" data-close style="margin-top:12px">Done</button>'
      );
    }
  }

  return { render: render, bind: bind, openMore: openMore, googleMark: googleMark };
})();
