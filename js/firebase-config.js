/* BuyBye — Firebase project configuration.

   These values are safe to commit: they identify the project, they do not
   grant access to it. Anyone loading the app can read them out of the
   JavaScript anyway. What actually protects your data is the Firestore
   security rule (a signed-in user can only touch users/{their own uid})
   plus the authorized-domain list in Firebase Authentication.

   The genuine secret is serviceAccount.json, used by notify.py. That one
   is gitignored and must never be committed. */
window.FIREBASE_CONFIG = {
  apiKey:            'AIzaSyB_iUynSgb76C1l1vYTvO61Kukvj5Ia7P0',
  authDomain:        'buybye-6aef3.firebaseapp.com',
  projectId:         'buybye-6aef3',
  storageBucket:     'buybye-6aef3.firebasestorage.app',
  messagingSenderId: '555191711109',
  appId:             '1:555191711109:web:2a036afa4842c77d79c0ec',
  vapidKey:          'BH2EEurqwYGBGv9_9T8RBL2CjCJued16ahwmHDN3yO2MXM5Ip76CZVv2ojGus0Pay_AT03hvHsX7auIX317YDKU'
};
