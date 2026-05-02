# Phase 2 — AI Token Tracker Product Spec

> This document is the single source of truth for Phase 2. Hand it to Claude Code after Phase 1 is complete.

---

## What Phase 2 Solves

Phase 1 answers: *"how many tokens did I use?"*
Phase 2 answers: *"what did it cost, why, and how do I reduce it?"*

The shift from tokens to cost is the upgrade wall. Free users see tokens. Pro users see everything.

---

## Free vs Pro — The Exact Split

Every feature decision in Phase 2 follows one rule:

> **Free users feel the shape of the product. Pro users get the value.**

| Feature | Free | Pro |
|---|---|---|
| Status bar — token count | ✅ always visible | ✅ |
| Status bar — cost | ❌ hidden | ✅ live cost |
| Status bar — live streaming ticker | ❌ | ✅ ticks up as response streams |
| Pre-send token count | ✅ (builds trust) | ✅ |
| Pre-send input cost | ❌ | ✅ exact |
| Dashboard access | 👁 locked preview (blurred + lock icon) | ✅ full |
| Session history | ❌ | ✅ 365 days |
| Daily cost chart | ❌ blurred | ✅ |
| Per-project breakdown | ❌ blurred | ✅ |
| Model comparison | ❌ | ✅ |
| Budget alerts | ❌ | ✅ |
| CSV export | ❌ | ✅ |
| All AI models | Claude only | ✅ Claude + GPT + Gemini |
| Weekly email digest | ❌ | ✅ |

### Why pre-send token count is free

If a free user pastes a 50,000 token file by accident and sees "48,200 input tokens" before sending, they catch the mistake without knowing the cost. That moment builds enough trust to upgrade. It is the product's best advertisement — keep it free.

### The locked dashboard rule

Never hide the dashboard entirely. Show it, blur the data, overlay a lock:

```
┌────────────────────────────────────────┐
│  📊 Your Usage Dashboard               │
│                                        │
│  ░░░░░░░░░░░░░░░░░░  ← blurred chart  │
│  ░░░░░░░░                              │
│                                        │
│  ┌──────────────────────────────┐      │
│  │ 🔒 Unlock your dashboard     │      │
│  │                              │      │
│  │ Cost breakdown, daily trends │      │
│  │ and project attribution are  │      │
│  │ Pro features.                │      │
│  │                              │      │
│  │ [ Upgrade to Pro — $9/mo ]   │      │
│  └──────────────────────────────┘      │
└────────────────────────────────────────┘
```

The blurred chart is the ad. The user sees enough to know what they're missing.

### The status bar upgrade hook

Free users hover the status bar and see:

```
Token count: 12,340
Cost: 🔒 Pro feature

[Upgrade — $9/mo]
```

Single click to Stripe checkout from a tooltip. That is the conversion path.

---

## Feature 1 — Pre-Send Input Cost Warning

### What it does

Before the user's prompt is sent, intercept it, count tokens using Anthropic's countTokens API (free, ~100ms), and show the input cost. No output estimation — ever. Only show numbers we know with 100% certainty.

### What we show

```
┌──────────────────────────────────────┐
│  ◈ Prompt ready to send              │
│                                      │
│  Input tokens:  8,420                │
│  Input cost:    $0.025  ← exact      │
│                                      │
│  Output cost shown after response.   │
│                                      │
│  [Send]              [Cancel]        │
└──────────────────────────────────────┘
```

No guesses. No estimates. No "~". Just the one number that is provably exact at this moment.

### When to show the warning

Don't show it on every prompt — that becomes noise and users dismiss it. Show it only when the input is notably large relative to the user's history:

```typescript
// Alert threshold logic
const userAvgInputCost = await getUserAverageInputCost(userId); // from DB
const warningThreshold = Math.max(userAvgInputCost * 4, 0.05);
// Alert if 4× their average OR over $0.05 — whichever is larger

if (inputCost > warningThreshold) {
  showPreSendWarning({ inputTokens, inputCost, warningThreshold });
}
```

A developer who normally sends $0.001 prompts gets warned at $0.004.
A developer who normally sends $0.05 prompts doesn't get warned until $0.20.
Personalised — no false positives.

### Why the prompt is expensive — detection

When showing the warning, also tell the user *why*:

```typescript
function detectExpensiveReason(inputTokens: number, messages: Message[]): string {
  // Large file pasted in (many newlines, long content)
  const hasLargeCodeBlock = messages.some(m =>
    typeof m.content === 'string' && m.content.length > 8000
  );
  if (hasLargeCodeBlock) return 'Large file or code block in context';

  // Long conversation history
  if (messages.length > 15) return `Long conversation history (${messages.length} turns)`;

  // Large system prompt
  const systemTokens = await countSystemPromptTokens();
  if (systemTokens > 2000) return `System prompt is ${systemTokens} tokens`;

  // Generic
  return `Larger than your usual prompts`;
}
```

