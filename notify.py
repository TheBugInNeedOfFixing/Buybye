#!/usr/bin/env python3
r"""BuyBye scheduled push sender.

A browser cannot wake itself on a schedule, so closed-app reminders need
something outside the browser to send them. That is this file.

It reads each user's reminder schedule and device tokens out of Firestore
and posts to the FCM HTTP v1 API for anything due in the last few minutes.

Run it every 15 minutes from Windows Task Scheduler:

    Program:   pythonw.exe
    Arguments: "C:\Users\aaron\Buybye\notify.py"

Setup:
    pip install google-auth requests
    Firebase console -> Project settings -> Service accounts
      -> Generate new private key -> save as serviceAccount.json here.

Check what it would do without sending anything:
    python notify.py --dry-run
"""

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT = os.path.join(HERE, 'serviceAccount.json')
STATE_FILE = os.path.join(HERE, '.notify-state.json')

SCOPES = ['https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/datastore']

# How late a reminder may be and still get sent. Matches a 15-minute cron
# with a little slack, so a missed run does not fire a stale reminder.
GRACE_MINUTES = 20

COPY = {
    'tracking':   ('Log today',       "Add what you spent today so the month stays honest."),
    'reflection': ('Month in review', "Look back at last month and set this one up."),
    'bills':      ('Bills due',       "Check your repeating expenses for today."),
}


def fail(message):
    print('error:', message, file=sys.stderr)
    sys.exit(1)


def load_credentials():
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
    except ImportError:
        fail('missing dependency: pip install google-auth requests')

    if not os.path.exists(SERVICE_ACCOUNT):
        fail('serviceAccount.json not found next to notify.py - see the docstring')

    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT, scopes=SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    with open(SERVICE_ACCOUNT) as fh:
        project_id = json.load(fh)['project_id']
    return creds, project_id


def firestore_get(creds, project_id, path):
    """Read a Firestore REST collection or document."""
    import requests
    url = ('https://firestore.googleapis.com/v1/projects/'
           f'{project_id}/databases/(default)/documents/{path}')
    r = requests.get(url, headers={'Authorization': f'Bearer {creds.token}'}, timeout=30)
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    return r.json()


def decode(value):
    """Unwrap one Firestore typed value into a plain Python value."""
    if 'stringValue' in value:  return value['stringValue']
    if 'integerValue' in value: return int(value['integerValue'])
    if 'doubleValue' in value:  return float(value['doubleValue'])
    if 'booleanValue' in value: return value['booleanValue']
    if 'nullValue' in value:    return None
    if 'mapValue' in value:
        return {k: decode(v) for k, v in value['mapValue'].get('fields', {}).items()}
    if 'arrayValue' in value:
        return [decode(v) for v in value['arrayValue'].get('values', [])]
    return None


def fields(doc):
    return {k: decode(v) for k, v in (doc.get('fields') or {}).items()}


def minutes_of(hhmm, default=540):
    try:
        h, m = str(hhmm).split(':')
        return int(h) * 60 + int(m)
    except Exception:
        return default


def load_sent():
    try:
        with open(STATE_FILE) as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_sent(state):
    try:
        with open(STATE_FILE, 'w') as fh:
            json.dump(state, fh)
    except OSError:
        pass


def due_reminders(notifications, now):
    """Which reminders are due right now, within the grace window."""
    out = []
    minutes_now = now.hour * 60 + now.minute

    def ready(target):
        delta = minutes_now - target
        return 0 <= delta <= GRACE_MINUTES

    tracking = notifications.get('tracking') or {}
    if tracking.get('on') and ready(minutes_of(tracking.get('time'), 1260)):
        out.append(('tracking', now.strftime('%Y-%m-%d')))

    bills = notifications.get('bills') or {}
    if bills.get('on') and ready(minutes_of(bills.get('time'))):
        out.append(('bills', now.strftime('%Y-%m-%d')))

    reflection = notifications.get('reflection') or {}
    if (reflection.get('on')
            and now.day == int(reflection.get('day') or 1)
            and ready(minutes_of(reflection.get('time'), 600))):
        out.append(('reflection', now.strftime('%Y-%m')))

    return out


def send(creds, project_id, token, title, body, dry_run):
    if dry_run:
        print(f'    would send "{title}" -> ...{token[-12:]}')
        return True

    import requests
    url = f'https://fcm.googleapis.com/v1/projects/{project_id}/messages:send'
    payload = {'message': {
        'token': token,
        'notification': {'title': title, 'body': body},
        'webpush': {
            'notification': {'icon': '/assets/icon.svg', 'tag': 'buybye'},
            'fcm_options': {'link': '/'},
        },
    }}
    r = requests.post(url, json=payload,
                      headers={'Authorization': f'Bearer {creds.token}'}, timeout=30)
    if r.status_code == 200:
        print(f'    sent "{title}" -> ...{token[-12:]}')
        return True
    # A 404 or 403 means the token is dead; nothing to do but skip it.
    print(f'    failed ({r.status_code}) ...{token[-12:]}: {r.text[:120]}', file=sys.stderr)
    return False


def main():
    parser = argparse.ArgumentParser(description='Send BuyBye reminder pushes that are due now.')
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be sent without sending')
    args = parser.parse_args()

    creds, project_id = load_credentials()
    now = dt.datetime.now()
    sent = load_sent()
    total = 0

    users = firestore_get(creds, project_id, 'users').get('documents', [])
    if not users:
        print('no users found in Firestore')
        return

    for user in users:
        uid = user['name'].rsplit('/', 1)[-1]
        data = fields(user)
        notifications = data.get('notifications') or {}
        pending = due_reminders(notifications, now)
        if not pending:
            continue

        devices = firestore_get(creds, project_id, f'users/{uid}/devices').get('documents', [])
        tokens = [fields(d).get('token') for d in devices]
        tokens = [t for t in tokens if t]
        if not tokens:
            print(f'{uid}: {len(pending)} due but no registered devices')
            continue

        for key, stamp in pending:
            for token in tokens:
                guard = f'{uid}:{key}:{stamp}:{token[-12:]}'
                if sent.get(guard):
                    continue
                title, body = COPY[key]
                print(f'{uid}: {key} due')
                if send(creds, project_id, token, title, body, args.dry_run):
                    total += 1
                    if not args.dry_run:
                        sent[guard] = now.isoformat()

    if not args.dry_run:
        # Keep the guard file from growing without bound.
        cutoff = (now - dt.timedelta(days=40)).isoformat()
        sent = {k: v for k, v in sent.items() if v > cutoff}
        save_sent(sent)

    print(f'{"would send" if args.dry_run else "sent"} {total} notification(s)')


if __name__ == '__main__':
    main()
