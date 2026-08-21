/* FCM background handler. Must sit at the site root of the app's scope.

   It receives its Firebase config as query parameters from push.js rather
   than hardcoding it, so your keys live in exactly one gitignored file
   (js/firebase-config.js) and never enter the repository. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

var params = new URL(location).searchParams;
var config = {
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId')
};

if (config.apiKey && config.projectId) {
  firebase.initializeApp(config);
  var messaging = firebase.messaging();

  messaging.onBackgroundMessage(function (payload) {
    var n = payload.notification || {};
    self.registration.showNotification(n.title || 'BuyBye', {
      body: n.body || '',
      icon: './assets/icon.svg',
      badge: './assets/icon.svg',
      tag: n.tag || 'buybye'
    });
  });
} else {
  /* Registered without config — nothing to listen for. */
  console.warn('firebase-messaging-sw: no config supplied, background push inactive');
}
