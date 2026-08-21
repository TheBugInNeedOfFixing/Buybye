/* BuyBye — Google sign-in via Firebase Auth.
   Everything here is optional: with no config, or opened from file://,
   the app runs as a guest and nothing below is reached. */
window.App = window.App || {};

App.auth = (function () {
  var app = null;
  var ready = false;
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
        listeners.forEach(function (fn) {
          try { fn(u); } catch (e) { console.error(e); }
        });
      });
      ready = true;
      return true;
    } catch (e) {
      initError = e && e.message;
      console.warn('Firebase init failed:', initError);
      return false;
    }
  }

  function isStandaloneIOS() {
    var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return iOS && (window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));
  }

  function signInWithGoogle() {
    if (!ready && !init()) {
      return Promise.reject(new Error(initError || 'Sign-in unavailable'));
    }
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    /* Popups are unreliable inside an installed iOS PWA. */
    if (isStandaloneIOS()) return firebase.auth().signInWithRedirect(provider);
    return firebase.auth().signInWithPopup(provider);
  }

  function signOut() {
    if (!ready) return Promise.resolve();
    return firebase.auth().signOut();
  }

  function currentUser() { return user; }

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
    signOut: signOut,
    currentUser: currentUser,
    onChange: onChange,
    db: db,
    messaging: messaging,
    isReady: function () { return ready; }
  };
})();
