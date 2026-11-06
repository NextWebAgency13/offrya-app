#!/usr/bin/env bash
# Keep the marketplace available when antivirus cannot start.
# DCE import itself FAILS CLOSED if the scanner is unavailable or stale.
set -Eeuo pipefail
install -d -o clamav -g clamav -m 0770 /run/clamav
install -d -o clamav -g clamav -m 0750 /var/lib/clamav /var/log/clamav
(
  while true; do
    gosu clamav freshclam --stdout --quiet || echo "[DCE] Signature refresh unsuccessful; imports stay locked if scanner is not ready."
    gosu clamav /usr/sbin/clamd --config-file=/etc/clamav/clamd-offrya.conf || echo "[DCE] clamd stopped; imports fail closed."
    sleep 20
  done
) &
scanner_supervisor=$!
(
  sleep 1800
  while true; do
    gosu clamav freshclam --stdout --quiet || echo "[DCE] Signature update unsuccessful."
    sleep 7200
  done
) &
signature_updater=$!
gosu node node /app/server.js &
app_pid=$!
shutdown(){
  kill "$app_pid" "$scanner_supervisor" "$signature_updater" 2>/dev/null || true
  wait "$app_pid" "$scanner_supervisor" "$signature_updater" 2>/dev/null || true
}
trap shutdown TERM INT
wait "$app_pid" || exit $?
shutdown
