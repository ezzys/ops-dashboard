# NEXUS: Next-Generation AI Agent Operations Dashboard

## Creative Brief v1.0

---

## Vision Statement

**NEXUS** is not a monitoring dashboard—it's a **mission control center** for AI agent ecosystems. Where traditional ops tools show you what happened, NEXUS shows you what's happening *right now* across every agent, model, token, and workflow in real-time. It's designed for the era of multi-agent orchestration where a single user request might spawn a dozen specialized agents working in parallel, each calling different models, invoking different skills, and contributing to a shared goal.

The aesthetic is **"NASA meets Cyberpunk"**: dark, data-dense, with glowing accent lines that trace agent conversations like neural pathways. Information hierarchy is cinematic—ambient glows indicate system health at a glance, while drill-down reveals surgical precision data.

---

## Design Language

### Color Palette
- **Background Deep**: `#0B0E14` (near-black with blue undertone)
- **Background Surface**: `#131820` (card backgrounds)
- **Background Elevated**: `#1A2030` (modals, dropdowns)
- **Border Subtle**: `#252B3B` (dividers, card borders)
- **Border Active**: `#3B4459` (hover states)
- **Text Primary**: `#E8ECF4` (headings, important values)
- **Text Secondary**: `#8892A8` (labels, descriptions)
- **Text Muted**: `#545E75` (timestamps, metadata)
- **Accent Cyan**: `#00D4FF` (primary actions, active flows)
- **Accent Magenta**: `#FF2E88` (alerts, cost, errors)
- **Accent Green**: `#00FF94` (success, healthy, active)
- **Accent Amber**: `#FFB800` (warnings, in-progress)
- **Accent Purple**: `#A855F7` (AI/ML related elements)
- **Glow Cyan**: `rgba(0, 212, 255, 0.15)` (ambient glows)

### Typography
- **Display/Headers**: `JetBrains Mono` (monospace for that ops terminal feel)
- **Body/Labels**: `Inter` (clean, readable at small sizes)
- **Data/Numbers**: `JetBrains Mono` (tabular alignment)
- **Scale**: 10px (micro labels) → 12px (body) → 14px (subheads) → 18px (card titles) → 24px (section heads) → 36px (hero metrics)

### Spatial System
- Base unit: 4px
- Card padding: 16px (compact) / 24px (standard)
- Card gap: 12px (tight grid) / 20px (standard)
- Section gap: 32px
- Border radius: 6px (cards) / 4px (buttons) / 2px (tags)

### Motion Philosophy
- **Pulse animations**: Health indicators, live data streams (1.5s ease-in-out infinite)
- **Flow traces**: Token/agent activity lines animate along paths (800ms ease-out)
- **Number counters**: Cost/token counts animate up rapidly (200ms)
- **State transitions**: Card/panel expansions (250ms cubic-bezier)
- **Hover lifts**: Cards raise 2px with subtle glow on hover (150ms)
- **Glitch effect**: Error states briefly glitch (50ms) then stabilize

### Visual Assets
- **Icons**: Phosphor Icons (duotone variant for filled states)
- **Agent avatars**: Procedurally generated geometric shapes based on agent ID hash
- **Flow diagrams**: Custom SVG with animated stroke-dasharray for active flows
- **Sparklines**: Mini inline charts (32px tall) for trend data
- **Heatmaps**: Token density visualization for context windows

---

## Core Layout Structure

### Main Grid (1440px+ viewport)
```
┌─────────────────────────────────────────────────────────────────┐
│  [NEXUS LOGO]  │ Agent Universe │ Cost Shield │ Session Probe │  ← TopBar (56px)
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐ ┌────────────────────────────────────────────┐ │
│  │             │ │                                            │ │
│  │  ORCHESTRA  │ │           ACTIVE CONVERSATION              │ │
│  │   PANEL     │ │              CANVAS                        │ │
│  │  (280px)    │ │                                            │ │
│  │             │ │   [Agent flow visualization, live          │ │
│  │  - Agent    │ │    token streaming, conversation tree]     │ │
│  │    Registry │ │                                            │ │
│  │  - Health   │ │                                            │ │
│  │    Monitor  │ │                                            │ │
│  │  - Mode     │ └────────────────────────────────────────────┘ │
│  │    Toggle   │ ┌────────────────────────────────────────────┐ │
│  │             │ │           COST & USAGE RAIL               │ │
│  │             │ │  [Real-time cost, predictive alerts]      │ │
│  └─────────────┘ └────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Skill Forge] [Memory Atlas] [Git Nexus] [Cron Topo]          │  ← Feature Drawer (collapsible)
└─────────────────────────────────────────────────────────────────┘
```

### Navigation States
1. **Orbit View** (default): Full orchestration + conversation canvas
2. **Cost Nebula**: Cost analytics, budget forecasting, model comparison
3. **Skill Forge**: Ability registry, skill performance metrics
4. **Memory Atlas**: Knowledge gaps, memory distribution, context density
5. **Git Nexus**: Agent commits, PR reviews, version control
6. **Chrono Topo**: Cron job dependency graph, trigger chains

---

## Feature 1: Multi-Agent Orchestration Visibility

### What It Is
A real-time **agent task board** showing every agent in the system, what it's currently doing, what model it's using, and how long it's been running. In a multi-agent architecture, a single user request might spawn multiple agents: a planner agent, multiple specialist agents (code, research, writing), and a synthesis agent. This view makes that invisible work visible.

### Why It Matters
Without this, operators are blind to agent coordination. A request might hang because one sub-agent is stuck, or you might have 5 agents all contending for the same context window. Visibility enables intervention before problems cascade.

### Data Requirements
```typescript
interface AgentWorkload {
  agent_id: string;
  agent_type: 'planner' | 'specialist' | 'synthesizer' | 'monitor' | 'orchestrator';
  parent_agent_id: string | null;  // who spawned this
  child_agent_ids: string[];        // who this has spawned
  current_task: string;             // truncated task description
  task_status: 'queued' | 'running' | 'waiting' | 'completed' | 'stuck' | 'failed';
  model_in_use: string;             // "anthropic/claude-sonnet-4"
  mode: 'autonomous' | 'guided';
  started_at: number;               // unix timestamp
  tokens_consumed: number;          // running tally
  context_window_pct: number;       // 0-100
  skill_invocations: string[];     // which skills being used
  memory_accesses: string[];        // which memory vectors queried
}
```

### UI Mockup Description

**Agent Universe Panel (left sidebar, 280px)**

At the top: "AGENTS" label in `JetBrains Mono` 10px tracking-widened uppercase, plus a live count badge showing "7 ACTIVE / 12 TOTAL".

Below: a vertically scrolling list of agent cards. Each card is 64px tall with:

```
┌────────────────────────────────────────┐
│ [Geometric Avatar]  PLANNER-01        │
│                     ══════════        │
│ ○ Planning sub-tasks │ idle  │ 0:34   │
│ Model: claude-sonnet-4  ████░░ 67%    │
│ Mode: [AUTO] Skills: 3 │ Tools: 12   │
└────────────────────────────────────────┘
```

- **Geometric Avatar**: 24x24 procedurally generated SVG based on agent_id hash (hexagonal for planner, circular for specialist, diamond for synthesizer)
- **Agent ID**: `JetBrains Mono` 11px, cyan for autonomous, amber for guided
- **Status line**: animated pulse dot (green=running, amber=waiting, red=stuck, gray=idle) + truncated current task
- **Model badge**: shows model name truncated, with colored left border (Anthropic=cyan, Google=blue, Ollama=purple)
- **Context bar**: 4px tall progress bar showing context window utilization, fills magenta when >80%
- **Mode indicator**: "AUTO" in a pill (cyan bg) or "GUIDED" (amber bg)
- **Stats row**: skill count, tool call count, runtime

**Connections View** (toggle from panel to graph):

Clicking "Graph" toggle at panel top converts the list to a node-graph visualization:
- Nodes: agent cards (smaller, 48px)
- Edges: parent→child relationships drawn as animated cyan lines
- Active edges pulse with flowing particles to show direction
- Clicking a node expands to full card
- Zoom/pan with mouse wheel/drag

**Hover interaction**: Hovering an agent highlights all connected agents (parent, children) with a glow ring, dims others to 30% opacity.

---

## Feature 2: Real-Time Token Streaming Visualization

### What It Is
A **live ticker** showing tokens flowing in real-time during generation. Not just a counter—but a visual representation of the token stream itself, with token type coloring (user input vs. model output vs. cached retrieval), streaming speed visualization, and pattern detection (burst vs. steady).

### Why It Matters
Token consumption is the primary cost driver. Watching tokens stream helps operators intuit cost, detect anomalies (unexpectedly long outputs), and understand response latency. It transforms abstract numbers into visceral understanding.

### Data Requirements
```typescript
interface TokenStreamEvent {
  session_id: string;
  agent_id: string;
  token_type: 'input' | 'output' | 'cache_read' | 'cache_write' | 'reasoning';
  token_count: number;           // tokens in this chunk
  latency_ms: number;            // time to generate this chunk
  streaming: boolean;           // true if response is streaming
  timestamp: number;
  cumulative_input: number;
  cumulative_output: number;
  cumulative_cache_read: number;
  cumulative_cache_write: number;
}

interface TokenBudget {
  session_id: string;
  max_tokens_per_request: number;
  context_window_size: number;
  estimated_remaining: number;
}
```

### UI Mockup Description

