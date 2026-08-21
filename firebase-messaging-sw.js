/* FCM background handler. Must sit at the site root to be found.
   Keep the config here in step with js/firebase-config.js. */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

/* Replace with your own values — service workers cannot read the page config. */
firebase.initializeApp({
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID'
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'BuyBye', {
    body: n.body || '',
    icon: './assets/icon.svg',
    tag: 'buybye'
  });
});
