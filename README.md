# BuyBye

A money manager that prices everything twice: once in your currency, and
once in the hours of work and retirement savings it actually costs you.

No build step, no dependencies, no Node. Plain HTML, CSS and JavaScript.

## Running it

Double-click `index.html` and it works — onboarding, budgeting, the Worth it
maths, the daily challenge, all of it, stored on your device.

Two things need the app to be *served* rather than opened as a file, because
browsers give `file://` an opaque origin: **Google sign-in** and
**notifications**. To get those locally:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## The five tabs

| Tab | What it does |
| --- | --- |
| **Insights** | Where the money went, needs vs wants, month-by-month trend, goal progress, and the running total of what you talked yourself out of buying |
| **Worth it** | Type a price, get the verdict: hours of work, and what that money would be worth at retirement if invested instead. Buy / Don't Buy / Unsure |
| **Budget** | The month view. Income, Wants, Needs and Goals, with three display modes |
| **Daily** | A random daily allowance drawn from what's actually left in your Wants budget |
| **Settings** | Currency, salary, return rate, retirement age, birthday, account and data |

The Budget tab's top-left button cycles the display: money left → hours of
work left → money spent. The button is labelled with the mode you'd switch
*to*, not the one you're in.

## The maths

Everything derives from four formulas:

| Quantity | Formula |
| --- | --- |
| Hourly rate | `salary / 2080` (40h × 52w) |
| Time cost | `price / hourlyRate`, where a working day is 8 hours |
| Invested instead | `price × (1 + returnRate)^yearsToRetirement` |
| Monthly take-home | `salary / 12 × (1 − taxRate)` |

`yearsToRetirement` uses your **whole-number age**, the way a person states
it — a 17-year-old retiring at 65 has 48 years, not 47.6.

These are locked down by a self-test. Open the console and run:

```javascript
App.finance.selfTest()
```

It checks five values and prints a table. All five should pass.

## Google sign-in and cloud backup

Optional. Without it everything works, just only on this device.

1. Create a free project at <https://console.firebase.google.com>.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** (production mode is fine).
4. **Project settings → General → Your apps → Web app (`</>`)**. Register the
   app and copy the `firebaseConfig` values.