**Token River Panel** (below conversation canvas, 120px tall)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TOKENS: 2,847 │ ↗ 47/s │ [████████████░░░░░░░░░░] 73% context         │
│  ↓ Input     ████████████████████░░░░░░░░░░░░░░░░░░░░░ 12,392        │
│  ↑ Output    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    2,847      │
│  ◈ Cached    ████████████████████████████████░░░░░░░░░░░░  8,441      │
│  ⊞ Reasoning ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0        │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Header row**: Total tokens (animated counter), speed indicator (47 tokens/sec with up arrow), context window progress bar
- **Input row**: Cyan fill streaming left-to-right as input tokens are processed
- **Output row**: Green fill streaming as model generates output
- **Cache row**: Purple fill for cached tokens (prompt caching benefit)
- **Reasoning row**: Amber fill for reasoning tokens (if model supports)
- **Streaming animation**: When model is generating, a sweeping highlight marquee plays across the output row

**Token Type Legend** (bottom-left of panel):
```
● Input  ● Output  ◈ Cache  ⊞ Reasoning
```

**Sparkline** (top-right of panel): 60-second rolling window of token speed, rendered as a glowing line chart.

**Anomaly highlighting**: If token speed suddenly spikes >2x average, the row flashes briefly with a magenta glow and "BURST" badge appears.

---

## Feature 3: Agent Conversation Diagrams / Flow Visualization

### What It Is
A **visual conversation tree** showing how multi-agent discussions unfold. When agents talk to each other (or to sub-agents), the messages form a tree structure. This view renders that tree in real-time, showing message flow, branching, and synthesis points.

### Why It Matters
Multi-agent conversations are complex. Tracking which agent said what, when, and how it influenced subsequent responses is nearly impossible in a flat message list. A conversation tree makes the invisible structure of agent deliberation visible.

### Data Requirements
```typescript
interface ConversationNode {
  node_id: string;
  parent_node_id: string | null;
  agent_id: string;
  agent_type: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | 'agent_delegation';
  content_preview: string;         // first 80 chars
  timestamp: number;
  token_count: number;
  child_count: number;             // direct replies/分支
  depth: number;                   // tree depth (0 = root)
  branching_factor: number;         // number of parallel sub-agents spawned here
  synthesis_target: boolean;       // true if this node synthesized children
}

interface ConversationBranch {
  branch_id: string;
  parent_node_id: string;
  child_node_ids: string[];        // parallel branches
  branch_label: string;            // "Code Review", "Research", etc.
}
```

### UI Mockup Description

**Conversation Canvas** (main center area)

Rendered as a vertical tree with time flowing downward:

```
                        ┌─────────────────────────┐
                        │  USER REQUEST           │
                        │  "Plan a trip to Tokyo" │
                        └────────────┬────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌───────────┐    ┌───────────┐    ┌───────────┐
            │ PLANNER   │    │ RESEARCHER│    │ WRITER    │
            │ ───────── │    │ ───────── │    │ ───────── │
            │ Breaking  │    │ Searching │    │ Drafting  │
            │ down...   │    │ flights...│    │ itinerary │
            └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                  │                │                │
                  └────────────────┼────────────────┘
                                     ▼
                           ┌─────────────────┐
                           │ SYNTHESIZER     │
                           │ ─────────────── │
                           │ Combining all   │
                           │ into a plan...  │
                           └─────────────────┘
```

- **Node rendering**: 180px wide cards, connected by animated bezier curves
- **Active nodes**: Glowing cyan border, pulsing dot indicator
- **Branching**: When an agent spawns sub-agents, the edge splits into multiple parallel curves with "spinning" particle animation along each path
- **Synthesis nodes**: Diamond shape, magenta border, with a "merge" icon
- **Depth indicator**: Vertical ruler on left edge showing tree depth
- **Click to expand**: Clicking any node shows full message content in a slide-out panel on the right
- **Time labels**: Subtle timestamps on edges showing latency between nodes
- **Breadcrumb trail**: Above the tree, a horizontally scrolling breadcrumb showing the path from root to currently selected node

**Layout algorithm**: Uses a modified Reingold-Tilford algorithm to minimize edge crossings, with horizontal layout for sibling branches.

**Mini-map** (bottom-right corner): Shows full tree at 10% scale with viewport indicator box that can be dragged to navigate.

---

## Feature 4: Predictive Cost Alerting

### What It Is
A **cost forecasting system** that doesn't just track what you've spent, but predicts what you'll spend given current velocity, and alerts you *before* you hit budget thresholds. Uses rolling averages, trend analysis, and session-level granularity to project costs.

### Why It Matters
Surprise bills are the #1 pain point in AI operations. By the time you see $500 in charges, you're already over budget. Predictive alerting gives you runway to intervene—pause agents, switch to cheaper models, or trim context windows before you blow past limits.

### Data Requirements
```typescript
interface CostSnapshot {
  session_id: string;
  provider: string;               // "anthropic", "google", "ollama"
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;                // calculated from pricing
  timestamp: number;
}

interface CostBudget {
  budget_id: string;
  name: string;
  limit_usd: number;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'total';
  current_spend: number;
  projected_spend: number;         // based on velocity
  velocity_1h: number;            // spend rate last hour
  velocity_24h: number;           // spend rate last 24h
  predicted_exhaustion: number | null;  // unix timestamp when budget will hit limit
  alert_thresholds: number[];     // e.g., [0.5, 0.75, 0.9, 1.0]
  alerts_sent: number[];          // which thresholds have triggered alerts
}

interface ModelCostRate {
  model: string;
  provider: string;
  input_per_1m: number;           // cost per million input
  output_per_1m: number;
  avg_session_tokens: number;     // typical session size for this model
  avg_session_cost: number;
}
```

### UI Mockup Description

**Cost Shield Rail** (bottom panel, 160px tall)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  COST SHIELD                                           Budget: $500/mo   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │           $412.47 / $500.00 (82.5%)          ◆ Projected: $498       │ │
│  │  █████████████████████████████████████████████████████░░░░░░░░░░░░░░  │ │
│  │  Jan 1         Feb 1        Mar 1        Apr 1        Today   May 1  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ALERTS        ⚠ 82% threshold reached    ⏱ Predicted: May 12          │
│                                                                            │
│  BREAKDOWN                                          TOP MODELS BY COST   │
│  ┌──────────────┐ ┌──────────────────────────────────────────────────┐   │
│  │ Anthropic  $ │ │  claude-opus-4    ████████████████████  $187.32  │   │
│  │ Google     $ │ │  claude-sonnet-4  ██████████████        $134.18  │   │
│  │ Ollama     $ │ │  gemini-2.0-flash ████                 $47.23    │   │
│  └──────────────┘ └──────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Main progress bar**: Fills cyan at 0-75%, amber at 75-90%, magenta at >90%. Gradient glow effect on the fill edge.
- **Projection line**: Dashed magenta line showing predicted spend trajectory based on current velocity
- **Exhaustion marker**: Diamond marker on the timeline showing predicted date/time of budget exhaustion (if velocity continues)
- **Alert banner**: Appears above bar when thresholds crossed, with specific warning and time remaining
- **Provider breakdown**: Pie chart on left showing cost by provider
- **Model breakdown**: Horizontal bar chart showing top 5 models by cost

**Alert Configuration Panel** (expandable from Cost Shield header)

```
┌─────────────────────────────────────────────┐
│ Alert Thresholds                    [+ Add] │
│ ─────────────────────────────────────────── │
│ [====●====] 50% - Warning      [toggle ON] │
│ [=====●===] 75% - Caution      [toggle ON] │
│ [======●==] 90% - Critical     [toggle ON] │
│ [=======●=] 100% - Budget Hit  [toggle ON] │
│                                             │
│ Notification Channels                       │
│ ☑ Dashboard    ☑ Email    ☑ Slack    ☐ PagerDuty │
│                                             │
│ Auto-Actions at 100%                       │
│ [ ] Pause all agents                       │
│ [ ] Switch to fallback model                │
│ [ ] Send alert only, take no action         │
└─────────────────────────────────────────────┘
```

**Velocity Sparklines**: Next to each model in the breakdown, a tiny 50px sparkline showing cost/hour over last 24h.

---

## Feature 5: One-Click Recovery Actions

### What It Is
A **recovery console** providing instant remediation actions for stuck, hung, or failed agents. One click to reset an agent's state, clear its session, restart its parent orchestrator, or kill and respawn an agent tree. No terminal commands, no guesswork.

### Why It Matters
When an agent hangs, operators currently need to diagnose (Is it the model? The context? A skill? The tool?), then figure out the right fix (Reset session? Kill agent? Clear context?). That's too many decisions in a crisis. One-click recovery bundles diagnosis into action.

### Data Requirements
```typescript
interface AgentRecoveryAction {
  action_id: string;
  action_type: 'reset_agent' | 'clear_session' | 'restart_orchestrator' | 'kill_agent_tree' | 'force_timeout' | 'inject_heartbeat' | 'clear_context';
  target_id: string;              // agent_id or session_id
  parent_id: string | null;        // for cascading actions
  child_ids: string[];            // agents that will be affected
  risk_level: 'safe' | 'moderate' | 'destructive';
  estimated_recovery_time: number; // seconds
  side_effects: string[];          // description of what else might happen
  requires_confirmation: boolean;
}

interface AgentHealthStatus {
  agent_id: string;
  last_heartbeat: number;         // unix timestamp
  heartbeat_interval_ms: number;
  stuck_detection_threshold_ms: number;
  is_stuck: boolean;
  stuck_reason: string | null;    // "no response for 60s", "context overflow"
  consecutive_failures: number;
}
```

### UI Mockup Description

**Recovery Console** (slide-out panel from right edge, triggered by selecting an agent)

