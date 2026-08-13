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

previous_release=$(readlink -f "$current")
next_link="$root/current.next-$release_name"
rollback_link="$root/current.rollback-$release_name"
rm -f "$next_link" "$rollback_link"
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" "$current"

rollback() {
  echo "release health check failed; rolling back to $previous_release" >&2
  rm -f "$rollback_link"
  ln -s "$previous_release" "$rollback_link"
  mv -Tf "$rollback_link" "$current"
  systemctl daemon-reload
  systemctl restart wenyan || true
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8878/api/health >/dev/null; then
      echo "rollback completed: $previous_release" >&2
      return 0
    fi
    sleep 1
  done
  echo "rollback health check failed" >&2
  return 1
}

systemctl daemon-reload
if ! systemctl restart wenyan; then
  rollback || true
  exit 1
fi

healthy=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:8878/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -ne 1 ]; then
  rollback || true
  exit 1
fi

echo "released $release_name"
