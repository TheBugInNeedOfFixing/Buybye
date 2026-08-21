/* BuyBye — boot, routing and the sign-in screen. */
window.App = window.App || {};

App.app = (function () {
  var f = App.format, ui = App.ui, store = App.store;

  var TABS = ['insights', 'worthit', 'budget', 'daily', 'settings'];
  var MODULES = {
    insights: function () { return App.insights; },
    worthit:  function () { return App.worthit; },
    budget:   function () { return App.budget; },
    daily:    function () { return App.daily; },
    settings: function () { return App.settings; }
  };

  var current = 'budget';
  var booted = false;

  function screenEl(name) { return document.getElementById('screen-' + name); }

  function showScreen(name) {
    ui.qsa('.screen').forEach(function (s) { s.classList.remove('is-active'); });
    var target = screenEl(name);
    if (target) target.classList.add('is-active');
    current = name;

    var isTab = TABS.indexOf(name) >= 0;
    document.getElementById('tabbar').classList.toggle('hidden', !isTab);

    ui.qsa('#tabbar button').forEach(function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-tab') === name ? 'true' : 'false');
    });

    renderCurrent();
  }

  function showMain(tab) { showScreen(tab || 'budget'); }

  function renderCurrent() {
    if (current === 'wishlist') { App.worthit.renderWishlist(); return; }
    if (current === 'onboarding' || current === 'auth') return;
    var mod = MODULES[current];
    if (mod && mod()) mod().render();
  }

  /* ---------- sign-in screen ---------- */

  function renderAuth() {
    var host = screenEl('auth');
    var can = App.auth.available();

    /* A failed redirect lands back here with no other trace, so say what
       happened rather than just showing the same buttons again. */
    var err = App.auth.lastError();
    var errHTML = '';
    if (err) {
      errHTML =
        '<div class="notice" style="margin-bottom:10px">' +
          '<b>Sign-in did not complete.</b><br>' +
          f.escape(App.auth.explain(err)) +
          '<div class="tiny muted" style="margin-top:8px">' +
            f.escape(err.code || err.message || '') + '</div>' +
          '<button class="act" data-auth-dismiss>Dismiss</button>' +
        '</div>';
    }

    host.innerHTML =
      '<div class="auth-wrap">' +
        '<div class="brand">BuyBye</div>' +
        '<p class="brand-sub">Know what things really cost you</p>' +
        errHTML +
        (can
          ? '<button class="btn btn-google" data-google>' + App.settings.googleMark() +
            'Continue with Google</button>'
          : '<div class="notice" style="margin-bottom:10px">' + f.escape(App.auth.reason()) + '</div>') +
        '<button class="btn ' + (can ? 'btn-soft' : '') + '" data-guest>' +
          'Continue without an account</button>' +
        '<p class="tiny muted center" style="margin-top:18px">' +
          'Your budget is stored on this device. Signing in also backs it up ' +
          'so you can pick it up on your phone.</p>' +
      '</div>';
  }

  function bindAuth() {
    var host = screenEl('auth');
    ui.on(host, '[data-google]', 'click', function () {
      App.auth.signInWithGoogle().catch(function (e) {
        ui.toast(e && e.message ? e.message : 'Sign-in failed');
      });
    });
    ui.on(host, '[data-auth-dismiss]', 'click', function () {
      App.auth.clearError();
      renderAuth();
      bindAuth();
    });
    ui.on(host, '[data-guest]', 'click', function () {
      store.update(function (s) { s.ui.authSeen = true; });
      route();
    });
  }

  /* ---------- routing ---------- */

  function route() {
    var s = store.get();
    if (!s.ui.authSeen && !App.auth.currentUser()) {
      renderAuth();
      showScreen('auth');
      return;
    }
    if (!s.onboarding.complete) {
      showScreen('onboarding');
      App.onboarding.mount();
      return;
    }
    showMain(TABS.indexOf(current) >= 0 ? current : 'budget');
  }

  /* ---------- boot ---------- */

  function boot() {
    store.load();

    if (!booted) {
      booted = true;

      bindAuth();
      App.budget.bind();
      App.worthit.bind();
      App.daily.bind();
      App.insights.bind();
      App.settings.bind();

      ui.on(document.getElementById('tabbar'), '[data-tab]', 'click', function (ev, t) {
        showMain(t.getAttribute('data-tab'));
      });

      /* Re-render whatever is on screen whenever state moves. */
      store.subscribe(function () { renderCurrent(); });

      App.auth.init();
      App.sync.start();

      App.auth.onChange(function (user) {
        if (user) {
          store.update(function (s) { s.ui.authSeen = true; }, { skipSync: true, skipRender: true });
          if (current === 'auth') route();
        }
        renderCurrent();
      });

      App.push.startTimer();
      registerServiceWorker();
    }

    if (store.get().settings.hourlyMode && !store.get().ui.budgetMode) {
      store.update(function (s) { s.ui.budgetMode = 'time'; }, { skipRender: true });
    }

    route();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('service worker not registered:', e && e.message);
    });
  }

  return {
    boot: boot,
    route: route,
    showScreen: showScreen,
    showMain: showMain,
    renderCurrent: renderCurrent,
    TABS: TABS
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.app.boot();
});