Show this as a single line under the cost:
```
Input cost: $0.025
Why: Large file in context (6,100 of 8,420 tokens)
```

### Free user behaviour

Free users see:
```
┌──────────────────────────────────────┐
│  ◈ Prompt ready to send              │
│                                      │
│  Input tokens:  8,420                │
│  Input cost:    🔒 Pro feature       │
│                                      │
│  [Send]  [Upgrade to see cost]       │
└──────────────────────────────────────┘
```

They see the token count (useful, builds trust). The cost is locked. The "Upgrade" button is right there at the moment they're most curious.

---

## Feature 2 — Live Streaming Cost Ticker

### What it does

As the AI response streams in, the status bar updates in real time showing the running cost. The number ticks up token by token until the response is complete. Then it settles on the final exact total.

```
Sending...      ◈ Claude: $0.025 ↑
Streaming...    ◈ Claude: $0.031 ↑
Streaming...    ◈ Claude: $0.044 ↑
Streaming...    ◈ Claude: $0.058 ↑
Done            ◈ Claude: $0.071 ✓  (saved to dashboard)
```

This is the most viscerally engaging feature in the product. Watching cost tick up in real time makes developers immediately aware of what their AI usage actually means. No estimation — Anthropic streams token counts in each chunk.

### Implementation

```typescript
// In SDK wrapper — wraps anthropic.messages.stream()
async function trackedStream(params: MessageCreateParams) {
  const inputCount = await anthropic.messages.countTokens(params);
  const inputCost = calcInputCost(params.model, inputCount.input_tokens);

  let outputTokens = 0;
  statusBar.text = `◈ Claude: $${inputCost.toFixed(4)} ↑`;

  const stream = anthropic.messages.stream(params);
  let lastUpdate = 0;

  stream.on('text', (_, snapshot) => {
    // Throttle status bar updates to every 300ms
    const now = Date.now();
    if (now - lastUpdate < 300) return;
    lastUpdate = now;

    // Approximate output tokens from character count during stream
    // (exact count arrives in the final message event)
    const approxOutputTokens = Math.floor(snapshot.length / 4);
    const runningCost = inputCost + calcOutputCost(params.model, approxOutputTokens);
    statusBar.text = `◈ Claude: $${runningCost.toFixed(4)} ↑`;
  });

  stream.on('message', (message) => {
    // Final message has exact token counts — use these for everything
    const exact = {
      input:      message.usage.input_tokens,
      output:     message.usage.output_tokens,
      cacheRead:  message.usage.cache_read_input_tokens  || 0,
      cacheWrite: message.usage.cache_creation_input_tokens || 0,
    };
    const finalCost = calcCost(params.model, exact);

    // Status bar settles on exact number
    statusBar.text = `◈ Claude: $${finalCost.toFixed(4)} ✓`;

    // Sync exact data to backend
    usageSync.record({ ...exact, cost: finalCost, model: params.model });
  });

  return stream;
}
```

### Free user behaviour

Free users see token count only — no cost:

```
Sending...      ◈ Claude: 8.4K tokens ↑
Streaming...    ◈ Claude: 9.1K tokens ↑
Done            ◈ Claude: 11.2K tokens ✓
```

Same animation, same engagement — number is just tokens not cost. They feel the product working. They wonder what it costs. They upgrade.

---

## Feature 3 — The Dashboard (Pro Only, Locked Preview for Free)

### Dashboard layout