```
┌─────────────────────────────────────────────────────────────┐
│  RECOVERY CONSOLE                                    [×]   │
│  Agent: PLANNER-01 (a7f3b2c1)                            │
│  Status: STUCK ●                                         │
│  ─────────────────────────────────────────────────────────│
│                                                             │
│  QUICK ACTIONS                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [⟳] Send Heartbeat Ping                            │   │
│  │       Probes agent for response, resets stuck timer │   │
│  │       Risk: None    Time: ~1s                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [⏸] Pause & Resume                                 │   │
│  │       Freezes agent state, allows inspection        │   │
│  │       Risk: Low    Time: ~2s                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [🧹] Clear Agent Context                            │   │
│  │       Empties context window, keeps session active  │   │
│  │       Risk: Moderate    Time: ~3s                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [⟨R⟩] Reset Agent State                            │   │
│  │       Full reset, agent restarts current task       │   │
│  │       Risk: Moderate    Time: ~5s                    │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [☠] Kill Agent Tree              ⚠ DESTRUCTIVE    │   │
│  │       Kills this agent + all children, loses work   │   │
│  │       Risk: HIGH    Time: Immediate                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────│
│  DIAGNOSTIC SNAPSHOT                                       │
│  Last heartbeat: 67 seconds ago (expected: 30s)            │
│  Context window: 89% used                                 │
│  Consecutive failures: 3                                   │
│  Memory vectors accessed: 4                               │
│  Skills in use: code-review, git-audit                    │
└─────────────────────────────────────────────────────────────┘
```

- **Action cards**: Each 56px tall, showing icon, title, description, risk badge (green/amber/red), and estimated time
- **Risk badges**: Color-coded pills—SAFE (green), MODERATE (amber), DESTRUCTIVE (red with skull icon)
- **Destructive confirmation**: For kill actions, clicking once shows a confirmation state (card turns red, "Click again to confirm" text appears), auto-reverts after 5s
- **Diagnostic snapshot**: Collapsible section at bottom with health metrics, context usage, failure count
- **Keyboard shortcuts**: Each action has a keyboard shortcut shown (e.g., "H" for heartbeat, "R" for reset)

**Global Recovery Bar** (top of dashboard, normally hidden, slides down when an agent is stuck)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠ STUCK AGENT DETECTED: PLANNER-01 │ Last heartbeat 67s ago │  [Quick Fix▼] │
└─────────────────────────────────────────────────────────────────────────┘
```

Dropdown from "Quick Fix" shows the top 3 recommended actions based on the stuck reason.

---

## Feature 6: Cross-Model Comparison

### What It Is
A **model comparison dashboard** showing side-by-side performance, cost, and quality metrics across different models (Claude, Gemini, Ollama local models). Lets operators pick the right model for the right task based on real historical data.

### Why It Matters
Different models have different strengths, costs, and speeds. The right choice depends on task type, quality requirements, and budget constraints. Without comparison data, operators default to the most capable model even when a cheaper/faster one would suffice.

### Data Requirements
```typescript
interface ModelComparisonData {
  model_id: string;               // "anthropic/claude-sonnet-4-20250514"
  provider: string;
  display_name: string;
  
  // Performance metrics (aggregated from sessions)
  avg_latency_ms: number;          // time to first token
  avg_total_time_ms: number;       // total response time
  avg_tokens_per_second: number;
  
  // Cost metrics
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  avg_cost_per_session: number;
  
  // Quality metrics (if evaluators run)
  quality_score: number;          // 0-100
  task_type_scores: Record<string, number>;  // "coding": 92, "writing": 88
  
  // Usage
  total_sessions: number;
  total_tokens: number;
  total_cost_usd: number;
  
  // Capabilities
  context_window: number;         // max tokens
  supports_vision: boolean;
  supports_tools: boolean;
  supports_streaming: boolean;
}

interface ComparisonSession {
  session_id: string;
  task_description: string;
  task_type: string;
  models_tested: string[];         // same task run on multiple models
  results: Record<string, {
    latency_ms: number;
    quality_score: number;
    cost_usd: number;
    selected: boolean;             // which model was chosen
  }>;
}
```

### UI Mockup Description

**Model Comparison Matrix** (full-screen view when activated)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MODEL COMPARISON CENTER                                    [Configure Tests]  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TASK TYPE: [All ▼]   TIME RANGE: [Last 7 days ▼]   SHOW: [Performance ▼]   │
│                                                                              │
│  ┌────────────┬────────────┬────────────┬────────────┬────────────┐         │
│  │            │  SONNET 4  │  OPUS 4    │ GEMINI 2.0 │  LLAMA 3   │         │
│  │            │  (Anthropic)│ (Anthropic)│ (Google)  │  (Ollama)  │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ LATENCY    │ ████████░░ │ ██████░░░░ │ █████████░ │ ████░░░░░░ │         │
│  │ 847ms avg  │  623ms     │  1,247ms   │  412ms     │  1,892ms   │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ THROUGHPUT │ █████████░ │ ████████░░ │ ██████████ │ ██████░░░░ │         │
│  │ tok/s      │  89        │  67        │  124       │  34        │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ COST/SESS  │ $0.023     │ $0.089     │ $0.012      │ $0.000     │         │
│  │            │ $███░░░░░░ │ $████████░ │ $█░░░░░░░░ │ ░░░░░░░░░░ │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ QUALITY    │ ████████░░ │ █████████░ │ ███████░░░ │ ██████░░░░ │         │
│  │ (eval)     │  87        │  94        │  82        │  71        │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ CONTEXT    │ 200K       │ 200K       │ 1M         │ 8K         │         │
│  │            │ [████████] │ [████████] │ [████████] │ [██░░░░]   │         │
│  ├────────────┼────────────┼────────────┼────────────┼────────────┤         │
│  │ SESSIONS   │ 1,247      │ 312        │ 892        │ 456        │         │
│  │ (7 days)   │ ██████████ │ ███░░░░░░░ │ ████████░░ │ █████░░░░░ │         │
│  └────────────┴────────────┴────────────┴────────────┴────────────┘         │
│                                                                              │
│  RADAR CHART                                               COST vs QUALITY  │
│  ┌────────────────────────────────┐    ┌────────────────────────────────────┐│
│  │      Sonnet                    │    │                                    ││
│  │      Opus ●                   │    │     ● Gemini (best cost/quality)   ││
│  │     /    \                    │    │                                    ││
│  │  Gemini     \                 │    │  ● Sonnet                           ││
│  │              \                │    │                                    ││
│  │               \    Llama      │    │           ● Opus (best quality)    ││
│  │                \              │    │                                    ││
│  │                 \             │    │                                    ││
│  └────────────────────────────────┘    └────────────────────────────────────┘│
│                                                                              │
│  RECOMMENDATIONS                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ ⚡ Fastest: Gemini 2.0 Flash (412ms avg, $0.012/session)               │ │
│  │ 💎 Highest Quality: Opus 4 (94 eval score, best for complex reasoning)│ │
│  │ 💰 Best Value: Gemini 2.0 Flash (quality 82, cost $0.012)             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Matrix grid**: Each row is a metric, each column is a model
- **Bar visualizations**: Horizontal bars show relative performance within each metric (best value = full bar)
- **Cost cell**: Shows cost + a mini cost-bar relative to most expensive model
- **Feature badges**: Small icons below model name (👁 for vision, 🔧 for tools, 📹 for streaming)
- **Radar chart**: Multi-axis plot (latency, quality, cost, context window) with each model as a colored polygon, toggleable
- **Scatter plot**: Cost vs. quality with each model as a point, sized by session count
- **Recommendation cards**: Bottom section with highlighted recommendations for different priorities

---

## Feature 7: Git-Native Agent Workflows

### What It Is
A **Git integration panel** showing agent activity in terms developers understand: commits, branches, pull requests, and code reviews. Agents that write code are tracked with the same workflows as human developers, creating an auditable history of agent contributions.

### Why It Matters
Agents increasingly write code, configs, and documentation. Without Git integration, this work is invisible to development workflows. Agent commits get lost, agent-authored PRs can't be reviewed properly, and there's no accountability trail. Git-native agent workflows solve this.

### Data Requirements
```typescript
interface AgentGitActivity {
  agent_id: string;
  session_id: string;
  
  // Repository state
  repo: string;                   // "owner/repo"
  branch: string;
  
  // Actions taken
  action_type: 'commit' | 'pr_created' | 'pr_reviewed' | 'branch_created' | 'merge' | 'file_edit';
  
  // For commits
  commit_sha: string | null;
  commit_message: string | null;
  files_changed: string[] | null;
  lines_added: number | null;
  lines_removed: number | null;
  
  // For PRs
  pr_number: number | null;
  pr_title: string | null;
  pr_review_state: 'approved' | 'changes_requested' | 'commented' | null;
  
  // Timestamps
  timestamp: number;
  
  // Attribution
  human_reviewed: boolean;
  human_approved: boolean;
}

