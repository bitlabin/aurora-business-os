#!/usr/bin/env bash
# Runs a throwaway PostgreSQL 16 cluster from locally installed binaries when Docker is not
# available (CI runners and some sandboxes). Produces the same two roles as the Docker image.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDIR="$ROOT/.pglocal"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT:-5432}"
# PostgreSQL refuses to run as root; in root sandboxes/CI run the server as the `postgres` user.
RUN=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -r -s /bin/false postgres
  mkdir -p "$PGDIR" && chown postgres "$PGDIR"
  RUN="runuser -u postgres --"
fi
case "${1:-start}" in
  start)
    if [ ! -d "$PGDIR/data" ]; then
      mkdir -p "$PGDIR"
      $RUN "$PGBIN/initdb" -D "$PGDIR/data" -U aurora_admin --auth=trust -E UTF8 >"$PGDIR/initdb.log" 2>&1
      echo "unix_socket_directories = '$PGDIR'" >> "$PGDIR/data/postgresql.conf"
      echo "listen_addresses = '127.0.0.1'" >> "$PGDIR/data/postgresql.conf"
      echo "port = $PORT" >> "$PGDIR/data/postgresql.conf"
    fi
    $RUN "$PGBIN/pg_ctl" -D "$PGDIR/data" -l "$PGDIR/server.log" -w start
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U aurora_admin -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='aurora'" | grep -q 1 \
      || "$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U aurora_admin aurora
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U aurora_admin -d aurora -v ON_ERROR_STOP=1 -f "$ROOT/infra/docker/postgres-init/01-roles.sql" >/dev/null
    echo "postgres ready on 127.0.0.1:$PORT (admin: aurora_admin, app: aurora_app)"
    ;;
  stop)
    $RUN "$PGBIN/pg_ctl" -D "$PGDIR/data" -w stop || true
    ;;
  reset)
    $RUN "$PGBIN/pg_ctl" -D "$PGDIR/data" -w stop || true
    rm -rf "$PGDIR"
    ;;
  *) echo "usage: pg-local.sh start|stop|reset"; exit 1;;
esac
