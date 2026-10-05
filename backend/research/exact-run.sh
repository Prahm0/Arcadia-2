#!/bin/sh
# Exact optimal comparison (amendment 6): export, solve and score in chunks of 100.
# sh research/exact-run.sh <from> <to> <outdir>
set -e
FROM=$1; TO=$2; OUT=$3; PY=${PYTHON:-python3}
mkdir -p "$OUT"
s=$FROM
while [ $s -le $TO ]; do
  e=$((s + 99)); [ $e -gt $TO ] && e=$TO
  FULL=1 node research/exact.mjs export $s $e > "$OUT/problems-$s.json" 2>/dev/null
  $PY research/analysis/exact_solve.py "$OUT/problems-$s.json" "$OUT/solutions-$s.json" 120 2>> "$OUT/solver.log"
  FULL=1 node research/exact.mjs eval "$OUT/solutions-$s.json" 2>/dev/null > "$OUT/results-$s.csv"
  rm "$OUT/problems-$s.json"
  echo "done $s-$e" >> "$OUT/progress.log"
  s=$((e + 1))
done