interface AgentBranch {
  branch_name: string;
  created_by_agent: boolean;
  parent_branch: string;
  agent_id: string;
  created_at: number;
  last_activity: number;
  status: 'active' | 'stale' | 'merged' | 'abandoned';
}
```

### UI Mockup Description

**Git Nexus Panel** (one of the feature drawers)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  GIT NEXUS                                         [+ New Branch] [Refresh] │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  BRANCHES                                    YOUR REPOS ▼                   │
│  ┌────────────────────────────────────────┐                                │
│  │ ◉ agent/planner-01/session-a7f3  │ 4 commits │ active │ 2h ago │ [PR] │ │
│  │   agent/code-review-03/session-b2 │ 12 commits│ active │ 34m    │ [PR] │ │
│  │   agent/docs-update-07            │ 1 commit  │ stale  │ 3d     │      │ │
│  │   main                            │ 247 commits│       │       │      │ │
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                            │
│  RECENT AGENT COMMITS                                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ @a7f3b2c1  PLANNER-01  "feat: add user auth flow"                      │ │
│  │            2 files  +142 -38        agent/planner-01/session-a7f3     │ │
│  │            ─────────────────────────────────────────────               │ │
│  │            src/auth.py        +89 -12                                  │ │
│  │            tests/test_auth.py +53 -26                                  │ │
│  │            [View Diff]  [Create PR]                                     │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │ @c4d8e9f2  CODER-03     "fix: resolve race condition in cache"          │ │
│  │            1 file    +23 -18        agent/code-review-03/session-b2    │ │
│  │            ─────────────────────────────────────────────               │ │
│  │            src/cache.py  +23 -18                                       │ │
│  │            [View Diff]  [Create PR]                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  PENDING PR REVIEWS                                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ #47  agent: add payment processing          [Awaiting Review]           │ │
│  │      by CODER-07  ·  6 files  ·  +234 -67  ·  agent/planner-03/sess-x  │ │
│  │      [Review as Agent]  [Approve]  [Request Changes]                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Branch list**: Shows agent-created branches with status indicators (green dot=active, gray=stale, purple=merged)
- **Branch naming convention**: `agent/{agent_type}-{short_id}/{session_id}` for easy filtering
- **Commit list**: Each commit shows agent avatar, agent ID, commit message, file stats, branch name
- **Diff viewer**: Clicking "View Diff" opens a side-by-side diff view with syntax highlighting
- **PR creation**: One-click PR from commit with pre-filled template describing agent changes
- **PR review panel**: Shows pending PRs where agents participated, with inline commenting and approval actions
- **Agent vs Human attribution**: Commits/PRs show a badge "[🤖 AGENT]" or "[👤 HUMAN]"

---

## Feature 8: Autonomous vs Guided Mode Indicators

### What It Is
A **mode visibility system** that shows at a glance whether each agent is operating in autonomous mode (making decisions independently) or guided mode (requiring human confirmation for actions). Shows mode transitions and the decision authority chain.

### Why It Matters
Autonomous agents can take actions with real-world consequences—writing files, calling APIs, sending messages. Operators need to know which agents can act independently vs. which are constrained. Mode visibility prevents surprise actions and enables proper oversight.

### Data Requirements
```typescript
interface AgentModeStatus {
  agent_id: string;
  current_mode: 'autonomous' | 'guided' | 'hybrid';
  
  // Mode settings
  autonomous_actions: string[];    // e.g., ["read_file", "search_web"]
  requires_confirmation: string[]; // e.g., ["write_file", "send_message", "delete"]
  blocked_actions: string[];      // actions this agent can never take
  
  // Transition log
  mode_transitions: Array<{
    timestamp: number;
    from_mode: string;
    to_mode: string;
    reason: string;
    triggered_by: 'human' | 'system' | 'agent';
  }>;
  
  // Pending confirmations (for guided mode)
  pending_confirmations: Array<{
    action_id: string;
    action_type: string;
    action_details: string;
    requested_at: number;
  }>;
}
```

### UI Mockup Description

**Mode Indicator Badges** (shown in agent cards and detail views)

```
┌────────────────────────────────────────────────────────┐
│  [🔓 AUTO]  Autonomous Agent                          │
│            Can act independently                       │
│            ✓ read, search, analyze                     │
│            ✓ write (under $10)                         │
│            ✗ delete, send                             │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [🔒 GUIDE]  Guided Agent                             │
│            Requires approval for sensitive actions    │
│            ✓ read, search, analyze                    │
│            ⏳ write, delete (pending)                 │
│            ✗ send                                     │
└────────────────────────────────────────────────────────┘
```

**Mode Ruler** (shown below agent name in orchestration panel)

A horizontal bar with mode segments:
```
PLANNER-01  ═══════════════════════════════════════════
            [AUTO ────────][GUIDED ────][AUTO ────────]
            ▲ 09:00                    ▲ 09:47 (current)
```

- **Ruler visualization**: Timeline bar showing mode history for the current session
- **Current mode**: Highlighted segment with label
- **Transition markers**: Small vertical ticks at mode change points with hover tooltips showing reason
- **Color coding**: Cyan = autonomous, Amber = guided, Purple = hybrid

**Confirmation Queue Panel** (expandable section)

```
┌─────────────────────────────────────────────────────────────────┐
│  PENDING CONFIRMATIONS (2)                                     │
│  ───────────────────────────────────────────────────────────── │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ⏳ CODER-03 requests to: WRITE FILE                        │  │
│  │    Path: src/features/payment.py                          │  │
│  │    Size: 2.4KB                                            │  │
│  │    [Preview]  [Approve]  [Deny]  [Approve & Trust Agent]   │  │
│  │    Requested 34s ago  ·  Timeout in 5:26                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ⏳ PLANNER-01 requests to: DELETE FILE                     │  │
│  │    Path: src/deprecated/auth_v1.py                        │  │
│  │    [Preview]  [Approve]  [Deny]  [Block Agent for 1h]     │  │
│  │    Requested 2s ago  ·  Timeout in 6:00                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

- **Pending actions**: Card for each confirmation request showing action type, details, timestamp
- **Timeout countdown**: Progress bar showing time until auto-denial (configurable)
- **Action buttons**: Approve, Deny, or "Approve & Trust" (grants that agent broader permissions for similar actions)
- **Preview**: Shows what would be written/deleted/executed

---

## Feature 9: Memory/Knowledge Gap Detection

### What It Is
A **knowledge visualization system** that shows what the agent knows vs. doesn't know about the current task context. Detects when an agent is operating outside its knowledge base and highlights potential hallucinations or information gaps.

### Why It Matters
Agents can confidently produce incorrect information when they lack relevant knowledge. Detecting knowledge gaps before output is generated—rather than after—enables proactive information retrieval or human consultation.

### Data Requirements
```typescript
interface KnowledgeGap {
  gap_id: string;
  session_id: string;
  agent_id: string;
  
  gap_type: 'unknown_concept' | 'outdated_info' | 'missing_context' | 'uncertain_fact' | 'contradictory_info';
  
  // What the agent tried to use
  referenced_concepts: string[];
  
  // What was found/missing
  knowledge_sources_found: string[];  // vector IDs that were retrieved
  knowledge_sources_missing: string[];
  
  // Confidence scoring
  agent_confidence: number;          // 0-100
  gap_severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Resolution
  resolution: 'retrieved' | 'human_provided' | 'ignored' | 'hallucinated';
  timestamp: number;
}

interface MemoryContext {
  agent_id: string;
  session_id: string;
  
  // Context window composition
  context_used_pct: number;
  memory_vectors: Array<{
    vector_id: string;
    source: string;               // "file", "doc", "session", "skill"
    relevance_score: number;       // 0-1
    content_preview: string;
  }>;
  
  // Knowledge domain coverage
  domains_touched: string[];       // e.g., ["python", "aws", "finance"]
  domains_confident: string[];
  domains_gaps: string[];
}
```

### UI Mockup Description

**Memory Atlas Panel** (one of the feature drawers)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  MEMORY ATLAS                                          [Scan for Gaps]    │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  CONTEXT WINDOW                                                     73%   │
│  [█████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]         │
│                                                                            │
│  KNOWLEDGE DOMAIN COVERAGE                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ Python          ████████████████████████████████████  confident   │  │
│  │ ✓ AWS             ████████████████████████████████░░  confident   │  │
│  │ ✓ PostgreSQL      ██████████████████████░░░░░░░░░░░░  adequate    │  │
│  │ ⚠ React           ████████████░░░░░░░░░░░░░░░░░░░░░░  uncertain   │  │
│  │ ✗ Kubernetes      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  NOT FOUND    │  │
│  │ ✗ Payment APIs    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  NOT FOUND    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  RETRIEVED MEMORY VECTORS                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ◈ session:a7f3b2c1  "User asked about payment integration..."     │  │
│  │   Relevance: 94%  ·  Added 2m ago  ·  1.2KB                          │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ ◈ skill:stripe-integration  "Stripe API reference..."               │  │
│  │   Relevance: 87%  ·  From skill  ·  4.8KB                          │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ ◈ file:src/payments.py  "Payment processor module..."               │  │
│  │   Relevance: 82%  ·  From codebase  ·  2.1KB                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  DETECTED GAPS (3)                                    [Auto-fix with web] │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠ HIGH  "Kubernetes deployment configs" referenced but not found  │  │
│  │         Agent is working from outdated docs (v1.26 vs current v1.29)│  │
│  │         [Retrieve Latest]  [Provide Manually]  [Ignore]            │  │
│  ├─────────────────────────────────────────────────────────────────────┤  │
│  │ ⚠ MED   "Payment API rate limits" - inconsistent across docs      │  │
│  │         Found 2 sources with conflicting data                       │  │
│  │         [Use Stripe Docs]  [Use Partner Docs]  [Average Both]      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Context meter**: Animated bar showing how full the context window is
- **Domain coverage bars**: Horizontal bars for each knowledge domain, color-coded (green=confident, amber=uncertain, red=missing)
- **Vector list**: Shows retrieved memory vectors with relevance scores, expandable for full content
- **Gap cards**: Warning cards for each detected gap, with severity badge, description, and resolution actions
- **Auto-fix button**: Triggers web search or skill invocation to fill gaps automatically

**Knowledge Graph View** (toggle from list view)

```
      ┌──────────┐
      │ Current  │
      │  Task    │
      └────┬─────┘
           │
     ┌─────┼─────┐
     │     │     │
     ▼     ▼     ▼
  ┌────┐ ┌────┐ ┌────┐
  │ DB │ │Code│ │ API│
  │ ✓  │ │ ✓  │ │ ✗  │ ← Gap indicator
  └────┘ └────┘ └────┘
```

