/* Copy this file to js/firebase-config.js and paste in your own keys.
   js/firebase-config.js is gitignored so your keys stay out of the repo.

   Firebase console -> Project settings -> General -> Your apps -> Web app
   gives you everything except vapidKey, which comes from
   Project settings -> Cloud Messaging -> Web Push certificates. */
window.FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
  vapidKey:          'YOUR_WEB_PUSH_CERTIFICATE_KEY'
};
