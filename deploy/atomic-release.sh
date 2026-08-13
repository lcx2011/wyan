#!/usr/bin/env bash
set -euo pipefail

root=/opt/wenyan
staging=${1:?staging directory is required}
release_name=${2:?release name is required}
release_dir="$root/releases/$release_name"
current="$root/current"

case "$staging" in
  "$root"/releases/.staging-*) ;;
  *) echo "invalid staging directory: $staging" >&2; exit 2 ;;
esac
case "$release_name" in
  wenyan-[0-9T-]*) ;;
  *) echo "invalid release name: $release_name" >&2; exit 2 ;;
esac

test -d "$staging"
test ! -e "$release_dir"
test -f "$staging/package.json"
test -f "$staging/package-lock.json"
test -f "$staging/dist/index.html"
test -f "$staging/dist-server/server/index.js"
test -f "$staging/dist-server/server/app.js"
test -d "$root/node_modules/fastify"
test -d "$root/node_modules/@fastify/cookie"
test -d "$root/node_modules/@fastify/static"
test -d "$root/node_modules/better-sqlite3"

(cd "$staging" && /usr/bin/node --input-type=module -e "await import('./dist-server/server/app.js')")

chown -R wenyan:wenyan "$staging"
find "$staging" -type d -exec chmod 0750 {} +
find "$staging" -type f -exec chmod 0640 {} +
mv "$staging" "$release_dir"

ln -s "$release_dir" "$root/current.next-$release_name"
mv -Tf "$root/current.next-$release_name" "$current"

systemctl daemon-reload
systemctl restart wenyan
systemctl is-active --quiet wenyan
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8878/api/health >/dev/null
echo "released $release_name"