- **Node graph**: Current task at center, connected to knowledge domain nodes
- **Edge states**: Solid green=retrieved, dashed amber=uncertain, dotted red=missing
- **Hover details**: Hovering a node shows source documents and relevance scores

---

## Feature 10: Security and Permission Boundaries Visualization

### What It Is
A **security topology view** showing the permission boundaries of each agent—what files it can access, what APIs it can call, what platforms it can interact with. Visualizes the blast radius of a compromised or misbehaving agent.

### Why It Matters
Agents with broad permissions can cause significant damage if they malfunction or are manipulated. Without clear permission visibility, operators can't assess risk or audit agent behavior. This view makes permission boundaries tangible.

### Data Requirements
```typescript
interface AgentPermissions {
  agent_id: string;
  
  // File system permissions
  file_access: {
    allowed_paths: string[];       // e.g., ["/project/src", "/project/tests"]
    denied_paths: string[];        // e.g., ["/project/secrets", "/etc"]
    can_write: boolean;
    can_delete: boolean;
    can_execute: boolean;
  };
  
  // API permissions
  api_permissions: {
    allowed_domains: string[];     // e.g., ["api.stripe.com", "github.com"]
    denied_domains: string[];
    rate_limits: Record<string, number>;
  };
  
  // Platform permissions
  platform_permissions: {
    platforms: string[];            // ["github", "slack", "aws"]
    capabilities: Record<string, string[]>;  // github: ["read", "write_issues", "write_pr"]
  };
  
  // Data restrictions
  data_restrictions: {
    max_file_size_write: number;    // bytes
    max_api_calls_per_hour: number;
    pii_access: boolean;
    can_export: boolean;
  };
  
  // Audit log
  permission_audit: Array<{
    timestamp: number;
    action: string;
    resource: string;
    result: 'allowed' | 'denied';
  }>;
}
```

### UI Mockup Description

**Security Shield Panel** (one of the feature drawers)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  SECURITY BOUNDARIES                                                       │
│  Agent: CODER-03  │  Mode: AUTO  │  Risk Score:  ⚠ MEDIUM               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  PERMISSION TOPOLOGY                                    [Edit Permissions]  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                                                                     │  │
│  │     ┌─────────────────────────────────────────────────────────┐     │  │
│  │     │                    AGENT SCOPE                          │     │  │
│  │     │                                                         │     │  │
│  │     │   FILE SYSTEM              │    NETWORK                 │     │  │
│  │     │   ─────────────            │    ───────                 │     │  │
│  │     │   ✓ /project/src    ──►    │    ✓ github.com      ──►   │     │  │
│  │     │   ✓ /project/tests ──►    │    ✓ api.stripe.com  ──►   │     │  │
│  │     │   ✗ /project/secrets ──►  │    ✗ internal-db     ──►   │     │  │
│  │     │   ✗ /etc            ──►  │    ✗ aws-secrets     ──►   │     │  │
│  │     │                                                         │     │  │
│  │     │   PLATFORMS               │    DATA                     │     │  │
│  │     │   ─────────               │    ────                     │     │  │
│  │     │   ✓ GitHub (RO)     ──►   │    Max file: 10MB     ──►   │     │  │
│  │     │   ✓ Slack (post)    ──►   │    PII access: NO    ──►   │     │  │
│  │     │   ✗ AWS Console     ──►  │    Export: LIMITED   ──►   │     │  │
│  │     │                           │                             │     │  │
│  │     └─────────────────────────────────────────────────────────┘     │  │
│  │                             ▼                                       │  │
│  │                    BLAST RADIUS: 2/10                              │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  RECENT ACCESS (last 1 hour)                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ 09:47:23  Read    /project/src/auth.py                            │  │
│  │ ✓ 09:47:18  Read    /project/src/user_service.py                     │  │
│  │ ✓ 09:46:55  Write   /project/src/auth.py (pending confirmation)      │  │
│  │ ✓ 09:46:12  API     github.com/api/repos                            │  │
│  │ ✗ 09:45:33  Denied  /project/secrets/api_keys.yaml                  │  │
│  │ ✓ 09:44:58  Read    /project/tests/test_auth.py                      │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  RISK FLAGS                                                               │
│  ⚠ Agent can write to filesystem                                         │
│  ⚠ Agent can call external APIs (potential data exfiltration)            │
│  ✓ Agent cannot access secrets                                            │
│  ✓ Agent cannot access production databases                               │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Topology diagram**: Central agent node with spokes for each permission category
- **Allowed resources**: Green checkmark nodes, solid lines
- **Denied resources**: Red X nodes, dashed lines
- **Blast radius score**: 0-10 numeric score with visual meter (2/10 = low risk, 8/10 = high risk)
- **Access log**: Timestamped list of permission checks, color-coded (green=allowed, red=denied)
- **Risk flags**: Bullet list of notable risk factors

**Permission Editor Modal** (click "Edit Permissions")

```
┌─────────────────────────────────────────────────────────────────┐
│  EDIT AGENT PERMISSIONS                                         │
│  Agent: CODER-03                                                 │
│  ─────────────────────────────────────────────────────────────── │
│                                                                 │
│  File System                                                     │
│  Allowed Paths: [________________________] [+]                  │
│    /project/src ✓                                                │
│    /project/tests ✓                                              │
│                                                                 │
│  [✓] Can Write Files                                            │
│  [✓] Can Delete Files                                            │
│  Max file size: [10] MB                                          │
│                                                                 │
│  Network                                                         │
│  Allowed Domains: [____________________] [+]                     │
│    github.com ✓                                                  │
│    api.stripe.com ✓                                              │
│                                                                 │
│  [ ] Can access internal networks                                │
│                                                                 │
│  Platforms                                                       │
│  [✓] GitHub: [read ▼]                                            │
│  [ ] AWS Console                                                 │
│  [✓] Slack                                                      │
│                                                                 │
│                                        [Cancel]  [Save Changes]   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 11: Agent Health Heartbeat System

### What It Is
A **distributed heartbeat monitoring system** that tracks the liveness of every agent in real-time. Detects stuck agents, memory leaks, and unresponsive processes, with automatic restart capabilities.

### Why It Matters
Agent hangs are common—model timeouts, infinite loops, deadlocks. Without heartbeat monitoring, a stuck agent can consume resources indefinitely, block tasks, and cascade failures to dependent agents.

### Data Requirements
```typescript
interface HeartbeatStatus {
  agent_id: string;
  
  // Timing
  last_heartbeat: number;         // unix timestamp ms
  heartbeat_interval_ms: number;  // expected interval (e.g., 30000)
  heartbeat_timeout_ms: number;  // max time before considered stuck (e.g., 60000)
  
  // Status
  state: 'alive' | 'idle' | 'busy' | 'stuck' | 'dead';
  
  // Health metrics
  cpu_usage_pct: number;
  memory_usage_mb: number;
  thread_count: number;
  
  // Restart info
  consecutive_failures: number;
  last_restart: number | null;
  auto_restart_enabled: boolean;
  restart_count_24h: number;
  
  // Stuck detection
  stuck_reason: string | null;
  stuck_since: number | null;
}

interface HeartbeatEvent {
  event_type: 'heartbeat' | 'stuck_detected' | 'restarted' | 'died';
  agent_id: string;
  timestamp: number;
  details: Record<string, unknown>;
}
```

### UI Mockup Description

**Agent Health Grid** (in Orchestra panel, compact view)

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENT HEALTH                                    [All] [Stuck]  │
│                                                                  │
│  ╔═════════╦═════════╦═════════╦═════════╦═════════╦═════════╗  │
│  ║ PLANNER ║ CODER-1 ║ CODER-2 ║ RESEARCH║ WRITER  ║ MONITOR ║  │
│  ║  ────   ║  ────   ║  ────   ║  ────   ║  ────   ║  ────   ║  │
│  ║   ●     ║   ●     ║   ◐     ║   ●     ║   ○     ║   ●     ║  │
│  ║ ALIVE   ║ ALIVE   ║ STUCK   ║ ALIVE   ║ IDLE    ║ ALIVE   ║  │
│  ║ 0:47    ║ 2:15    ║  5:32   ║ 0:12    ║  --     ║ 1:03    ║  │
│  ║ ████░░  ║ ██████░ ║ █████████│ ║ ██░░░░ ║ ░░░░░░ ║ ███░░░  ║  │
│  ║ CPU 34% ║ CPU 67% ║ CPU 98%  ║ CPU 12% ║ CPU 0%  ║ CPU 8%  ║  │
│  ╚═════════╩═════════╩═════════╩═════════╩═════════╩═════════╝  │
│                                                                  │
│  LEGEND:  ● Alive  ◐ Stuck  ○ Idle  ✗ Dead                       │
└──────────────────────────────────────────────────────────────────┘
```

- **Health cards**: Each agent shown as a compact card (80x100px)
- **Status dot**: Pulsing dot indicator (green=alive, amber=stuck, gray=idle, red=dead)
- **Runtime**: Time since last heartbeat
- **CPU bar**: Small 4px bar showing relative CPU usage
- **Stuck alert**: When stuck, card border turns red with a pulsing glow, shows stuck duration

**Health Detail Panel** (click on agent card)

