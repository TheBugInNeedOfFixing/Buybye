/* BuyBye — Google sign-in via Firebase Auth.
   Everything here is optional: with no config, or opened from file://,
   the app runs as a guest and nothing below is reached. */
window.App = window.App || {};

App.auth = (function () {
  var app = null;
  var ready = false;
  var resolved = false;
  var listeners = [];
  var user = null;
  var initError = null;

  function configured() {
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey.indexOf('YOUR_') !== 0 && c.projectId);
  }

  function sdkPresent() { return typeof window.firebase !== 'undefined' && !!window.firebase.initializeApp; }

  /* file:// has an opaque origin, which Firebase Auth rejects outright. */
  function originUsable() { return location.protocol === 'http:' || location.protocol === 'https:'; }

  function available() { return configured() && sdkPresent() && originUsable(); }

  function reason() {
    if (!sdkPresent()) return 'The Firebase SDK did not load — check your connection.';
    if (!configured()) return 'Add your Firebase keys to js/firebase-config.js to enable sign-in.';
    if (!originUsable()) return 'Sign-in needs the app served over http — run python -m http.server 8000.';
    return null;
  }

  function init() {
    if (ready || !available()) {
      initError = reason();
      return false;
    }
    try {
      app = firebase.initializeApp(window.FIREBASE_CONFIG);
      firebase.auth().onAuthStateChanged(function (u) {
        user = u;
        /* Firebase restores a saved session asynchronously. Until this has
           fired at least once, currentUser() being null means "not known
           yet", not "signed out" — and anything rendering from it will lie. */
        resolved = true;
        if (u) clearError();
        listeners.forEach(function (fn) {
          try { fn(u); } catch (e) { console.error(e); }
        });
      });
      ready = true;

      /* Keep the session across launches. IndexedDB can be unavailable in
         private browsing, so fall back rather than failing sign-in. */
      firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(function () {
          return firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
        })
        .catch(function () {});

      /* A redirect sign-in only completes when the result is collected on
         the way back in. Without this the app returns to the login screen
         having thrown away the credential — and any error with it. */
      firebase.auth().getRedirectResult()
        .then(function (result) {
          if (result && result.user) {
            clearError();
            clearPending();
            return;
          }
          /* We started a redirect and came back with no session and no
             error thrown. That is what a browser blocking the sign-in
             storage looks like: silent, and invisible without this. */
          if (pendingRedirect()) {
            clearPending();
            recordError('redirect-empty', {
              code: 'auth/redirect-returned-empty',
              message: 'Returned from Google without a session.'
            });
            notifyError();
          }
        })
        .catch(function (e) {
          clearPending();
          recordError('redirect', e);
          notifyError();
        });

      return true;
    } catch (e) {
      initError = e && e.message;
      console.warn('Firebase init failed:', initError);
      return false;
    }
  }

  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  /* Popups are unreliable on phones generally, not just installed iOS: a
     Safari tab may block the window, and an installed app has nowhere to
     put it. Redirect is the safer path for anything touch-driven. */
  function prefersRedirect() {
    var ua = navigator.userAgent;
    var mobile = /iPhone|iPod|Android|iPad/i.test(ua);
    /* iPadOS 13+ reports itself as a Mac, so touch points are the only
       reliable tell. Plain touchscreen laptops must not match here, or
       desktop loses the popup flow for no reason. */
    var iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return mobile || iPadOS || isStandalone();
  }

  var ERROR_KEY = 'buybye.authError';
  var PENDING_KEY = 'buybye.authPending';

  function pendingRedirect() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return false;
      var age = Date.now() - Number(raw);
      /* Anything older than ten minutes is a stale marker, not this trip.
         Returns a boolean deliberately: an age of zero is legitimate on a
         fast return, and would read as false if returned as a number. */
      return age >= 0 && age < 600000;
    } catch (e) { return false; }
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  }

  function recordError(stage, e) {
    var detail = {
      stage: stage,
      code: (e && e.code) || '',
      message: (e && e.message) || String(e),
      at: Date.now()
    };
    console.error('BuyBye auth [' + stage + ']:', detail.code, detail.message);
    try { localStorage.setItem(ERROR_KEY, JSON.stringify(detail)); } catch (err) {}
    return detail;
  }

  var errorListeners = [];

  function onError(fn) { errorListeners.push(fn); }

  function notifyError() {
    var err = lastError();
    if (!err) return;
    errorListeners.forEach(function (fn) {
      try { fn(err); } catch (e) {}
    });
  }

  function clearError() {
    try { localStorage.removeItem(ERROR_KEY); } catch (e) {}
  }

  /* Survives the redirect, so the login screen can explain what went wrong
     instead of silently showing itself again. */
  function lastError() {
    try {
      var raw = localStorage.getItem(ERROR_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* Firebase error codes are opaque to anyone who did not write them.
     Translate the ones this app can realistically hit. */
  var EXPLAIN = {
    'auth/unauthorized-domain':
      'This web address is not on the authorized domain list for this project.',
    'auth/web-storage-unsupported':
      'The browser is blocking the storage the sign-in needs. Private browsing, ' +
      'or blocked cross-site data, will both do this.',
    'auth/operation-not-supported-in-this-environment':
      'This browser will not run the sign-in method the app tried to use.',
    'auth/popup-blocked':
      'The browser blocked the sign-in window.',
    'auth/popup-closed-by-user':
      'The sign-in window closed before it finished.',
    'auth/cancelled-popup-request':
      'Another sign-in was already in progress.',
    'auth/network-request-failed':
      'The network request failed. Check the connection and try again.',
    'auth/invalid-api-key':
      'The Firebase API key in this build is not valid.',
    'auth/redirect-returned-empty':
      'The browser came back from Google without keeping the sign-in session. ' +
      'Safari blocks the cross-site storage this needs when the app and the ' +
      'sign-in service sit on different domains.',
    'auth/internal-error':
      'Firebase reported an internal error completing the sign-in.'
  };

  function explain(err) {
    if (!err) return '';
    if (EXPLAIN[err.code]) return EXPLAIN[err.code];
    /* Storage partitioning usually surfaces without a helpful code. */
    if (/storage|cookie|third.party/i.test(err.message || '')) {
      return 'The browser blocked the storage the sign-in needs, most likely ' +
             'because it restricts cross-site data.';
    }
    return err.message || 'Something went wrong during sign-in.';
  }

  function signInWithGoogle() {
    if (!ready && !init()) {
      return Promise.reject(new Error(initError || 'Sign-in unavailable'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    clearError();
    if (prefersRedirect()) {
      try { localStorage.setItem(PENDING_KEY, String(Date.now())); } catch (e) {}
      return firebase.auth().signInWithRedirect(provider).catch(function (e) {
        recordError('redirect-start', e);
        throw e;
      });
    }
    return firebase.auth().signInWithPopup(provider).catch(function (e) {
      /* Some desktop setups block the popup; fall back rather than dead-end. */
      if (e && (e.code === 'auth/popup-blocked' ||
                e.code === 'auth/operation-not-supported-in-this-environment')) {
        return firebase.auth().signInWithRedirect(provider);
      }
      recordError('popup', e);
      throw e;
    });
  }

  function signOut() {
    if (!ready) return Promise.resolve();
    return firebase.auth().signOut();
  }

  function currentUser() { return user; }

  /* True once the signed-in state is actually known. Without Firebase there
     is nothing to wait for, so that counts as resolved. */
  function hasResolved() { return resolved || !available(); }

  function onChange(fn) {
    listeners.push(fn);
    if (ready) fn(user);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function db() {
    if (!ready) return null;
    try { return firebase.firestore(); } catch (e) { return null; }
  }

  /* Messaging needs a service worker; resolves to null when unavailable. */
  function messaging() {
    if (!ready || !firebase.messaging || !firebase.messaging.isSupported) {
      return Promise.resolve(null);
    }
    return Promise.resolve(firebase.messaging.isSupported()).then(function (ok) {
      if (!ok) return null;
      try { return firebase.messaging(); } catch (e) { return null; }
    });
  }

  return {
    configured: configured,
    sdkPresent: sdkPresent,
    available: available,
    reason: reason,
    init: init,
    signInWithGoogle: signInWithGoogle,
    lastError: lastError,
    onError: onError,
    notifyError: notifyError,
    pendingRedirect: pendingRedirect,
    explain: explain,
    clearError: clearError,
    recordError: recordError,
    prefersRedirect: prefersRedirect,
    isStandalone: isStandalone,
    signOut: signOut,
    currentUser: currentUser,
    hasResolved: hasResolved,
    onChange: onChange,
    db: db,
    messaging: messaging,
    isReady: function () { return ready; }
  };
})();
