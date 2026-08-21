/* BuyBye — Firestore mirror of the local state.
   Local-first: localStorage always wins for reads. On sign-in the two
   sides are compared by updatedAt and the newer one is kept whole. */
window.App = window.App || {};

App.sync = (function () {
  var pushTimer = null;
  var status = 'off';          // off | idle | syncing | error
  var statusListeners = [];
  var suspended = false;       // true while applying a remote snapshot

  function setStatus(next) {
    status = next;
    statusListeners.forEach(function (fn) {
      try { fn(next); } catch (e) {}
    });
  }

  function onStatus(fn) {
    statusListeners.push(fn);
    fn(status);
    return function () {
      var i = statusListeners.indexOf(fn);
      if (i >= 0) statusListeners.splice(i, 1);
    };
  }

  function docRef() {
    var db = App.auth.db();
    var user = App.auth.currentUser();
    if (!db || !user) return null;
    return db.collection('users').doc(user.uid).collection('state').doc('current');
  }

  /* Strip the view-only bits — no reason to sync which month you were on. */
  function payload() {
    var s = JSON.parse(JSON.stringify(App.store.get()));
    delete s.ui;
    return s;
  }

  function pushNow() {
    var ref = docRef();
    if (!ref || suspended) return Promise.resolve();
    setStatus('syncing');
    return ref.set(payload(), { merge: false })
      .then(function () { setStatus('idle'); })
      .catch(function (e) {
        console.warn('sync push failed:', e && e.message);
        setStatus('error');
      });
  }

  function schedulePush() {
    if (!docRef() || suspended) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 2000);
  }

  /* Called once when a user signs in. */
  function pull() {
    var ref = docRef();
    if (!ref) return Promise.resolve();
    setStatus('syncing');

    return ref.get().then(function (snap) {
      var local = App.store.get();
      var remote = snap.exists ? snap.data() : null;

      if (!remote) {
        /* First sign-in on this account: keep whatever the guest built. */
        return pushNow();
      }

      var localStamp = Number(local.updatedAt || 0);
      var remoteStamp = Number(remote.updatedAt || 0);

      if (remoteStamp > localStamp) {
        suspended = true;
        remote.ui = local.ui;              // keep the current view
        App.store.replace(remote);
        suspended = false;
        setStatus('idle');
        return;
      }
      if (localStamp > remoteStamp) return pushNow();
      setStatus('idle');
    }).catch(function (e) {
      console.warn('sync pull failed:', e && e.message);
      setStatus('error');
    });
  }

  /* Device push token, stored beside the state so notify.py can find it. */
  function saveToken(token) {
    var db = App.auth.db();
    var user = App.auth.currentUser();
    if (!db || !user || !token) return Promise.resolve();
    return db.collection('users').doc(user.uid).collection('devices').doc(token).set({
      token: token,
      updatedAt: Date.now(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      ua: navigator.userAgent.slice(0, 180),
      notifications: App.store.get().notifications
    }).catch(function (e) {
      console.warn('token save failed:', e && e.message);
    });
  }

  /* Keep the stored schedule current so the sender stays in step. */
  function pushSchedules() {
    var db = App.auth.db();
    var user = App.auth.currentUser();
    if (!db || !user) return Promise.resolve();
    return db.collection('users').doc(user.uid).set({
      notifications: App.store.get().notifications,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      updatedAt: Date.now()
    }, { merge: true }).catch(function () {});
  }

  function start() {
    App.auth.onChange(function (user) {
      if (user) {
        setStatus('idle');
        pull().then(pushSchedules).then(function () {
          if (App.push.permission() === 'granted') App.push.registerToken();
        });
      } else {
        setStatus('off');
      }
    });
  }

  return {
    start: start,
    pull: pull,
    pushNow: pushNow,
    schedulePush: schedulePush,
    pushSchedules: pushSchedules,
    saveToken: saveToken,
    onStatus: onStatus,
    getStatus: function () { return status; }
  };
})();