```
┌─────────────────────────────────────────────────────────┐
│  ◈ AI Token Tracker          Jane Smith  [Pro] [Settings]│
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Overview    │  Overview                                │
│  Sessions    │                                          │
│  Projects    │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  Models      │  │Today │ │Month │ │Tokens│ │Sessns│  │
│  Settings    │  │$0.07 │ │$4.21 │ │1.2M  │ │  34  │  │
│              │  └──────┘ └──────┘ └──────┘ └──────┘  │
│  ──────────  │                                          │
│  Upgrade ↑   │  Daily cost — last 30 days              │
│  (free only) │  [bar chart]                             │
│              │                                          │
│              │  Recent sessions                         │
│              │  [table]                                 │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

### Summary cards

Four cards at the top, always visible to Pro:

```typescript
const cards = [
  { label: "Today's cost",   value: `$${todayCost.toFixed(4)}` },
  { label: "This month",     value: `$${monthCost.toFixed(2)}` },
  { label: "Total tokens",   value: fmtTokens(totalTokens) },
  { label: "Sessions",       value: sessionCount.toString() },
];
```

### Daily cost chart

30-day bar chart (Pro) — shows cost per day grouped by model with color coding.

```typescript
// Data structure for chart
interface DayBar {
  date: string;      // "May 2"
  claude: number;    // cost in USD
  openai: number;
  total: number;
}
```

### Sessions table

Most recent 20 sessions, sortable:

| Time | Project | Model | Input | Output | Cost |
|---|---|---|---|---|---|
| 2:14pm | my-app | sonnet-4 | 8,420 | 2,341 | $0.071 |
| 1:50pm | my-app | sonnet-4 | 3,200 | 890 | $0.023 |

### Projects tab

Cost grouped by workspace/project:

| Project | Sessions | Tokens | Cost | Trend |
|---|---|---|---|---|
| my-app | 28 | 420K | $1.84 | ↑ +12% |
| api-server | 12 | 180K | $0.91 | ↓ -5% |

### Models tab

Cost and token efficiency per model used:

| Model | Uses | Avg Cost | Avg Tokens | Cache Hit% |
|---|---|---|---|---|
| claude-sonnet-4 | 34 | $0.042 | 11.2K | 28% |
| claude-opus-4 | 6 | $0.318 | 22.1K | 0% |

### Locked state for free users

The dashboard is accessible but data is blurred and overlaid with an upgrade prompt. The sidebar navigation is visible. The layout is visible. Only the actual numbers and charts are locked.

```tsx
// Dashboard page component
export default function DashboardPage() {
  const { plan } = useUser();
  const isPro = plan !== 'free';

  return (
    <div className="relative">
      {/* Always show the layout */}
      <SummaryCards data={isPro ? realData : placeholderData} locked={!isPro} />

      {/* Chart — blurred for free */}
      <div className="relative">
        <DailyChart data={isPro ? realData : placeholderData} />
        {!isPro && <LockedOverlay feature="Daily cost chart" />}
      </div>

      {/* Sessions — first 3 rows visible, rest locked */}
      <SessionsTable
        sessions={isPro ? sessions : sessions.slice(0, 3)}
        locked={!isPro}
        lockedMessage="See all sessions with Pro"
      />
    </div>
  );
}

function LockedOverlay({ feature }: { feature: string }) {
  return (
    <div className="absolute inset-0 backdrop-blur-sm bg-white/60 flex items-center justify-center rounded-xl">
      <div className="text-center p-6 bg-white border border-gray-200 rounded-xl shadow-sm max-w-xs">
        <div className="text-2xl mb-2">🔒</div>
        <p className="font-medium text-gray-900 mb-1">{feature}</p>
        <p className="text-sm text-gray-500 mb-4">Available on the Pro plan</p>
        <UpgradeButton />
      </div>
    </div>
  );
}
```

---

## Feature 4 — Model Comparison

### What it does

After every session (Pro only), calculate what the same token counts would have cost on other models. Show a passive card in the dashboard — never an interruption.

```
┌─────────────────────────────────────────────────────┐
│  💡 Cost comparison — last session                  │
│                                                     │
│  You used:  Claude Opus 4        $0.84              │
│                                                     │
│  Same tokens on other models:                       │
│  Claude Sonnet 4    $0.17    80% cheaper            │
│  Claude Haiku 3.5   $0.04    95% cheaper            │
│  GPT-4o             $0.21    75% cheaper            │
│                                                     │
│  Sonnet 4 handles most coding tasks equally well.  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Pure arithmetic — no AI involved. Take actual token counts, run through pricing table for each model. 100% accurate because the tokens are known.

```typescript
function compareModels(actualModel: string, tokens: TokenUsage): ModelComparison[] {
  const models = ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-3-5', 'gpt-4o', 'gpt-4o-mini'];

  return models
    .filter(m => m !== actualModel)
    .map(m => ({
      model: m,
      cost: calcCost(m, tokens),
      savingPct: Math.round((1 - calcCost(m, tokens) / calcCost(actualModel, tokens)) * 100),
    }))
    .sort((a, b) => a.cost - b.cost);
}
```

---

## Feature 5 — Budget Alerts (Pro) and Enforcement (Pro)

### Alerts

When a user's daily spend crosses their alert threshold (default 80% of budget):

- VS Code notification: "You've spent $4.02 of your $5.00 daily budget"
- Email alert (if enabled in settings)
- Dashboard badge showing budget status

### Soft enforcement (Pro)

When 100% is hit, show a persistent VS Code warning notification — not a block, just a visible warning that stays until dismissed.

