#!/bin/bash
cd /tmp/ops-dashboard
pkill -f "node src/server" 2>/dev/null || true
sleep 1
node src/server.js 2>&1 &
SERVER_PID=$!
sleep 3

PASS=0
FAIL=0

echo "=== 1. /health (public, no auth) ==="
R=$(curl -s http://localhost:18792/health)
if echo "$R" | grep -q '"ok":true'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 2. / (HTML serve) ==="
R=$(curl -s http://localhost:18792/ | head -1)
if echo "$R" | grep -qi "html\|DOCTYPE\|nexus"; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 3. /api/data (no auth → 401) ==="
R=$(curl -s http://localhost:18792/api/data)
if echo "$R" | grep -q "Unauthorized\|AUTH_REQUIRED"; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 4. /health/detailed (public) ==="
R=$(curl -s http://localhost:18792/health/detailed)
if echo "$R" | grep -q '"checks"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 5. /api/data (auth → data) ==="
R=$(curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18792/api/data)
if echo "$R" | grep -q '"ts"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 6. /api/cost/today (auth) ==="
R=$(curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18792/api/cost/today)
if echo "$R" | grep -q '"ok"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 7. /api/health/agents (auth) ==="
R=$(curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18792/api/health/agents)
if echo "$R" | grep -q '"agents"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 8. /api/cron/dag (auth) ==="
R=$(curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18792/api/cron/dag)
if echo "$R" | grep -q '"ok"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 9. /api/git/log (auth) ==="
R=$(curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18792/api/git/log)
if echo "$R" | grep -q '"ok"'; then echo "PASS"; PASS=$((PASS+1)); else echo "FAIL: $R"; FAIL=$((FAIL+1)); fi

echo "=== 10. X-Request-ID header ==="
R=$(curl -sI http://localhost:18792/health | grep -i "x-request-id")
if [ -n "$R" ]; then echo "PASS: $R"; PASS=$((PASS+1)); else echo "FAIL: no X-Request-ID"; FAIL=$((FAIL+1)); fi

echo ""
echo "RESULTS: $PASS passed, $FAIL failed"

kill $SERVER_PID 2>/dev/null