```
┌─────────────────────────────────────────────────────────────────┐
│  AGENT HEALTH DETAIL                                            │
│  CODER-03  ·  Session: a7f3b2c1  ·  Model: claude-sonnet-4       │
│  ───────────────────────────────────────────────────────────────│
│                                                                 │
│  HEARTBEAT STATUS                    AUTO-RESTART               │
│  Last: 3 seconds ago                 [✓] Enabled               │
│  Interval: 30s                       Max restarts: 3            │
│  Timeout: 60s                        Cooldown: 5 minutes        │
│                                                                 │
│  ┌────────────────────────────┐  ┌────────────────────────────┐│
│  │  CPU USAGE                 │  │  MEMORY USAGE               ││
│  │  34%  ████████░░░░░░░░░░░  │  │  127MB                       ││
│  │                             │  │  ██████░░░░░░░░░░░░░░░░░░  ││
│  └────────────────────────────┘  └────────────────────────────┘│
│                                                                 │
│  TIMELINE                                     [Last 10 minutes] │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ●────────────────●───◐────────────────────────────────● │   │
│  │   alive            stuck          restarted              │   │
│  │   09:40            09:47          09:47:30               │   │
│  │                     5m 23s frozen                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  STUCK EVENT                                                    │
│  ⚠ Stuck detected: No response for 67s (threshold: 60s)     │
│     Reason: Model request timeout                              │
│     [Send Heartbeat]  [Force Restart]  [Clear Session]          │
│                                                                 │
│  RESTART LOG                                                    │
│  · 09:47:30  Restarted (stuck detection)                        │
│  · 09:45:12  Restarted (manual)                                 │
│  · 09:30:00  Started                                             │
└─────────────────────────────────────────────────────────────────┘
```

- **Metrics gauges**: CPU and memory as animated gauges with threshold lines
- **Timeline**: Horizontal timeline showing state transitions, with stuck period highlighted in red
- **Stuck event card**: Shows reason, duration, and recovery actions
- **Restart log**: Timestamped list of restarts with trigger

---

## Feature 12: Session Replay and Audit Trail

### What It Is
A **complete session recording system** that captures every action, decision, and output in a session, enabling full replay for debugging, compliance, and learning. Think "flight recorder" for AI agents.

### Why It Matters
When something goes wrong—or goes right and you want to understand why—you need to replay the exact sequence of events. Session replay enables post-mortem analysis, compliance auditing, and iterative improvement of agent behavior.

### Data Requirements
```typescript
interface SessionEvent {
  event_id: string;
  session_id: string;
  agent_id: string;
  
  event_type: 'user_message' | 'agent_thinking' | 'agent_response' | 'tool_call' | 'tool_result' | 
              'context_update' | 'skill_invoked' | 'memory_access' | 'error' | 'mode_change' |
              'permission_check' | 'external_api_call' | 'file_operation';
  
  timestamp: number;             // unix timestamp ms
  sequence: number;              // monotonically increasing per session
  
  // Event-specific data
  data: Record<string, unknown>;
  
  // Timing
  duration_ms: number | null;    // for timed events
  
  // Context snapshot
  context_window_pct: number;
  tokens_used: number;
  cost_usd: number;
}

interface SessionReplay {
  session_id: string;
  title: string;
  created_at: number;
  ended_at: number | null;
  
  // Summary stats
  total_events: number;
  total_duration_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  
  // Replay data
  events: SessionEvent[];
  
  // Annotations
  annotations: Array<{
    timestamp: number;
    user_id: string;
    note: string;
    type: 'bookmark' | 'flag' | 'comment';
  }>;
}
```

### UI Mockup Description

**Session Replay View** (full-screen overlay)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  SESSION REPLAY                                    [Exit] [Export] [Share]│
│  "Planning trip to Tokyo - session_a7f3b2c1"                              │
│  ─────────────────────────────────────────────────────────────────────────│
│                                                                            │
│  ◀◀  ▶  ●  ▶▶  │  09:32:47 ──●────────────────────────────── 09:38:12     │
│  [―]  [▶]  [__] │  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                            │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │  EVENT TIMELINE                 │  │  CURRENT STATE                  │ │
│  │  ─────────────────────           │  │  ─────────────                  │ │
│  │                                  │  │                                  │ │
│  │  ● 09:32:47  USER                │  │  CONTEXT WINDOW                  │ │
│  │  │  "Plan a trip to Tokyo..."   │  │  ████████████████░░░░░░  73%    │ │
│  │  │                               │  │                                  │ │
│  │  ● 09:32:48  AGENT (thinking)   │  │  TOKENS: 2,847                   │ │
│  │  │  ⊞ Reasoning: Breaking down  │  │  COST: $0.023                    │ │
│  │  │    task into sub-agents       │  │                                  │ │
│  │  │                               │  │  ACTIVE AGENTS: 3                │ │
│  │  ├───────────────────────────────│  │  · PLANNER-01 (synthesizing)    │ │
│  │  │                               │  │  · RESEARCHER-02 (searching)    │ │
│  │  ● 09:32:52  TOOL CALL           │  │  · CODER-03 (idle)              │ │
│  │  │  🔍 web_search("Tokyo...")   │  │                                  │ │
│  │  │  └─► result_count: 47        │  │  LAST 5 EVENTS                   │ │
│  │  │                               │  │  09:38:11  ✗ API Error           │ │
│  │  ├───────────────────────────────│  │  09:38:09  ✓ Tool Result        │ │
│  │  │                               │  │  09:38:08  → Tool Call           │ │
│  │  ● 09:33:01  AGENT (response)    │  │  09:37:55  → Thinking...        │ │
│  │  │  "Here's your Tokyo plan..." │  │  09:37:52  → Thinking...        │ │
│  │  │                               │  │                                  │ │
│  │  ◉ 09:33:15  BRANCH              │  │  ────────────────────────────────│ │
│  │     Spawned 3 sub-agents        │  │  [Event Detail Panel]           │ │
│  │                                  │  │                                   │ │
│  │  [Events filtered: All ▼]       │  │  Expand any event to see full    │ │
│  │                                  │  │  content, tool calls, reasoning │ │
│  └─────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                            │
│  BOOKMARKS                                       ANNOTATIONS              │
│  [09:35:12 ★] "Flights found"                   + Add annotation          │
│  [09:36:44 ★] "Hotel options"                                         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Playback controls**: Standard media controls (play, pause, step forward/back, speed control)
- **Timeline scrubber**: Draggable timeline with event density visualization (peaks show busy periods)
- **Event timeline (left)**: Scrollable list of events with icons per type, timestamps, and content previews
- **Current state panel (right)**: Shows live state of context, tokens, cost, and active agents at the current replay point
- **Event detail panel**: Clicking any event expands it in the right panel showing full content
- **Bookmarks**: User-created markers for important moments
- **Annotations**: User comments attached to specific timestamps

**Event Type Icons**:
- 👤 User message
- 🧠 Agent thinking/reasoning
- 📝 Agent response
- 🔧 Tool call
- ✓ Tool result
- ⚠ Error
- 🔀 Mode change
- 📄 File operation
- 🌐 API call

---

## Feature 13: Skill/Ability Registry and Usage Tracking

### What It Is
A **capability catalog** showing all available skills/abilities, their invocation statistics, success rates, and performance profiles. Tracks which skills are used most, which are failing, and which are starving for use.

### Why It Matters
Skills are the agent's tools. Without visibility into skill performance, you can't identify underperforming skills, detect skill decay, or optimize skill selection. The registry becomes a knowledge base of agent capabilities.

### Data Requirements
```typescript
interface SkillRegistry {
  skill_id: string;
  skill_name: string;            // "github-pr-review"
  skill_category: string;        // "code", "communication", "research", "system"
  skill_version: string;
  
  // Invocation stats
  total_invocations: number;
  successful_invocations: number;
  failed_invocations: number;
  success_rate: number;         // 0-100
  
  // Performance
  avg_duration_ms: number;
  avg_tokens_consumed: number;
  avg_cost_per_invocation: number;
  
  // Usage over time
  invocations_1h: number;
  invocations_24h: number;
  invocations_7d: number;
  
  // Quality signals
  quality_score: number;         // 0-100 (if evaluators run)
  user_rating: number | null;    // 1-5 stars
  
  // Dependencies
  required_skills: string[];     // skills this skill depends on
  used_by_skills: string[];     // skills that call this one
  
  // Documentation
  description: string;
  usage_examples: string[];
  last_updated: number;
}

interface SkillInvocation {
  invocation_id: string;
  skill_id: string;
  agent_id: string;
  session_id: string;
  
  timestamp: number;
  duration_ms: number;
  success: boolean;
  
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  
  error_type: string | null;
  error_message: string | null;
}
```

### UI Mockup Description

