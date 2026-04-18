# NEXUS v2 — Setup Guide

NEXUS is an AI Agent Operations Dashboard for monitoring cost, health, and behavior of OpenClaw-managed agents. This guide covers installation, configuration, and deployment.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ (22 recommended) | Required |
| npm | 8+ | Bundled with Node.js |
| OpenClaw | Any | Provides session data and CLI commands |
| better-sqlite3 | (auto-installed) | Requires native build tools |

### Native build tools (for better-sqlite3)

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install build-essential python3
```

**Windows:** Install Visual Studio Build Tools with the "Desktop development with C++" workload.

---

## Installation

```bash
git clone https://github.com/ezzys/ops-dashboard.git
cd ops-dashboard
npm install
```

Verify the install:
```bash
node --version     # should print v18 or higher
node -e "require('./src/server.js')" 2>&1 | head -5
```

---

## Configuration

All configuration lives in `nexus-config.json` in the project root. The server reads this file at startup and fails fast on missing required fields.

### Minimal required config

```json
{
  "port": 18790,
  "host": "0.0.0.0",
  "auth": {
    "token": "your-secret-token-here"
  },
  "budgets": {
    "dailyUsd": 5.00,
    "monthlyUsd": 100.00
  },
  "modelPrices": {
    "default": { "input": 0.30, "output": 1.20, "cacheRead": 0.06, "cacheWrite": 0.10 }
  }
}
```

### Full annotated config

```json
{
  "port": 18790,
  "host": "0.0.0.0",

  "auth": {
    "token": "52700a12570c54a80cb138b0d2322deb7238875879541ce6"
  },

  "budgets": {
    "dailyUsd": 1.00,
    "monthlyUsd": 30.00
  },

  "thresholds": {
    "stuckMinutes": 5,
    "warnHeartbeatMs": 120000,
    "errorHeartbeatMs": 30000
  },

  "rateLimit": {
    "windowMs": 60000,
    "max": 100
  },

  "retention": {
    "days": 30
  },

  "circuitBreaker": {
    "failThreshold": 3,
    "cooldownMs": 60000
  },

  "paths": {
    "canvasHtml": "/Users/openclaw/.openclaw/canvas/index.html",
    "openclawNode": "/opt/homebrew/opt/node@22/bin/node",
    "openclawCli": "/opt/homebrew/bin/openclaw",
    "researchDir": "/Users/openclaw/.openclaw/workspace/research",
    "sessionDb": "/Users/openclaw/.openclaw/data/sessions.db"
  },

  "modelPrices": {
    "claude-opus-4-6":          { "input": 15.00, "output": 75.00,  "cacheRead": 1.50, "cacheWrite": 18.75 },
    "claude-sonnet-4-6":        { "input": 3.00,  "output": 15.00,  "cacheRead": 0.30, "cacheWrite": 3.75  },
    "claude-haiku-4-5-20251001":{ "input": 0.80,  "output": 4.00,   "cacheRead": 0.08, "cacheWrite": 1.00  },
    "MiniMax-M2.7":             { "input": 0.30,  "output": 1.20,   "cacheRead": 0.06, "cacheWrite": 0.10  },
    "default":                  { "input": 0.30,  "output": 1.20,   "cacheRead": 0.06, "cacheWrite": 0.10  }
  },

  "websocket": {
    "rooms": ["cost-events", "health-events", "logs", "events"]
  },

  "agentHealth": {
    "mode": "alert-only",
    "agents": {}
  }
}
```

### Field reference

#### `port` / `host`
The TCP port and bind address for the HTTP server. Use `"0.0.0.0"` to listen on all interfaces. Override with `NEXUS_PORT` env var.

#### `auth.token`
Bearer token required on all `/api/*` requests. Generate a strong random value:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Override with `NEXUS_TOKEN` env var (recommended for production — keeps the secret out of the config file).

#### `budgets`
- `dailyUsd` — daily spend cap in USD. Budget bars and alerts are calculated against this value.
- `monthlyUsd` — monthly spend cap in USD.

Alert thresholds: 50% (info), 80% (warn), 95% (critical), 100% (blocked).

#### `thresholds`
- `stuckMinutes` — minutes without a heartbeat before an agent is marked **stuck** (default: 5).
- `warnHeartbeatMs` — milliseconds of silence before status becomes **warning** (default: 120 000 = 2 min).
- `errorHeartbeatMs` — milliseconds used internally for error-level staleness (default: 30 000 = 30 s).

#### `modelPrices`
Per-model pricing in USD per million tokens. Fields:
- `input` — prompt tokens
- `output` — completion tokens
- `cacheRead` — prompt cache read tokens
- `cacheWrite` — prompt cache write tokens

A `"default"` key is used as fallback for any model not explicitly listed.

#### `rateLimit`
- `windowMs` — rolling window in milliseconds (default: 60 000 = 1 min).
- `max` — maximum requests per IP per window (default: 100).

Exceeding the limit returns HTTP 429.

#### `retention.days`
How many days of event data to keep in `data/events.db`. Pruning runs every 6 hours. Default: 30.

#### `circuitBreaker`
- `failThreshold` — consecutive failures before tripping (default: 3).
- `cooldownMs` — milliseconds before retry after trip (default: 60 000).

#### `paths`
| Field | Purpose |
|-------|---------|
| `canvasHtml` | Preferred path for dashboard HTML (OpenClaw canvas). Falls back to `index.html` in project root. |
| `openclawNode` | Absolute path to the Node.js binary used by OpenClaw. |
| `openclawCli` | Absolute path to the `openclaw` CLI binary. Used by recovery, intervention, and skill routes. |
| `researchDir` | OpenClaw research workspace directory. |
| `sessionDb` | Path to OpenClaw's SQLite session database (`sessions.db`). The dashboard reads this for cost aggregation and agent health. |

To find your OpenClaw paths:
```bash
which openclaw
which node
ls ~/.openclaw/data/sessions.db
```

#### `websocket.rooms`
Array of valid WebSocket room names. Clients subscribe to a single room per connection. Do not remove existing rooms — the frontend subscribes to all four:
- `cost-events` — cost aggregation updates (30 s interval)
- `health-events` — agent health updates (30 s interval)
- `logs` — live event stream as events are ingested
- `events` — bidirectional event ingestion channel

#### `agentHealth`
- `mode` — global default behaviour: `"alert-only"` | `"auto-restart"` | `"manual"`.
- `agents` — per-agent overrides keyed by agent ID:
  ```json
  "agents": {
    "my-agent-id": { "autoRestart": true }
  }
  ```

---

## Starting the server

```bash
# Foreground (recommended for first run)
node src/server.js

# npm shortcut
npm start

# Custom port
NEXUS_PORT=8080 node src/server.js

# Custom token (overrides nexus-config.json)
NEXUS_TOKEN=mysecret node src/server.js
```

On successful startup you will see JSON log lines on stderr:

```
{"level":"info","ts":"...","port":18790,"host":"0.0.0.0","ws":"/ws?room=<room>","msg":"NEXUS Dashboard started"}
{"level":"info","ts":"...","msg":"Cost Shield aggregator started"}
{"level":"info","ts":"...","msg":"Agent health monitor started"}
{"level":"info","ts":"...","msg":"Event store initialised (WAL mode, pruning active)"}
```

Open a browser at `http://localhost:18790` (no auth required for the dashboard UI).

---

## Environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXUS_TOKEN` | Override `auth.token` from config | `NEXUS_TOKEN=abc123 node src/server.js` |
| `NEXUS_PORT` | Override `port` from config | `NEXUS_PORT=8080 npm start` |
| `NEXUS_CONFIG` | Not currently used — edit `nexus-config.json` directly | — |

For production, set `NEXUS_TOKEN` in your process manager or systemd unit file instead of embedding the token in `nexus-config.json`.

---

## Connecting to OpenClaw

NEXUS discovers OpenClaw data through two channels:

**1. Session database (preferred)**

Set `paths.sessionDb` to the absolute path of `sessions.db`. NEXUS reads this SQLite file directly via `better-sqlite3`. The database must be readable by the user running NEXUS.

```bash
# Verify the path
ls -la /Users/openclaw/.openclaw/data/sessions.db
```

**2. CLI fallback**

If `sessions.db` is not present or unreadable, NEXUS falls back to running `openclaw status` via `paths.openclawCli`. Set `paths.openclawCli` to the absolute path of the `openclaw` binary.

When neither is available, the dashboard starts cleanly but shows empty state (no agents, no cost data). All other features (event store, replay, prompts, orchestration) continue to work.

---

## Running as a system service

### macOS launchd

A plist template is included at `com.ai.openclaw.ops-dashboard.plist`. Copy it to `~/Library/LaunchAgents/` and load it:

```bash
cp com.ai.openclaw.ops-dashboard.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ai.openclaw.ops-dashboard.plist
```

### systemd (Linux)

```ini
# /etc/systemd/system/nexus-dashboard.service
[Unit]
Description=NEXUS Ops Dashboard
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/ops-dashboard/src/server.js
WorkingDirectory=/opt/ops-dashboard
Restart=on-failure
Environment=NEXUS_TOKEN=your-secret-token
User=openclaw
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now nexus-dashboard
```

---

## Reverse proxy (production)

NEXUS does not handle TLS. Put it behind nginx or Caddy.

### nginx

```nginx
server {
    listen 443 ssl;
    server_name dashboard.example.com;

    ssl_certificate     /etc/ssl/certs/dashboard.crt;
    ssl_certificate_key /etc/ssl/private/dashboard.key;

    location / {
        proxy_pass http://127.0.0.1:18790;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

**Important:** The `proxy_read_timeout 86400` and the `Upgrade`/`Connection` headers are required for WebSocket long-polling to work correctly.

### Caddy

```
dashboard.example.com {
    reverse_proxy localhost:18790
}
```

Caddy handles WebSocket upgrades automatically.

---

## Troubleshooting

### Server fails to start: `Config missing auth.token`
`nexus-config.json` is missing the `auth.token` field or the file cannot be read. Check the file exists and is valid JSON:
```bash
node -e "JSON.parse(require('fs').readFileSync('nexus-config.json','utf8'))"
```

### `better-sqlite3` install fails
Native compilation failed. Install build tools (see Prerequisites), then:
```bash
npm rebuild better-sqlite3
```

### Cost data is always $0.00
`paths.sessionDb` does not point to a valid `sessions.db` file. NEXUS falls back to the CLI — check `paths.openclawCli` is correct and that `openclaw status` runs without errors.

### Agents tab shows empty state
Same root cause as cost data — `sessions.db` not found or unreadable.

### WebSocket disconnects immediately
The `room` query parameter is missing or not in `websocket.rooms`, or the `token` is wrong. The server closes the connection with HTTP 400 or 401 before the upgrade completes.

### API returns 401
All `/api/*` calls require `Authorization: Bearer <token>`. Confirm the token in your request matches `auth.token` in config (or `NEXUS_TOKEN` env var).

### API returns 429
Rate limit exceeded (default: 100 req/min per IP). Reduce polling frequency or increase `rateLimit.max`.

### Port already in use
Another process is using the port. Change `port` in config or set `NEXUS_PORT`:
```bash
lsof -i :18790
NEXUS_PORT=18791 npm start
```
