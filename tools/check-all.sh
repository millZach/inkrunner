#!/usr/bin/env bash
# Usage: tools/check-all.sh [step ...]   (env URL, default the local dev server; OUT, default shots/checks)
# Every check the campaign brief names, one browser at a time (each browser step takes /tmp/inkrunner-browser.lock).
# Logs go to $OUT/<step>.log and one line per step to $OUT/summary.txt. Exits 1 if any step failed.
# With step names, runs only those (e.g. tools/check-all.sh route-summer-1 perf-summer-gate).
set -u
cd "$(dirname "$0")/.."
export URL="${URL:-http://localhost:5173/}"
OUT="${OUT:-shots/checks}"
LOCK=/tmp/inkrunner-browser.lock
mkdir -p "$OUT"
: > "$OUT/summary.txt"
fails=0

step() { # step <name> <timeout> <browser:0|1> <command...>
  local name=$1 limit=$2 browser=$3; shift 3
  if [ ${#ONLY[@]} -gt 0 ] && [[ ! " ${ONLY[*]} " == *" $name "* ]]; then return; fi
  local t0=$SECONDS code
  if [ "$browser" = 1 ]; then timeout "$limit" flock "$LOCK" "$@" > "$OUT/$name.log" 2>&1
  else timeout "$limit" "$@" > "$OUT/$name.log" 2>&1; fi
  code=$?
  local verdict=PASS; [ $code -ne 0 ] && { verdict="FAIL (exit $code)"; fails=$((fails + 1)); }
  printf '%-22s %-14s %4ds  %s\n' "$name" "$verdict" $((SECONDS - t0)) "$(grep -v '^\s*$' "$OUT/$name.log" | tail -1 | cut -c1-110)" | tee -a "$OUT/summary.txt"
}
ONLY=("$@")

step tsc            5m 0 npx tsc --noEmit
step unit           5m 0 npm test
step check-art      5m 0 node tools/check-art.mjs
step ramp           2m 0 node tools/ramp.mjs
step build          5m 0 npm run build
step proof-portal  20m 1 node tools/proofs/portal.mjs all
step proof-rain    20m 1 node tools/proofs/rain.mjs both
step proof-raijin  20m 1 node tools/proofs/raijin.mjs all
step proof-map     20m 1 node tools/proofs/map.mjs
step proof-cutscene 20m 1 node tools/proofs/cutscene.mjs
step route-first   20m 1 node tools/routes/first.mjs both 3
step route-summer-1 40m 1 env STRICT=1 node tools/routes/summer-1.mjs both 3 both
step route-summer-2 40m 1 env CHAR=both node tools/routes/summer-2.mjs both 3
step route-summer-3 40m 1 node tools/routes/summer-3.mjs both 3 both
step route-summer-4 40m 1 node tools/routes/summer-4.mjs both 3 both
step route-summer-gate 50m 1 node tools/routes/summer-gate.mjs both 3
step regress       20m 1 node tools/shot.mjs regress
step campaign-path 30m 1 node tools/campaign-path.mjs
step ios-smoke     30m 1 npm run test:ios
for lv in summer-1 summer-2 summer-3 summer-4 summer-gate; do
  for ch in ren kohaku; do
    step "perf-$lv-$ch" 10m 1 env LEVEL=$lv CHAR=$ch SECONDS=20 node tools/perf.mjs
  done
done

echo "---- $fails step(s) failed" | tee -a "$OUT/summary.txt"
[ $fails -eq 0 ]