### Hard enforcement (optional Pro setting)

User can opt into hard enforcement — the SDK wrapper returns an error instead of sending:

```typescript
if (hardLimitEnabled && costToday >= dailyLimit) {
  throw new BudgetExceededError({
    message: `Daily budget of $${dailyLimit} reached`,
    spent: costToday,
    limit: dailyLimit,
    resetsAt: tomorrowMidnight(),
  });
}
```

Hard enforcement is opt-in, off by default. Developers who want it know they want it.

---

## Feature 6 — Weekly Email Digest (Pro)

Sent every Monday at 9am user's timezone. Not a generic report — a specific insight email.

```
Subject: Your AI usage last week — $12.40 across 47 sessions

Hi Jane,

Last week breakdown:
  Total cost:     $12.40
  Total tokens:   4.1M
  Sessions:       47
  Most used:      Claude Sonnet 4 (82%)

Your most expensive project: checkout-refactor ($8.20, 66% of total)
Your cache hit rate: 34%

One thing to try this week:
  Your system prompt is sent on every turn (1,200 tokens each time).
  Enabling prompt caching could save ~$2.10/week based on your usage.

[View full dashboard →]

— AI Token Tracker
```

The insight at the bottom is rule-based, not AI-generated:
- High system prompt token count → suggest prompt caching
- Low cache hit rate → explain prompt caching
- One project dominates spend → highlight it
- Using expensive model frequently → show model comparison

One insight per email — not a list. More digestible, more likely to be acted on.

---

## The SDK Wrapper Package

### What it is

An npm package (`@aitokentracker/sdk`) that wraps the Anthropic and OpenAI clients. The user changes one line of code — nothing else in their project changes.

```bash
npm install @aitokentracker/sdk
```

```typescript
// Before
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

// After — one line change
import { track } from '@aitokentracker/sdk';
import Anthropic from '@anthropic-ai/sdk';
const client = track(new Anthropic(), { userId: process.env.ATT_USER_ID });
```

### What it intercepts

```
messages.create()    → count tokens pre-send, record usage post-response
messages.stream()    → live ticker during stream, exact count on complete
messages.countTokens() → passthrough (already free, just track it was called)
```

### Authentication

The SDK reads the user's token from:
1. `options.userId` passed directly
2. `ATT_USER_ID` environment variable
3. A `.aitokentracker` config file in the project root

### VS Code integration

When the VS Code extension is installed, the SDK communicates with it via a local named pipe (IPC). The extension registers a listener:

```typescript
// Extension listens for SDK events
const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const event = JSON.parse(data.toString());
    if (event.type === 'pre_send') showPreSendNotification(event);
    if (event.type === 'streaming') updateStatusBarLive(event.cost);
    if (event.type === 'complete') finalizeAndSync(event);
  });
});
server.listen('/tmp/aitokentracker.sock');
```

If the extension is not installed (SDK used in CI/scripts/servers), it falls back to sending data directly to the backend API. Works either way.

---

## Upgrade Flow — Frictionless by Design

Every locked feature has one upgrade path: single click to Stripe checkout, pre-filled with their email, lands on dashboard after payment.

```typescript
// Anywhere in the extension or website
function openUpgradeFlow(source: string) {
  vscode.env.openExternal(
    vscode.Uri.parse(`https://aitokentracker.com/upgrade?ref=${source}&prefill=true`)
  );
}

// Called from:
// - Status bar hover (cost locked)
// - Pre-send notification (cost locked)
// - Dashboard locked overlay
// - Sidebar upgrade button
```

The `source` parameter tracks where upgrades come from — status bar, dashboard, pre-send warning — so you know which conversion point works best.

---

## Backend Changes for Phase 2

### New endpoints needed

```
POST /usage/pre-send-count        Count tokens pre-send, log the count
GET  /usage/model-comparison/:sessionId   Return cost on all models for a session
GET  /usage/weekly-summary        Used by digest email cron job
PUT  /user/budget                 Set daily/monthly budget + alert threshold
POST /user/budget/check           Check if over budget (called by SDK)
GET  /usage/insights              Rule-based insight for weekly email
```

### New DB fields needed

Add to `usage_sessions`:
```prisma
preSendInputTokens   Int?    // tokens counted before send
preSendInputCost     Float?  // cost shown in warning
warningShown         Boolean @default(false)
sdkVersion           String?
```

Add to `users` settings JSON:
```json
{
  "dailyBudget": 5.00,
  "monthlyBudget": 50.00,
  "hardLimitEnabled": false,
  "alertThresholdPct": 0.80,
  "weeklyDigestEnabled": true,
  "weeklyDigestDay": "monday",
  "weeklyDigestTime": "09:00",
  "timezone": "UTC"
}
```

### New cron jobs

```typescript
// Weekly digest — runs every Monday at 9am UTC
// Adjust per user timezone using their settings.timezone
cron.schedule('0 9 * * 1', async () => {
  const proUsers = await prisma.user.findMany({
    where: {
      plan: { in: ['PRO', 'TEAM', 'ENTERPRISE'] },
      settings: { path: ['weeklyDigestEnabled'], equals: true },
    },
  });

  for (const user of proUsers) {
    const stats = await getWeeklySummary(user.id);
    const insight = await generateInsight(user.id, stats);
    await sendWeeklyDigest(user.email, user.name, stats, insight);
  }
});

