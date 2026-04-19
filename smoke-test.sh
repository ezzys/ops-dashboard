#!/bin/bash
set -e
cd /tmp/ops-dashboard

# Start server in background
node src/server.js &
SERVER_PID=$!
sleep 3

echo "=== /health ==="
curl -s http://localhost:18791/health
echo ""

echo "=== /api/data (no auth - should 401) ==="
curl -s http://localhost:18791/api/data
echo ""

echo "=== /health/detailed (auth) ==="
curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18791/health/detailed | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:{'ok':v.get('ok')} for k,v in d.get('checks',{}).items()}, indent=2))"
echo ""

echo "=== / (HTML) ==="
curl -s http://localhost:18791/ | head -3
echo ""

echo "=== Rate limit (5 quick requests) ==="
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code} " http://localhost:18791/api/data
done
echo ""

kill $SERVER_PID 2>/dev/null
echo "=== Done ==="
