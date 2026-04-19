#!/bin/bash
cd /tmp/ops-dashboard
pkill -f "node src/server.js" 2>/dev/null || true
sleep 1
node src/server.js &
SERVER_PID=$!
sleep 3

echo "=== /health ==="
curl -s http://localhost:18791/health
echo ""

echo "=== /health/detailed ==="
curl -s http://localhost:18791/health/detailed | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k:{'ok':v.get('ok')} for k,v in d.get('checks',{}).items()}, indent=2))"
echo ""

echo "=== /api/data (no auth) ==="
curl -s http://localhost:18791/api/data | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','NO ERROR'))"
echo ""

echo "=== /api/data (auth) ==="
curl -s -H "Authorization: Bearer 52700a12570c54a80cb138b0d2322deb7238875879541ce6" http://localhost:18791/api/data | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:', d.get('status') is not None, 'ts:', d.get('ts'))"
echo ""

echo "=== / (HTML) ==="
curl -s http://localhost:18791/ | head -2

kill $SERVER_PID 2>/dev/null
echo "=== Done ==="