**Skill Forge Panel** (one of the feature drawers)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  SKILL FORGE                                          [Register Skill]    │
│  47 Skills  ·  1,247 invocations today  ·  Avg success: 94.2%            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  SEARCH: [________________]    FILTER: [All Categories ▼]  [▾]           │
│                                                                            │
│  CATEGORY BREAKDOWN                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  CODE (12)    ████████████████████████████████████                   │ │
│  │  RESEARCH (8) ████████████████████████                                │ │
│  │  COMM (15)    ██████████████████████████████████████████████          │ │
│  │  SYSTEM (12)  ████████████████████████████                            │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  TOP PERFORMERS                              UNDERPERFORMERS              │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │ ★ github-pr-review  99.2%   │  │ ⚠ web-scraper  67.3% (142 fails)    │ │
│  │   892 invocations today    │  │   [Investigate]  [Disable]           │ │
│  │   234ms avg  ·  $0.001     │  │                                       │ │
│  ├─────────────────────────────┤  │ ⚠ file-search  71.8% (89 fails)    │ │
│  │ ★ code-review  98.7%        │  │   [Investigate]  [Retire]           │ │
│  │   567 invocations today    │  │                                       │ │
│  │   456ms avg  ·  $0.003     │  │                                       │ │
│  ├─────────────────────────────┤  │ ⚠ memory-recall  12.4% ( starving) │ │
│  │ ★ stripe-integration  97.1%│  │   Not invoked in 72h               │ │
│  │   234 invocations today    │  │   [Review Usage]  [Archive]         │ │
│  │   189ms avg  ·  $0.002     │  │                                       │ │
│  └─────────────────────────────┘  └─────────────────────────────────────┘ │
│                                                                            │
│  SKILL DETAIL                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  github-pr-review  ·  v2.3.1  ·  Code                                │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │                                                                      │ │
│  │  INVOCATIONS                    PERFORMANCE                          │ │
│  │  Today: 892                     Avg Duration: 234ms                  │ │
│  │  7-day trend: ↗ +12%            Avg Tokens: 1,247                    │ │
│  │  Total: 47,231                  Avg Cost: $0.001                    │ │
│  │                                                                      │ │
│  │  SUCCESS RATE TREND                                                   │ │
│  │  98%│  ════════════════════════════════════════════                 │ │
│  │  96%│        ═══════════════════════════════════════                 │ │
│  │  94%│              ════════════════════════════════                  │ │
│  │  92%│                    ════════════════════════                    │ │
│  │     └──────────────────────────────────────────────────────         │ │
│  │      Mon    Tue    Wed    Thu    Fri    Sat    Sun                   │ │
│  │                                                                      │ │
│  │  RECENT FAILURES (3)                                                  │ │
│  │  · 09:47:23  "PR #1234: Rate limit exceeded"  · CODER-02             │ │
│  │  · 09:45:11  "PR #1233: Auth token expired"  · CODER-03             │ │
│  │  · 09:12:44  "PR #1231: Repository not found"  · PLANNER-01        │ │
│  │                                                                      │ │
│  │  USAGE BY AGENT                                                       │ │
│  │  CODER-01  ████████████████████████████████  45%                     │ │
│  │  CODER-02  ████████████████████             32%                     │ │
│  │  PLANNER-01 ██████████                        23%                     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Stats header**: Total skills, daily invocations, overall success rate
- **Category breakdown**: Horizontal stacked bar showing skill distribution
- **Top performers**: List of best skills by success rate, with sparkline trends
- **Underperformers**: Skills with low success rates or failing frequently, with action buttons
- **Skill detail card**: Expands to show full metrics, trend charts, failure list, and usage breakdown
- **Success rate chart**: Line chart showing 7-day trend

---

## Feature 14: Cron Job Dependency Graph

### What It Is
A **topological visualization** of scheduled jobs and their dependencies—showing which jobs trigger which, what the execution chain looks like, and where bottlenecks or circular dependencies exist.

### Why It Matters
Scheduled jobs often have hidden dependencies. Job A must run before Job B, which feeds into Job C. Visualizing this graph reveals single points of failure, opportunities for parallelization, and the blast radius of a delayed or failed job.

### Data Requirements
```typescript
interface CronJob {
  job_id: string;
  job_name: string;
  
  // Schedule
  schedule: string;              // cron expression
  next_run: number;              // unix timestamp
  last_run: number | null;
  last_status: 'success' | 'failed' | 'running' | 'skipped' | null;
  last_duration_ms: number | null;
  
  // Dependencies
  triggers: string[];             // job_ids this job triggers after completing
  triggered_by: string[];        // job_ids that trigger this job
  is_blocked_by: string[];       // job_ids that must complete before this runs
  
  // Execution
  agent_id: string | null;       // which agent executes this
  skill_id: string | null;       // which skill is invoked
  average_duration_ms: number;
  
  // Stats
  total_runs: number;
  success_count: number;
  failure_count: number;
  avg_cost_per_run: number;
}

interface CronExecution {
  execution_id: string;
  job_id: string;
  
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
  
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  
  error: string | null;
  
  triggered_subsequent: string[];  // job_ids triggered by this execution
}
```

### UI Mockup Description

**Chrono Topo Panel** (one of the feature drawers)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CRON TOPOLOGY                                        [Schedule New]      │
│  12 Jobs  ·  3 Active Now  ·  Last run: 2m ago                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  TOPOLOGY VIEW                                         [List View]          │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │                         ┌─────────┐                                  │ │
│  │                         │  DATA   │                                  │ │
│  │                         │ INGEST  │                                  │ │
│  │                         │  0 6 * * │                                  │ │
│  │                         └────┬────┘                                  │ │
│  │                              │                                       │ │
│  │              ┌───────────────┼───────────────┐                       │ │
│  │              ▼               ▼               ▼                       │ │
│  │         ┌────────┐      ┌────────┐       ┌────────┐                    │ │
│  │         │ ANALYT│      │ REPORT│       │SYNC CRM│                    │ │
│  │         │ ICS   │──────│ GENER │───────│        │                    │ │
│  │         │ 15 * *│      │ 30 8 *│       │ 45 8 * │                    │ │
│  │         └───┬───┘      └───┬───┘       └───┬────┘                    │ │
│  │             │             │               │                          │ │
│  │             └─────────────┼───────────────┘                          │ │
│  │                           ▼                                           │ │
│  │                    ┌────────────┐                                     │ │
│  │                    │  ALERT    │                                     │ │
│  │                    │  DIGEST   │                                     │ │
│  │                    │  0 9 * *  │                                     │ │
│  │                    └───────────┘                                     │ │
│  │                                                                     │ │
│  │  LEGEND:  ● Success  ◐ Running  ✗ Failed  ○ Scheduled  ║ Dependency  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  STATUS                                                      [Last Hour]  │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ ✗ DATA INGEST    Failed    09:00  ·  "Connection timeout"            │ │
│  │   ⚠ Analytics    Blocked   --     ·  Waiting on: DATA INGEST        │ │
│  │   ⚠ Report Gen   Blocked   --     ·  Waiting on: DATA INGEST        │ │
│  │   ⚠ Sync CRM    Blocked   --     ·  Waiting on: DATA INGEST        │ │
│  │   ○ Alert Digest Waiting  09:00  ·  Blocked by 3 jobs              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  UPCOMING JOBS                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ 09:45  Sync CRM       ·  Typically 45s ·  ~$0.002                     │ │
│  │ 10:00  Analytics      ·  Typically 2m  ·  ~$0.012                     │ │
│  │ 10:00  Report Gen     ·  Typically 3m  ·  ~$0.008                     │ │
│  │ 11:00  Data Ingest    ·  Daily job    ·  ~$0.045                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Topology graph**: Dagre/Dagre-style DAG layout showing job dependencies as directed edges
- **Node rendering**: Each job is a rounded rectangle with name, schedule, and status indicator
- **Edge styling**: Solid lines for dependencies, animated flow particles when job is running
- **Status colors**: Green=success, amber=running, red=failed, gray=scheduled/waiting
- **Status table**: Below graph, list of jobs with current status and failure details
- **Upcoming jobs**: Timeline list of next scheduled jobs with duration/cost estimates

**Dependency Chain View** (click on a job node)

```
┌─────────────────────────────────────────────────────────────────┐
│  JOB: Analytics Report                                      [×] │
│  ───────────────────────────────────────────────────────────────│
│  Schedule: 15 * * * (hourly)                                     │
│  Last run: 09:15 (2m ago)  ·  Status: ✓ Success  ·  1m 23s     │
│  ───────────────────────────────────────────────────────────────│
│                                                                  │
│  DEPENDENCY CHAIN                                                │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                                                           │    │
│  │   DATA INGEST ──────────▶ ANALYTICS ──────────▶ ALERT      │    │
│  │       │                      │                      │     │    │
│  │    09:00                   09:15                  10:00   │    │
│  │    ✓ 2m                    ✓ 1m 23s                ○      │    │
│  │                                                           │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  BLOCKED IF: [DATA INGEST fails]                                 │
│  TRIGGERS: [ALERT DIGEST]  [SLACK NOTIFICATION]                  │
│                                                                  │
│  HISTORY (last 10 runs)                                          │
│  ✓ 09:15  1m 23s   $0.012                                       │
│  ✓ 08:15  1m 31s   $0.014                                       │
│  ✓ 07:15  1m 18s   $0.011                                       │
│  ✗ 06:15  FAILED   "DB connection lost"                          │
│  ✓ 05:15  1m 25s   $0.013                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature 15: Real-Time Cost Per Conversation Breakdown

### What It Is
A **granular cost attribution system** that breaks down the cost of each conversation/session in real-time, showing exactly which parts of a conversation consumed which budget—model costs, token counts, skill invocations, tool calls.

### Why It Matters
Cost visibility at the conversation level enables optimization decisions: Is this conversation expensive because of the model choice? The number of tool calls? The context size? Without breakdown, you can't optimize.

### Data Requirements
```typescript
interface ConversationCost {
  session_id: string;
  
  // Timing
  started_at: number;
  last_activity: number;
  duration_seconds: number;
  
  // Overall cost
  total_cost_usd: number;
  
  // Breakdown by category
  model_costs: Record<string, {
    input_cost: number;
    output_cost: number;
    cache_read_cost: number;
    cache_write_cost: number;
    reasoning_cost: number;
  }>;
  
  token_breakdown: {
    total_input_tokens: number;
    total_output_tokens: number;
    total_cache_read_tokens: number;
    total_cache_write_tokens: number;
    total_reasoning_tokens: number;
  };
  
  skill_costs: Record<string, {
    skill_id: string;
    invocations: number;
    cost: number;
  }>;
  
  tool_costs: Record<string, {
    tool_name: string;
    calls: number;
    cost: number;
  }>;
  
