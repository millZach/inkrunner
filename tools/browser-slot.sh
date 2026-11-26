#!/usr/bin/env bash
# Usage: tools/browser-slot.sh <command...>   e.g. tools/browser-slot.sh node tools/routes/summer-1.mjs both 3
# Runs one headless-browser job in one of two slots (Zach allowed two browsers at once, 2026-10-09).
# Waits for a free slot (/tmp/inkrunner-browser.lock or /tmp/inkrunner-browser-2.lock) and for at least 2.5 GB of
# available memory, then holds that slot's lock only while the command runs. Exits with the command's status.
# Scripts that take /tmp/inkrunner-browser.lock themselves (tools/journey.mjs) must not be wrapped.
set -u
[ $# -gt 0 ] || { echo "usage: tools/browser-slot.sh <command...>" >&2; exit 2; }
BUSY=75
while :; do
  avail=$(awk '/MemAvailable/ { print int($2 / 1024) }' /proc/meminfo)
  if [ "$avail" -ge 2500 ]; then
    for lock in /tmp/inkrunner-browser.lock /tmp/inkrunner-browser-2.lock; do
      flock -n -E $BUSY "$lock" "$@"
      code=$?
      [ $code -ne $BUSY ] && exit $code
    done
  fi
  sleep 3
done
