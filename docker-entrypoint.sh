#!/bin/sh
set -eu

PUID="${PUID:-$(id -u hedgesight)}"
PGID="${PGID:-$(id -g hedgesight)}"

case "$PUID:$PGID" in
  *[!0-9:]*|:*|*:)
    echo "PUID and PGID must be numeric values." >&2
    exit 1
    ;;
esac

if [ "$PGID" != "$(id -g hedgesight)" ]; then
  groupmod -o -g "$PGID" hedgesight
fi

if [ "$PUID" != "$(id -u hedgesight)" ]; then
  usermod -o -u "$PUID" -g "$PGID" hedgesight
else
  usermod -g "$PGID" hedgesight
fi

if ! su-exec hedgesight test -w /data; then
  echo "HedgeSight cannot write to /data as PUID=$PUID PGID=$PGID. Check the bind mount permissions." >&2
  exit 1
fi

exec su-exec hedgesight "$@"
