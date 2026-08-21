#!/usr/bin/env python3
"""Deploy BuyBye to Firebase Hosting.

Serving the app from the Firebase domain is what makes Google sign-in work
on iOS. On a different domain from authDomain, Safari treats the sign-in
handshake as cross-site, drops the session on the way back, and reports
nothing at all.

Talks to the Hosting REST API directly so no Node toolchain is needed.
Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON or serviceAccount.json,
exactly as notify.py does.

    python deploy.py [--dry-run]
"""

import argparse
import gzip
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = PROJECT = 'buybye-6aef3'
API = 'https://firebasehosting.googleapis.com/v1beta1'

# Everything the browser needs, and nothing else. Notably not
# serviceAccount.json, which must never leave this machine.
INCLUDE_DIRS = ('css', 'js', 'assets')
INCLUDE_ROOT = ('index.html', 'manifest.webmanifest', 'sw.js',
                'firebase-messaging-sw.js')
SKIP_NAMES = {'serviceAccount.json'}

CACHE_RULES = [
    # App code must revalidate, or a browser keeps running a build that has
    # already been replaced.
    {'glob': '**/*.@(js|css|html|webmanifest)',
     'headers': {'Cache-Control': 'no-cache, must-revalidate'}},
    {'glob': '/sw.js',
     'headers': {'Cache-Control': 'no-cache, must-revalidate'}},
    {'glob': '**/*.@(png|svg|jpg|jpeg|ico|woff2)',
     'headers': {'Cache-Control': 'public, max-age=604800'}},
]


def fail(msg):
    print('error:', msg, file=sys.stderr)
    sys.exit(1)


def credentials():
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
    except ImportError:
        fail('missing dependency: pip install google-auth requests')

    scopes = ['https://www.googleapis.com/auth/cloud-platform']
    raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if raw:
        creds = service_account.Credentials.from_service_account_info(
            json.loads(raw), scopes=scopes)
    else:
        path = os.path.join(HERE, 'serviceAccount.json')
        if not os.path.exists(path):
            fail('no credentials: set GOOGLE_SERVICE_ACCOUNT_JSON or add serviceAccount.json')
        creds = service_account.Credentials.from_service_account_file(path, scopes=scopes)
    creds.refresh(google.auth.transport.requests.Request())
    return creds


def collect():
    """Every deployable file as {url_path: gzipped_bytes}."""
    out = {}

    def add(abs_path, url_path):
        with open(abs_path, 'rb') as fh:
            raw = fh.read()
        # Hosting stores and serves gzipped content; the hash is of the
        # compressed bytes, so compression settings must stay put.
        out[url_path] = gzip.compress(raw, 9)

    for name in INCLUDE_ROOT:
        p = os.path.join(HERE, name)
        if os.path.exists(p):
            add(p, '/' + name)

    for d in INCLUDE_DIRS:
        base = os.path.join(HERE, d)
        for root, _dirs, files in os.walk(base):
            for name in sorted(files):
                if name in SKIP_NAMES or name.startswith('.'):
                    continue
                abs_path = os.path.join(root, name)
                rel = os.path.relpath(abs_path, HERE).replace(os.sep, '/')
                add(abs_path, '/' + rel)

    return out


def main():
    ap = argparse.ArgumentParser(description='Deploy BuyBye to Firebase Hosting.')
    ap.add_argument('--dry-run', action='store_true',
                    help='list what would be uploaded and stop')
    args = ap.parse_args()

    import requests

    files = collect()
    hashes = {path: hashlib.sha256(blob).hexdigest() for path, blob in files.items()}
    total = sum(len(b) for b in files.values())
    print(f'{len(files)} files, {total/1024:.1f} KB compressed')

    if args.dry_run:
        for path in sorted(files):
            print(f'   {path:<42} {len(files[path]):>7} B')
        return

    creds = credentials()
    h = {'Authorization': 'Bearer ' + creds.token}

    # 1. A version is a staging area; nothing is public until it is released.
    r = requests.post(f'{API}/projects/{PROJECT}/sites/{SITE}/versions',
                      headers=h, json={'config': {'headers': CACHE_RULES}}, timeout=60)
    if r.status_code != 200:
        fail(f'could not create a version ({r.status_code}): {r.text[:300]}')
    version = r.json()['name']
    print('version:', version.split('/')[-1])

    # 2. Declare the file list; Hosting replies with what it does not have.
    r = requests.post(f'{API}/{version}:populateFiles',
                      headers=h, json={'files': hashes}, timeout=120)
    if r.status_code != 200:
        fail(f'populateFiles failed ({r.status_code}): {r.text[:300]}')
    body = r.json()
    required = body.get('uploadRequiredHashes') or []
    upload_url = body.get('uploadUrl')
    print(f'{len(required)} file(s) need uploading')

    # 3. Upload only those, by hash.
    by_hash = {}
    for path, digest in hashes.items():
        by_hash.setdefault(digest, path)

    for i, digest in enumerate(required, 1):
        path = by_hash.get(digest)
        if path is None:
            continue
        u = requests.post(f'{upload_url}/{digest}', headers={
            'Authorization': 'Bearer ' + creds.token,
            'Content-Type': 'application/octet-stream',
        }, data=files[path], timeout=120)
        if u.status_code not in (200, 204):
            fail(f'upload of {path} failed ({u.status_code}): {u.text[:200]}')
        print(f'   [{i}/{len(required)}] {path}')

    # 4. Seal the version, then point the live channel at it.
    r = requests.patch(f'{API}/{version}?update_mask=status',
                       headers=h, json={'status': 'FINALIZED'}, timeout=60)
    if r.status_code != 200:
        fail(f'finalize failed ({r.status_code}): {r.text[:300]}')

    r = requests.post(f'{API}/projects/{PROJECT}/sites/{SITE}/releases',
                      headers=h, params={'versionName': version}, timeout=60)
    if r.status_code != 200:
        fail(f'release failed ({r.status_code}): {r.text[:300]}')

    print(f'live at https://{SITE}.web.app')


if __name__ == '__main__':
    main()