// Daily budget check — runs every hour
cron.schedule('0 * * * *', async () => {
  await checkAllUserBudgets();
});
```

---

## Extension Changes for Phase 2

### Status bar states

```typescript
// Free user
statusBar.text = `◈ Claude: ${fmt(tokens)} tokens`;
statusBar.tooltip = `Token count: ${tokens.toLocaleString()}\nCost: 🔒 Upgrade to Pro\n\nClick to open dashboard`;

// Pro user — idle
statusBar.text = `◈ Claude: ${fmt(tokens)} · $${cost.toFixed(4)}`;

// Pro user — streaming
statusBar.text = `◈ Claude: $${runningCost.toFixed(4)} ↑`;

// Pro user — just completed
statusBar.text = `◈ Claude: $${finalCost.toFixed(4)} ✓`;
setTimeout(() => resetStatusBar(), 5000);

// Not signed in
statusBar.text = `◈ Claude: — $(account) Sign in`;
```

### New commands

```json
"commands": [
  { "command": "aiTokenTracker.showDashboard" },
  { "command": "aiTokenTracker.signIn" },
  { "command": "aiTokenTracker.signOut" },
  { "command": "aiTokenTracker.resetSession" },
  { "command": "aiTokenTracker.setModel" },
  { "command": "aiTokenTracker.viewPlans" },
  { "command": "aiTokenTracker.setBudget" },        ← new Phase 2
  { "command": "aiTokenTracker.compareModels" },    ← new Phase 2
  { "command": "aiTokenTracker.exportData" }        ← new Phase 2
]
```

---

## Dashboard — Webview Changes for Phase 2

### Free user dashboard (locked state)

```
┌─────────────────────────────────────────────────┐
│ ◈ AI Token Tracker                    [Sign In] │
├────────────────────────────────────────────────-┤
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 8.4K     │ │ 🔒 $---  │ │ 🔒 $---  │        │
│  │ tokens   │ │ today    │ │ this mo  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  [blurred chart]                        │   │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       │   │
│  │  ┌───────────────────────────────┐      │   │
│  │  │ 🔒 Daily cost chart           │      │   │
│  │  │ See your spending over time   │      │   │
│  │  │ with Pro.                     │      │   │
│  │  │ [Upgrade — $9/mo]             │      │   │
│  │  └───────────────────────────────┘      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

Token count card is always real and unlocked. Cost cards are locked with `$---`. Chart is blurred with upgrade overlay.

---

## Phase 2 Delivery Schedule

```
Week 4   SDK wrapper npm package scaffold + IPC with extension
Week 5   Pre-send token count notification (free: tokens only, pro: cost)
Week 6   Live streaming ticker in status bar
Week 7   Dashboard — Pro full access + free locked preview state
Week 8   Model comparison card in dashboard
Week 9   Budget alerts + optional hard enforcement
Week 10  Weekly digest email (cron + Resend templates)
Week 11  Projects tab + Models tab in dashboard
Week 12  CSV export (Pro) + settings page
```

---

## Success Metrics for Phase 2

| Metric | Target |
|---|---|
| Free → Pro conversion rate | > 8% |
| Pre-send warning shown per day (per Pro user) | 2–5 (if more, threshold is too low) |
| Weekly digest open rate | > 40% |
| Upgrade source — status bar hover | track this |
| Upgrade source — dashboard lock | track this |
| Upgrade source — pre-send warning | track this |

The upgrade source tracking tells you which conversion point to double down on in Phase 3.

---

## What Phase 2 Does NOT Include

Deliberately out of scope — save for Phase 3:

- Team plan (invite flow, team dashboard, shared budgets)
- Prompt optimisation suggestions (AI-powered)
- Context trimmer
- Anomaly detection
- Per-file token attribution
- Browser extension

Phase 2 is about making the individual Pro experience so good that developers tell their teams about it. Team plan comes after word of mouth starts.
