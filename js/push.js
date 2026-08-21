/* BuyBye — notifications.
   Three tiers, in order of how much they need from the outside world:
     1. in-app banner      — always works
     2. Notification API   — real OS notification while the app is open
     3. Web Push via FCM    — arrives with the app closed; needs HTTPS, and on
                              iOS the app must be on the Home Screen.
   The browser cannot wake itself on a schedule, so tier 3 is delivered by
   notify.py, which reads these same schedules out of Firestore. */
window.App = window.App || {};

App.push = (function () {
  var FIRED_KEY = 'buybye.lastFired';
  var timer = null;

  function supported() { return typeof Notification !== 'undefined'; }
  function permission() { return supported() ? Notification.permission : 'unsupported'; }

  function lastFired() {
    try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setFired(key, stamp) {
    var all = lastFired();
    all[key] = stamp;
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(all)); } catch (e) {}
  }

  /* ---------- panel markup (shared by onboarding + settings) ---------- */

  function noticeHTML() {
    var p = permission();
    if (p === 'unsupported') {
      return '<div class="notice">This browser does not support notifications. ' +
        'BuyBye will still show reminders inside the app.</div>';
    }
    if (p === 'granted') {
      return '<div class="notice">Notifications are on. Reminders fire while BuyBye is open. ' +
        'For reminders with the app closed, add BuyBye to your Home Screen ' +
        'and keep the push sender running.</div>';
    }
    if (p === 'denied') {
      return '<div class="notice">Notifications are blocked for BuyBye. ' +
        'Re-enable them in your browser’s site settings, then reload.' +
        '<button class="act" data-notif-help>How to unblock</button></div>';
    }
    return '<div class="notice">Notifications are currently disabled for BuyBye. ' +
      'To enable reminders, allow notifications below.' +
      '<button class="act" data-notif-ask>Allow notifications</button></div>';
  }

  function row(key, heading, sub, label, time, on) {
    return '<div style="margin-bottom:18px">' +
      '<div style="font-weight:800;font-size:17px">' + heading + '</div>' +
      '<div class="tiny muted" style="margin:2px 0 10px">' + sub + '</div>' +
      '<div class="switch-row">' +
        '<div class="label" style="flex:1">' + label + '</div>' +
        '<input type="time" class="time-chip" data-notif-time="' + key + '" value="' + time + '">' +
        '<button class="switch" aria-pressed="' + (on ? 'true' : 'false') +
          '" data-notif-on="' + key + '"></button>' +
      '</div>' +
    '</div>';
  }

  function innerHTML() {
    var n = App.store.get().notifications;
    return noticeHTML() +
      '<div class="card">' +
        row('tracking', 'Tracking', 'Daily reminders to input the day’s expenses',
            'Daily', n.tracking.time, n.tracking.on) +
        row('reflection', 'Reflection', 'Reflect on last month and tweak next month’s budget',
            'Monthly on the 1st', n.reflection.time, n.reflection.on) +
        row('bills', 'Reminders', 'Reminders for your repeating expenses',
            'Bills', n.bills.time, n.bills.on) +
      '</div>';
  }

  function panelHTML() {
    return '<div data-notif-panel>' + innerHTML() + '</div>';
  }

  function refreshPanels() {
    App.ui.qsa('[data-notif-panel]').forEach(function (panel) {
      panel.innerHTML = innerHTML();
    });
  }

  function bindPanel(scope, onChange) {
    function commit(mutate) {
      var next = JSON.parse(JSON.stringify(App.store.get().notifications));
      mutate(next);
      App.store.update(function (s) { s.notifications = next; }, { skipRender: true });
      if (onChange) onChange(next);
      return next;
    }

    App.ui.on(scope, '[data-notif-on]', 'click', function (ev, t) {
      var key = t.getAttribute('data-notif-on');
      var turningOn = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', turningOn ? 'true' : 'false');
      commit(function (n) { n[key].on = turningOn; });
      if (turningOn) ask();
    });

    App.ui.on(scope, '[data-notif-time]', 'change', function (ev, t) {
      var key = t.getAttribute('data-notif-time');
      commit(function (n) { n[key].time = t.value || '09:00'; });
    });

    App.ui.on(scope, '[data-notif-ask]', 'click', function () { ask(true); });

    App.ui.on(scope, '[data-notif-help]', 'click', function () {
      App.ui.modal(
        '<h3 style="font-size:19px;margin-bottom:12px">Unblocking notifications</h3>' +
        '<p style="font-size:15px;line-height:1.5;margin:0 0 8px">' +
        'Notifications were blocked for this site, so the browser will not ask again.</p>' +
        '<p style="font-size:15px;line-height:1.5;margin:0 0 18px">' +
        'Open the padlock or settings icon in the address bar, find Notifications, ' +
        'set it back to Allow, then reload BuyBye.</p>' +
        '<button class="btn" data-close>Got it</button>'
      );
    });
  }

  /* ---------- permission + device token ---------- */

  function ask(loud) {
    if (!supported()) {
      if (loud) App.ui.toast('This browser has no notification support');
      return Promise.resolve('unsupported');
    }
    if (Notification.permission === 'granted') {
      registerToken();
      return Promise.resolve('granted');
    }
    if (Notification.permission === 'denied') {
      if (loud) App.ui.toast('Notifications are blocked in site settings');
      return Promise.resolve('denied');
    }
    return Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        App.ui.toast('Notifications on');
        registerToken();
      }
      refreshPanels();
      return p;
    });
  }

  /* Registers this device for Web Push and stores the token beside the
     user schedule so notify.py can find it. No-ops without Firebase. */
  function registerToken() {
    if (!App.auth || !App.auth.messaging) return Promise.resolve(null);
    return App.auth.messaging().then(function (messaging) {
      if (!messaging) return null;
      var key = (window.FIREBASE_CONFIG || {}).vapidKey;
      if (!key) return null;
      return messaging.getToken({ vapidKey: key }).then(function (token) {
        if (token && App.sync && App.sync.saveToken) App.sync.saveToken(token);
        return token;
      });
    }).catch(function (e) {
      console.warn('push token unavailable:', e && e.message);
      return null;
    });
  }

  /* ---------- scheduling while the app is open ---------- */

  function minutesNow(d) { return d.getHours() * 60 + d.getMinutes(); }

  function toMinutes(hhmm) {
    var bits = String(hhmm || '09:00').split(':');
    return Number(bits[0]) * 60 + Number(bits[1]);
  }

  var COPY = {
    tracking:   { title: 'Log today', body: 'Add what you spent today so the month stays honest.' },
    reflection: { title: 'Month in review', body: 'Look back at last month and set this one up.' },
    bills:      { title: 'Bills due', body: 'Check your repeating expenses for today.' }
  };

  /* Returns the reminders that are due now and have not fired yet. */
  function due(now) {
    var n = App.store.get().notifications;
    var fired = lastFired();
    var d = now || new Date();
    var today = App.format.dayKey(d);
    var month = App.format.monthKey(d);
    var out = [];

    if (n.tracking.on && minutesNow(d) >= toMinutes(n.tracking.time) && fired.tracking !== today) {
      out.push({ key: 'tracking', stamp: today });
    }
    if (n.bills.on && minutesNow(d) >= toMinutes(n.bills.time) && fired.bills !== today) {
      out.push({ key: 'bills', stamp: today });
    }
    if (n.reflection.on && d.getDate() === (n.reflection.day || 1) &&
        minutesNow(d) >= toMinutes(n.reflection.time) && fired.reflection !== month) {
      out.push({ key: 'reflection', stamp: month });
    }
    return out;
  }

  function deliver(item) {
    var copy = COPY[item.key];
    setFired(item.key, item.stamp);

    if (permission() === 'granted') {
      try {
        new Notification(copy.title, { body: copy.body, tag: 'buybye-' + item.key });
      } catch (e) { /* some browsers require a service worker registration */ }
    }
    showBanner(copy.title + ' — ' + copy.body);
  }

  function showBanner(text) {
    var host = document.getElementById('banner-host');
    if (!host) return;
    host.innerHTML = '<div class="banner"><span>' + App.format.escape(text) + '</span>' +
      '<button class="x" data-banner-close aria-label="Dismiss">×</button></div>';
    host.querySelector('[data-banner-close]').addEventListener('click', function () {
      host.innerHTML = '';
    });
  }

  function check() {
    due().forEach(deliver);
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    check();
    timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
  }

  return {
    supported: supported,
    permission: permission,
    panelHTML: panelHTML,
    innerHTML: innerHTML,
    refreshPanels: refreshPanels,
    bindPanel: bindPanel,
    ask: ask,
    registerToken: registerToken,
    due: due,
    check: check,
    showBanner: showBanner,
    startTimer: startTimer
  };
})();