  // Per-message breakdown (for detailed view)
  message_costs: Array<{
    message_index: number;
    role: string;
    token_count: number;
    cost_usd: number;
    model: string;
  }>;
}
```

### UI Mockup Description

**Session Cost Breakdown** (shown in session detail panel)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  COST BREAKDOWN                                    $0.47 / $0.89 est.    │
│  Session: "Planning trip to Tokyo"                   vs avg: $0.32       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  COST OVER TIME                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  $0.40│                          ╭────────                             │ │
│  │      │                    ╭─────╯                                     │ │
│  │  $0.30│              ╭────╯                                            │ │
│  │      │       ╭──────╯                                                  │ │
│  │  $0.20│╭─────╯                                                         │ │
│  │       │                                                                 │ │
│  │  $0.10│                        Model (78%)                              │ │
│  │       │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                                             │ │
│  │       │            ░░░░░░░░░ Skills (12%)                              │ │
│  │  $0.00│                   ▒▒▒▒ Tools (10%)                              │ │
│  │       └────────────────────────────────────────────────────────────── │ │
│  │        Message 1    Message 5    Message 10   Message 15             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  BREAKDOWN BY CATEGORY                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  MODEL COSTS                          ┌──────────────────────────┐  │ │
│  │  ───────────                           │                          │  │ │
│  │  Input tokens:  12,392   @ $3.00/M    │   ┌────────────────────┐  │  │ │
│  │  Output tokens:  2,847   @ $15.00/M  │   │  CLAUDE SONNET 4   │  │  │ │
│  │  Cache reads:     8,441   @ $0.30/M  │   │  78% of total      │  │  │ │
│  │  Cache writes:      234   @ $3.65/M │   │                    │  │  │ │
│  │  ────────────────────────────────  │   │  [Pie Chart]       │  │  │ │
│  │  Model subtotal:    $0.366          │   │                    │  │  │ │
│  ├─────────────────────────────────────┤   └────────────────────┘  │  │ │
│  │  SKILL COSTS                           │                          │  │ │
│  │  ───────────                           │  Compared to average:   │  │ │
│  │  web-search:       12 calls  $0.024    │  ▲ 47% higher           │  │ │
│  │  github-pr-review:  3 calls  $0.009    │  Reason: More web       │  │ │
│  │  code-review:      2 calls  $0.006    │  searches than typical  │  │ │
│  │  ────────────────────────────────     │                          │  │ │
│  │  Skill subtotal:   $0.056             │                          │  │ │
│  ├─────────────────────────────────────┤                          │  │ │
│  │  TOOL COSTS                            │                          │  │ │
│  │  ───────────                           │                          │  │ │
│  │  terminal:       23 calls   $0.031    │                          │  │ │
│  │  file_read:      18 calls   $0.012    │                          │  │ │
│  │  ────────────────────────────────     │                          │  │ │
│  │  Tool subtotal:   $0.047              │                          │  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  MESSAGE-LEVEL DETAIL                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Msg  │ Role      │ Tokens  │ Cost      │ Cumulative              │ │
│  │  ─────┼───────────┼─────────┼───────────┼───────────────            │ │
│  │   1   │ user      │  1,247  │  $0.0037  │  $0.0037                  │ │
│  │   2   │ assistant │    342  │  $0.0051  │  $0.0088                  │ │
│  │   3   │ tool      │    189  │  $0.0006  │  $0.0094                  │ │
│  │   4   │ assistant │    567  │  $0.0085  │  $0.0179                  │ │
│  │   5   │ user      │    892  │  $0.0027  │  $0.0206                  │ │
│  │   ... │           │   ...   │   ...     │  ...                      │ │
│  │  15   │ assistant │  1,103  │  $0.0165  │  $0.4700                  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  OPTIMIZATION SUGGESTIONS                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ 💡 Switch to gemini-2.0-flash for this task type (est. savings: $0.21)│ │
│  │ 💡 Enable prompt caching to reduce cache read costs (est. savings: $0.03)│ │
│  │ 💡 12 web searches exceed typical (3-5). Consider batching queries. │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Cost over time chart**: Stacked area chart showing cost accumulation by category (model, skill, tool) across message progression
- **Category pie chart**: Small pie chart showing proportion of each cost type
- **Detailed breakdown**: Itemized lists for model, skill, and tool costs with per-unit rates
- **Comparison to average**: Shows how this session compares to typical sessions
- **Message-level table**: Every message with token count and cumulative cost
- **Optimization suggestions**: Actionable recommendations with estimated savings

---

## Technical Implementation Notes

### Frontend Architecture
- **Framework**: React 18+ with TypeScript
- **State Management**: Zustand for global state, React Query for server state
- **Real-time**: WebSocket connection for live updates (agent heartbeats, token streaming)
- **Visualization**: D3.js for network graphs, custom SVG for flow diagrams
- **Styling**: Tailwind CSS with custom design tokens
- **Animation**: Framer Motion for transitions, CSS animations for continuous effects

### Backend Integration Points
- **Agent Registry**: WebSocket subscription to agent state changes
- **Token Streaming**: Server-Sent Events (SSE) for token delivery
- **Session Replay**: Event sourcing with event store (PostgreSQL JSONB or dedicated event store)
- **Cost Calculations**: Streaming aggregation with Redis for real-time counters
- **Skill Registry**: PostgreSQL with full-text search
- **Cron Scheduler**: Built-in scheduler with webhook notifications

### API Design
```typescript
// WebSocket events for real-time updates
type WSEvent = 
  | { type: 'agent_state'; data: AgentWorkload }
  | { type: 'token_stream'; data: TokenStreamEvent }
  | { type: 'cost_update'; data: CostSnapshot }
  | { type: 'heartbeat'; data: HeartbeatStatus }
  | { type: 'skill_invoke'; data: SkillInvocation }
  | { type: 'cron_trigger'; data: CronExecution };

// REST endpoints
GET  /api/sessions/:id/cost        → ConversationCost
GET  /api/agents                   → AgentWorkload[]
GET  /api/agents/:id/health        → HeartbeatStatus
POST /api/agents/:id/recover       → RecoveryAction
GET  /api/skills                   → SkillRegistry[]
GET  /api/skills/:id/invocations  → SkillInvocation[]
GET  /api/cron/拓扑               → CronJob[]
POST /api/cron/:id/run             → CronExecution
```

### Performance Considerations
- **Virtual scrolling**: For session replay with 10,000+ events
- **WebGL rendering**: For large agent graphs (100+ nodes)
- **Incremental cost calculation**: Real-time updates without full recalculation
- **Indexed event store**: For sub-100ms replay seeks
- **WebSocket multiplexing**: Single connection for all real-time channels

---

## File Structure

```
next-gen-ops-dashboard/
├── src/
│   ├── pages/
│   │   ├── NexusPage.tsx              # Main dashboard (Orbit View)
│   │   ├── CostNebulaPage.tsx         # Cost analytics
│   │   ├── SkillForgePage.tsx         # Skill registry
│   │   ├── MemoryAtlasPage.tsx        # Knowledge gaps
│   │   ├── GitNexusPage.tsx           # Git workflows
│   │   └── ChronoTopoPage.tsx         # Cron dependency graph
│   │
│   ├── components/
│   │   ├── orchestration/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentGraph.tsx
│   │   │   ├── AgentConnections.tsx
│   │   │   └── ModeIndicator.tsx
│   │   │
│   │   ├── token-stream/
│   │   │   ├── TokenRiver.tsx
│   │   │   ├── TokenBar.tsx
│   │   │   └── TokenSparkline.tsx
│   │   │
│   │   ├── conversation/
│   │   │   ├── ConversationTree.tsx
│   │   │   ├── ConversationNode.tsx
│   │   │   └── ConversationBreadcrumb.tsx
│   │   │
│   │   ├── cost/
│   │   │   ├── CostShield.tsx
│   │   │   ├── CostBreakdown.tsx
│   │   │   ├── CostProjection.tsx
│   │   │   └── ModelComparison.tsx
│   │   │
│   │   ├── recovery/
│   │   │   ├── RecoveryConsole.tsx
│   │   │   ├── ActionCard.tsx
│   │   │   └── DiagnosticSnapshot.tsx
│   │   │
│   │   ├── health/
│   │   │   ├── HealthGrid.tsx
│   │   │   ├── HealthCard.tsx
│   │   │   ├── HealthTimeline.tsx
│   │   │   └── StuckAlert.tsx
│   │   │
│   │   ├── security/
│   │   │   ├── PermissionTopology.tsx
│   │   │   ├── BlastRadiusMeter.tsx
│   │   │   └── AccessLog.tsx
│   │   │
│   │   ├── replay/
│   │   │   ├── SessionReplay.tsx
│   │   │   ├── PlaybackControls.tsx
│   │   │   ├── EventTimeline.tsx
│   │   │   └── AnnotationPanel.tsx
│   │   │
│   │   └── shared/
│   │       ├── AnimatedNumber.tsx
│   │       ├── GlowBadge.tsx
│   │       ├── SparklineChart.tsx
│   │       └── RadarChart.tsx
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useAgentRegistry.ts
│   │   ├── useTokenStream.ts
│   │   ├── useCostProjection.ts
│   │   └── useConversationTree.ts
│   │
│   ├── stores/
│   │   ├── agentStore.ts
│   │   ├── costStore.ts
│   │   └── sessionStore.ts
│   │
│   └── lib/
│       ├── api.ts
│       ├── websocket.ts
│       └── cost-calculator.ts
```

---

## Priority Phases

### Phase 1: Core Visibility (MVP)
1. Agent orchestration panel with health indicators
2. Token streaming visualization
3. Basic cost tracking with alerting
4. Session list with status

### Phase 2: Deep Observability
5. Conversation tree visualization
6. Skill registry with usage tracking
7. Agent health heartbeat system
8. Predictive cost alerting

### Phase 3: Operational Excellence
9. One-click recovery actions
10. Cross-model comparison
11. Session replay
12. Knowledge gap detection

### Phase 4: Advanced Integration
13. Git-native agent workflows
14. Permission boundaries visualization
15. Cron job dependency graph

---

*Document Version: 1.0*
*Last Updated: 2026-04-18*
*NEXUS: Mission Control for the AI Agent Era*