5. Paste them into `js/firebase-config.js` (copy `js/firebase-config.example.js`
   if it isn't there). Commit it — it has to ship with the site for sign-in to
   work, and these keys are public by design: they name your project rather
   than granting access to it. The Firestore rules below and the authorized
   domain list are what actually protect your data.
6. **Project settings → Cloud Messaging → Web Push certificates → Generate key
   pair**, and put that value in the same file as `vapidKey`.
7. Under **Authentication → Settings → Authorized domains**, add wherever you
   host it. `localhost` is already allowed.

`js/firebase-config.js` is the only file that holds these values — the
messaging service worker is handed its config at registration time rather
than keeping a second copy.

The one genuine secret is `serviceAccount.json` for `notify.py`. That grants
full admin access to the project and is gitignored; never commit it.

Lock Firestore down so each person only reaches their own data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Sync is local-first: `localStorage` is always the source of truth, Firestore
mirrors it about two seconds after any change. Signing in compares
`updatedAt` on both sides and keeps the newer one whole — so a guest who
builds a budget and signs in afterwards keeps it.

## Notifications

Three tiers, and it's worth being clear about which is which:

1. **In-app banner** — always works, no permission needed.
2. **Real OS notification while the app is open** — tap *Allow notifications*
   in Settings → More. Works on desktop and Android right away.
3. **Notifications with the app closed** — needs Web Push, which needs HTTPS,
   and on iPhone the app must be added to the Home Screen first (an iOS 16.4+
   rule). It also needs a sender, because **a browser cannot wake itself on a
   schedule** — that capability was proposed and never shipped.

`notify.py` is that sender. It reads your schedules and device tokens from
Firestore and posts anything due to FCM.

```bash
pip install google-auth requests tzdata
```

Download a service account key from **Project settings → Service accounts →
Generate new private key**, save it as `serviceAccount.json` here (gitignored),
then check what it would do:

```bash
python notify.py --dry-run
```

It takes credentials from `GOOGLE_SERVICE_ACCOUNT_JSON` if that is set, and
otherwise from `serviceAccount.json` beside it — the same file runs locally
and in the cloud with no changes.

### Where it runs

**On GitHub (the default).** `.github/workflows/reminders.yml` runs it every
15 minutes on GitHub's servers, so reminders arrive with every machine of
yours switched off. It needs one repository secret, `FIREBASE_SERVICE_ACCOUNT`,
holding the whole contents of `serviceAccount.json`: **Settings → Secrets and
variables → Actions → New repository secret**. Actions minutes are free and
unlimited on public repositories.

Two things to know about GitHub's scheduler. It delays runs when busy, so a
reminder can land some minutes late — hence the 45-minute grace window, and
the deliberately off-the-hour cron. And it **disables scheduled workflows
after 60 days without repository activity**, emailing you first; any commit
resets that clock.

**On your PC as well (optional).** A Task Scheduler entry running
`pythonw.exe notify.py` every 15 minutes fires more punctually when the
machine happens to be on. Running both is safe.

Nothing gets sent twice, because the already-sent guard lives on the user's
Firestore document rather than on either machine's disk. Whichever host gets
there first claims the reminder; every other host reads the guard and skips.
A reminder is claimed only after a send actually succeeds, so a total failure
is retried on the next run instead of being silently swallowed.

Times are evaluated in **the user's own timezone**, recorded by the app when
it saves the schedule. Without that a cloud runner would read its own UTC
clock and fire a 9:00 PM reminder at the wrong hour.

## Hosting

The app lives at **https://buybye-6aef3.firebaseapp.com** on Firebase Hosting.

That domain is not incidental, and it is specifically `firebaseapp.com`
rather than the `web.app` name for the same site. Two constraints have to
hold at once.

Google sign-in only survives if the app is served from the same origin as
`authDomain`. Hosted anywhere else, Safari
treats the sign-in handshake as cross-site, discards the session on the way
back, and reports **no error at all** — `getRedirectResult` simply returns
empty, so the app appears to bounce off the login screen for no reason. Any
host is fine for a guest-only build; only sign-in cares.

And `authDomain` has to be a domain registered as an OAuth redirect URI.
Firebase pre-registers `https://<project>.firebaseapp.com/__/auth/handler`
and nothing else, so pointing `authDomain` at the `web.app` name instead
fails at Google with *Access blocked: this app's request is invalid*. Both
names serve the same Hosting site, so using `firebaseapp.com` for both the
app and `authDomain` satisfies both constraints with no OAuth client
changes. Anyone arriving on `web.app` is redirected.

Deploy with:

```bash
python deploy.py
```

It talks to the Hosting REST API directly, so no Node toolchain is needed,
and takes credentials exactly as `notify.py` does. `--dry-run` lists what
would be uploaded. `.github/workflows/deploy.yml` runs the same script on
every push to `main`, so there is one deploy path rather than two that can
drift apart.

Cache headers are set at the origin: app code must revalidate, images may
sit in cache for a week. This matters more than it sounds. GitHub Pages sent
`max-age=600` for everything, and a service worker's own `fetch` is answered
from the browser HTTP cache — so a fix could deploy successfully while the
app kept running the broken build for another ten minutes.

Anything still loading the old GitHub Pages copy is redirected to the
canonical origin by a guard in `index.html`, so a stale Home Screen icon
recovers by itself rather than failing to sign in forever.

To put it on your phone: open the site in Safari, then Share → *Add to Home
Screen*. That step is what unlocks push notifications on iOS.

## One file instead of many

```bash
python build.py
```

Writes `dist/index.html` with every local script and stylesheet inlined —
one self-contained file you can open by double-click or host anywhere.
It embeds `js/firebase-config.js`, so `dist/` is gitignored; treat it as
private.

## Layout

```
index.html              tab shell
css/base.css            design tokens, reset, typography
css/components.css      cards, buttons, toggles, sheets, tab bar
js/format.js            currency, dates, durations
js/finance.js           all the maths, plus selfTest()
js/store.js             state, localStorage, derived totals
js/ui.js                overlays, delegation, markup helpers
js/auth.js              Google sign-in
js/sync.js              Firestore mirror
js/push.js              notification schedules and delivery
js/onboarding.js        the 8-step wizard
js/budget.js            month view and entry sheets
js/worthit.js           verdict and wishlist
js/daily.js             daily challenge
js/insights.js          stats
js/settings.js          settings, account, data
js/app.js               routing and boot
sw.js                   offline cache + push display
firebase-messaging-sw.js  FCM background handler (gets config from push.js)
notify.py               scheduled push sender (local or CI)
build.py                single-file bundler
```

Scripts are plain `<script>` tags rather than ES modules on purpose: modules
are blocked by CORS on `file://`, and double-click-to-open had to keep working.
Every module hangs off one global `App` object and they load in dependency
order.

## Notes

- Data lives in `localStorage` under `buybye.state.v1`. Settings → More →
  *Export a copy* dumps the lot as JSON.
- Service workers need a real browser tab; some embedded preview panes block
  them, and the app logs a warning and carries on without offline caching.
- The investment projection is an estimate, not a forecast. A broad index has
  averaged around 10% a year before inflation, but real returns swing hard.
