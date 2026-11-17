#!/usr/bin/env bash
# Starter den lokale server i baggrunden og venter, til den svarer (bruges i CI).
set -euo pipefail
node tools/server.mjs > server.log 2>&1 &
for i in $(seq 1 30); do
  if curl -fs http://localhost:8080/api/mig > /dev/null; then echo "Serveren kører"; exit 0; fi
  sleep 1
done
echo "Serveren startede ikke:"; cat server.log; exit 1
