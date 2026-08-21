#!/usr/bin/env python3
"""Inline every local CSS and JS file into one self-contained dist/index.html.

The modular source is what you edit; this produces a single file you can
open by double-click, mail to yourself, or publish anywhere static.

    python build.py

Remote <script src="https://..."> tags (the Firebase SDK) are left alone.
js/firebase-config.js is inlined, so treat dist/ as private - it is
gitignored for that reason.
"""

import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, 'dist')
OUT_FILE = os.path.join(OUT_DIR, 'index.html')

LINK_RE = re.compile(r'[ \t]*<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>\s*\n?')
SCRIPT_RE = re.compile(r'[ \t]*<script[^>]*src="([^"]+)"[^>]*>\s*</script>\s*\n?')


def read(rel):
    path = os.path.join(HERE, rel)
    if not os.path.exists(path):
        return None
    with io.open(path, encoding='utf-8') as fh:
        return fh.read()


def is_remote(href):
    return href.startswith('http://') or href.startswith('https://') or href.startswith('//')


def main():
    html = read('index.html')
    if html is None:
        print('error: index.html not found', file=sys.stderr)
        return 1

    inlined = {'css': 0, 'js': 0, 'skipped': 0, 'missing': []}

    def css_sub(match):
        href = match.group(1)
        if is_remote(href):
            return match.group(0)
        body = read(href)
        if body is None:
            inlined['missing'].append(href)
            return match.group(0)
        inlined['css'] += 1
        return '<style>\n/* ' + href + ' */\n' + body + '\n</style>\n'

    def js_sub(match):
        src = match.group(1)
        if is_remote(src):
            inlined['skipped'] += 1
            return match.group(0)
        body = read(src)
        if body is None:
            inlined['missing'].append(src)
            return ''            # a missing optional file should not 404 in dist
        inlined['js'] += 1
        # Guard against a stray </script> inside a string literal.
        body = body.replace('</script>', r'<\/script>')
        return '<script>\n/* ' + src + ' */\n' + body + '\n</script>\n'

    html = LINK_RE.sub(css_sub, html)
    html = SCRIPT_RE.sub(js_sub, html)

    # The service worker cannot be inlined; a single file has nothing to register.
    html = html.replace("navigator.serviceWorker.register('sw.js')",
                        "Promise.reject(new Error('bundled build has no service worker'))")

    os.makedirs(OUT_DIR, exist_ok=True)
    with io.open(OUT_FILE, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(html)

    size = os.path.getsize(OUT_FILE)
    print(f'wrote {os.path.relpath(OUT_FILE, HERE)}  ({size/1024:.1f} KB)')
    print(f'  inlined {inlined["css"]} stylesheet(s), {inlined["js"]} script(s); '
          f'left {inlined["skipped"]} remote script(s) alone')
    for miss in inlined['missing']:
        print(f'  note: {miss} not found, skipped')
    return 0


if __name__ == '__main__':
    sys.exit(main())
