#!/usr/bin/env python3
r"""BuyBye scheduled push sender.

A browser cannot wake itself on a schedule, so closed-app reminders need
something outside the browser to send them. That is this file.

It reads each user's reminder schedule and device tokens out of Firestore
and posts to the FCM HTTP v1 API for anything due right now.

Credentials, in order of preference:
    GOOGLE_SERVICE_ACCOUNT_JSON  environment variable holding the key JSON
                                 (this is how GitHub Actions supplies it)
    serviceAccount.json          a file next to this script (local runs)

The "already sent" guard lives in Firestore, not on disk, so several hosts
can run this concurrently without doubling up. A laptop task and a GitHub
Actions cron can both be active; whichever arrives first wins and the other
sees the guard and skips.

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

# Where a tapped notification should open. Absolute, because the click is
# handled outside any page that could resolve a relative path.
APP_URL = os.environ.get('BUYBYE_APP_URL', 'https://buybye-6aef3.web.app')

SCOPES = ['https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/datastore']

# How late a reminder may be and still get sent. GitHub delays scheduled
# workflows under load, so this is generous by default; past the window a
# reminder is dropped rather than delivered hours stale.
GRACE_MINUTES = int(os.environ.get('BUYBYE_GRACE_MINUTES', '45'))

COPY = {
    'tracking':   ('Log today',       'Add what you spent today so the month stays honest.'),
    'reflection': ('Month in review', 'Look back at last month and set this one up.'),
    'bills':      ('Bills due',       'Check your repeating expenses for today.'),
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

    raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if raw:
        try:
            info = json.loads(raw)
        except ValueError:
            fail('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON')
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        project_id = info['project_id']
    elif os.path.exists(SERVICE_ACCOUNT):
        creds = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT, scopes=SCOPES)
        with open(SERVICE_ACCOUNT) as fh:
            project_id = json.load(fh)['project_id']
    else:
        fail('no credentials: set GOOGLE_SERVICE_ACCOUNT_JSON or add serviceAccount.json')

    creds.refresh(google.auth.transport.requests.Request())
    return creds, project_id


BASE = 'https://firestore.googleapis.com/v1/projects'


def firestore_get(creds, project_id, path):
    """Read a Firestore REST collection or document."""
    import requests
    url = f'{BASE}/{project_id}/databases/(default)/documents/{path}'
    r = requests.get(url, headers={'Authorization': f'Bearer {creds.token}'}, timeout=30)
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    return r.json()


def firestore_patch(creds, project_id, path, field_name, value):
    """Write a single top-level field, leaving the rest of the doc alone."""
    import requests
    url = (f'{BASE}/{project_id}/databases/(default)/documents/{path}'
           f'?updateMask.fieldPaths={field_name}')
    body = {'fields': {field_name: encode(value)}}
    r = requests.patch(url, json=body,
                       headers={'Authorization': f'Bearer {creds.token}'}, timeout=30)
    if r.status_code != 200:
        print(f'    warning: guard write failed ({r.status_code}): {r.text[:120]}',
              file=sys.stderr)
        return False
    return True


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


def encode(value):
    """Wrap a plain Python value as a Firestore typed value."""
    if value is None:              return {'nullValue': None}
    if isinstance(value, bool):    return {'booleanValue': value}
    if isinstance(value, int):     return {'integerValue': str(value)}
    if isinstance(value, float):   return {'doubleValue': value}
    if isinstance(value, dict):
        return {'mapValue': {'fields': {k: encode(v) for k, v in value.items()}}}
    if isinstance(value, (list, tuple)):
        return {'arrayValue': {'values': [encode(v) for v in value]}}
    return {'stringValue': str(value)}


def fields(doc):
    return {k: decode(v) for k, v in (doc.get('fields') or {}).items()}


def minutes_of(hhmm, default=540):
    try:
        h, m = str(hhmm).split(':')
        return int(h) * 60 + int(m)
    except Exception:
        return default


def user_now(tz_name):
    """Current time in the user's own timezone.

    This matters because a cloud runner's clock is UTC, and a reminder set
    for 9:00 PM means 9:00 PM where the person actually lives. The timezone
    is recorded by the app when it saves the schedule. If it is missing or
    unknown, fall back to this machine's local time.
    """
    if tz_name:
        try:
            from zoneinfo import ZoneInfo
            return dt.datetime.now(ZoneInfo(tz_name))
        except Exception:
            print(f'    warning: unknown timezone {tz_name!r}, using local time',
                  file=sys.stderr)
    return dt.datetime.now()


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
            'notification': {'icon': APP_URL + '/assets/icon.svg', 'tag': 'buybye'},
            'fcm_options': {'link': APP_URL + '/'},
        },
    }}
    r = requests.post(url, json=payload,
                      headers={'Authorization': f'Bearer {creds.token}'}, timeout=30)
    if r.status_code == 200:
        print(f'    sent "{title}" -> ...{token[-12:]}')
        return True
    # 404 or 403 means the token is dead; nothing to do but skip it.
    print(f'    failed ({r.status_code}) ...{token[-12:]}: {r.text[:160]}', file=sys.stderr)
    return False


def main():
    parser = argparse.ArgumentParser(
        description='Send BuyBye reminder pushes that are due now.')
    parser.add_argument('--dry-run', action='store_true',
                        help='report what would be sent without sending')
    args = parser.parse_args()

    creds, project_id = load_credentials()
    total = 0

    users = firestore_get(creds, project_id, 'users').get('documents', [])
    if not users:
        print('no users found in Firestore '
              '(sign in on the app and allow notifications to register one)')
        return

    for user in users:
        uid = user['name'].rsplit('/', 1)[-1]
        data = fields(user)
        notifications = data.get('notifications') or {}

        now = user_now(data.get('tz'))
        pending = due_reminders(notifications, now)
        if not pending:
            continue

        # The guard lives on the user doc, so any host sees the same state.
        last_sent = data.get('lastSent') or {}
        pending = [(k, s) for k, s in pending if last_sent.get(k) != s]
        if not pending:
            print(f'{uid}: due, but already sent')
            continue

        devices = firestore_get(creds, project_id, f'users/{uid}/devices').get('documents', [])
        tokens = [t for t in (fields(d).get('token') for d in devices) if t]
        if not tokens:
            print(f'{uid}: {len(pending)} due but no registered devices')
            continue

        for key, stamp in pending:
            title, body = COPY[key]
            print(f'{uid}: {key} due')
            delivered = False
            for token in tokens:
                if send(creds, project_id, token, title, body, args.dry_run):
                    delivered = True
                    total += 1
            # Claim it only once something actually went out, so a total
            # failure is retried on the next run rather than silently lost.
            if delivered and not args.dry_run:
                last_sent[key] = stamp
                firestore_patch(creds, project_id, f'users/{uid}', 'lastSent', last_sent)

    print(f'{"would send" if args.dry_run else "sent"} {total} notification(s)')


if __name__ == '__main__':
    main()
