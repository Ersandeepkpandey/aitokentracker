# Database Schema — AI Token Tracker

> Set this up first, before any other service. Every other guide depends on this schema being live.

---

## Setup

```bash
cd apps/api

# Install Prisma
pnpm add prisma @prisma/client
pnpm add -D prisma

# Initialize
pnpx prisma init

# Replace prisma/schema.prisma with the schema below
# Then run:
pnpx prisma migrate dev --name init
pnpx prisma generate
```

---

## Complete Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

enum Plan {
  FREE
  PRO
  TEAM
  ENTERPRISE
}

enum BillingInterval {
  MONTHLY
  YEARLY
}

enum AuditAction {
  USER_CREATED
  USER_UPDATED
  PLAN_CHANGED
  SESSION_SYNCED
  BUDGET_ALERT_TRIGGERED
  TEAM_MEMBER_ADDED
  TEAM_MEMBER_REMOVED
  DATA_EXPORTED
  ACCOUNT_DELETED
}

// ─────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────

model User {
  id              String    @id @default(cuid())
  clerkId         String    @unique      // Clerk user ID — the source of truth for auth
  email           String    @unique
  name            String
  avatarUrl       String?
  plan            Plan      @default(FREE)
  billingInterval BillingInterval @default(MONTHLY)

  // Stripe
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  stripeCurrentPeriodEnd DateTime?

  // Onboarding
  onboardedAt     DateTime?
  lastActiveAt    DateTime?

  // Settings (stored as JSON for flexibility)
  settings        Json      @default("{}")
  // settings shape:
  // {
  //   defaultModel: "claude-sonnet-4",
  //   timezone: "UTC",
  //   budgetAlerts: true,
  //   dailyBudget: 5.00,
  //   monthlyBudget: 50.00,
  //   emailDigest: "weekly",   // "daily" | "weekly" | "never"
  //   slackWebhookUrl: null
  // }

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  sessions        UsageSession[]
  dailyStats      DailyStats[]
  monthlyStats    MonthlyStats[]
  budgets         Budget[]
  teamMemberships TeamMember[]
  ownedTeams      Team[]       @relation("TeamOwner")
  apiKeys         ApiKey[]
  auditLogs       AuditLog[]

  @@index([email])
  @@index([clerkId])
  @@index([stripeCustomerId])
  @@index([plan])
  @@map("users")
}

// ─────────────────────────────────────────────────────────────
// USAGE SESSIONS
// One record per Claude Code / AI API session
// ─────────────────────────────────────────────────────────────

model UsageSession {
  id                String   @id    // sessionId from Claude Code JSONL filename
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // What was used
  model             String   // "claude-sonnet-4", "gpt-4o", etc.
  aiProvider        String   @default("claude")  // "claude" | "openai" | "gemini" | "mistral"
  projectName       String   @default("Unknown")
  workspacePath     String?  // absolute path of VS Code workspace root

  // Token counts (cumulative for the session)
  inputTokens       Int      @default(0)
  outputTokens      Int      @default(0)
  cacheReadTokens   Int      @default(0)
  cacheWriteTokens  Int      @default(0)
  totalTokens       Int      @default(0)  // computed: input + output + cacheRead + cacheWrite

  // Cost
  inputCostUsd      Float    @default(0)
  outputCostUsd     Float    @default(0)
  cacheReadCostUsd  Float    @default(0)
  cacheWriteCostUsd Float    @default(0)
  totalCostUsd      Float    @default(0)

  // Session metadata
  turnCount         Int      @default(0)
  vsCodeVersion     String?
  extensionVersion  String?
  osType            String?  // "darwin" | "win32" | "linux"

  // Timestamps
  sessionStartedAt  DateTime @default(now())
  lastUpdatedAt     DateTime @updatedAt

  @@index([userId, lastUpdatedAt])
  @@index([userId, sessionStartedAt])
  @@index([userId, projectName])
  @@index([userId, model])
  @@index([sessionStartedAt])
  @@map("usage_sessions")
}

// ─────────────────────────────────────────────────────────────
// DAILY STATS
// Pre-aggregated per user/date/project/model for fast dashboard queries
// Updated by a background job after each session sync
// ─────────────────────────────────────────────────────────────

model DailyStats {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  date            String   // "2025-05-02"  (stored as string for easy grouping)
  projectName     String
  model           String
  aiProvider      String

  inputTokens     Int      @default(0)
  outputTokens    Int      @default(0)
  cacheReadTokens Int      @default(0)
  cacheWriteTokens Int     @default(0)
  totalCostUsd    Float    @default(0)
  sessionCount    Int      @default(0)
  turnCount       Int      @default(0)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([userId, date, projectName, model])
  @@index([userId, date])
  @@index([userId, projectName])
  @@index([date])
  @@map("daily_stats")
}

// ─────────────────────────────────────────────────────────────
// MONTHLY STATS
// Further aggregated for billing period summaries
// ─────────────────────────────────────────────────────────────

model MonthlyStats {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  yearMonth       String   // "2025-05"
  totalCostUsd    Float    @default(0)
  totalTokens     Int      @default(0)
  totalSessions   Int      @default(0)
  totalTurns      Int      @default(0)

  // Per-model breakdown (JSON for flexibility)
  modelBreakdown  Json     @default("{}")
  // { "claude-sonnet-4": { tokens: 120000, costUsd: 0.36 }, ... }

  updatedAt       DateTime @updatedAt

  @@unique([userId, yearMonth])
  @@index([userId, yearMonth])
  @@map("monthly_stats")
}

// ─────────────────────────────────────────────────────────────
// BUDGETS
// Daily and monthly budget limits per user
// ─────────────────────────────────────────────────────────────

model Budget {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  type          String   // "daily" | "monthly"
  limitUsd      Float
  alertAt       Float    @default(0.8)  // alert when 80% spent
  hardLimit     Boolean  @default(false) // if true, block API calls over limit (Enterprise)
  active        Boolean  @default(true)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([userId, type])
  @@map("budgets")
}

// ─────────────────────────────────────────────────────────────
// TEAMS
// ─────────────────────────────────────────────────────────────

model Team {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique  // used in URLs: /team/acme-corp
  ownerId     String
  owner       User     @relation("TeamOwner", fields: [ownerId], references: [id])

  plan        Plan     @default(TEAM)
  stripeCustomerId     String? @unique
  stripeSubscriptionId String? @unique

  // Team-level budget
  monthlyBudgetUsd Float?

  // Settings
  settings    Json     @default("{}")
  // { slackWebhookUrl: null, weeklyDigestEnabled: true, allowedModels: [] }

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     TeamMember[]
  invites     TeamInvite[]

  @@map("teams")
}

model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  role      String   @default("member")  // "owner" | "admin" | "member"
  joinedAt  DateTime @default(now())

  @@unique([teamId, userId])
  @@index([userId])
  @@map("team_members")
}

model TeamInvite {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  email     String
  role      String   @default("member")
  token     String   @unique @default(cuid())
  expiresAt DateTime
  acceptedAt DateTime?

  createdAt DateTime @default(now())

  @@index([email])
  @@index([token])
  @@map("team_invites")
}

// ─────────────────────────────────────────────────────────────
// API KEYS
// For programmatic access (Pro+ feature)
// ─────────────────────────────────────────────────────────────

model ApiKey {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  name        String   // user-given label, e.g. "CI pipeline"
  keyHash     String   @unique  // bcrypt hash of the actual key — never store plaintext
  keyPrefix   String   // first 8 chars shown in UI, e.g. "att_a1b2"
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  active      Boolean  @default(true)

  createdAt   DateTime @default(now())

  @@index([userId])
  @@map("api_keys")
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG
// Immutable log of all significant actions (required for Enterprise)
// ─────────────────────────────────────────────────────────────

model AuditLog {
  id        String      @id @default(cuid())
  userId    String?
  user      User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  action    AuditAction
  metadata  Json        @default("{}")
  ipAddress String?
  userAgent String?
  createdAt DateTime    @default(now())

  @@index([userId, createdAt])
  @@index([action])
  @@index([createdAt])
  @@map("audit_log")
}
```

---

## Migration Commands

```bash
# Development — creates a migration file and applies it
pnpx prisma migrate dev --name <description>

# Production — applies pending migrations (use in CI/CD)
pnpx prisma migrate deploy

# Reset DB (dev only — destroys all data)
pnpx prisma migrate reset

# Open Prisma Studio (visual DB browser)
pnpx prisma studio

# Generate client after schema changes
pnpx prisma generate
```

---

## Seed Data

Create `prisma/seed.ts` for local development:

```typescript
import { PrismaClient, Plan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Test user
  const user = await prisma.user.upsert({
    where: { email: 'dev@test.com' },
    update: {},
    create: {
      clerkId: 'clerk_test_dev',
      email: 'dev@test.com',
      name: 'Dev User',
      plan: Plan.PRO,
      onboardedAt: new Date(),
    },
  });

  // Sample sessions
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  await prisma.usageSession.createMany({
    data: [
      {
        id: 'seed-session-001',
        userId: user.id,
        model: 'claude-sonnet-4',
        aiProvider: 'claude',
        projectName: 'my-app',
        inputTokens: 45200,
        outputTokens: 8300,
        cacheReadTokens: 12000,
        cacheWriteTokens: 0,
        totalTokens: 65500,
        inputCostUsd: 0.1356,
        outputCostUsd: 0.1245,
        cacheReadCostUsd: 0.0036,
        cacheWriteCostUsd: 0,
        totalCostUsd: 0.2637,
        turnCount: 14,
        sessionStartedAt: new Date(`${today}T09:00:00Z`),
      },
      {
        id: 'seed-session-002',
        userId: user.id,
        model: 'claude-opus-4',
        aiProvider: 'claude',
        projectName: 'my-app',
        inputTokens: 22100,
        outputTokens: 5400,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 27500,
        inputCostUsd: 0.3315,
        outputCostUsd: 0.4050,
        cacheReadCostUsd: 0,
        cacheWriteCostUsd: 0,
        totalCostUsd: 0.7365,
        turnCount: 7,
        sessionStartedAt: new Date(`${yesterday}T14:00:00Z`),
      },
    ],
    skipDuplicates: true,
  });

  // Daily stats
  await prisma.dailyStats.upsert({
    where: {
      userId_date_projectName_model: {
        userId: user.id,
        date: today,
        projectName: 'my-app',
        model: 'claude-sonnet-4',
      },
    },
    update: {},
    create: {
      userId: user.id,
      date: today,
      projectName: 'my-app',
      model: 'claude-sonnet-4',
      aiProvider: 'claude',
      inputTokens: 45200,
      outputTokens: 8300,
      cacheReadTokens: 12000,
      totalCostUsd: 0.2637,
      sessionCount: 1,
      turnCount: 14,
    },
  });

  // Budget
  await prisma.budget.upsert({
    where: { userId_type: { userId: user.id, type: 'daily' } },
    update: {},
    create: {
      userId: user.id,
      type: 'daily',
      limitUsd: 5.00,
      alertAt: 0.8,
    },
  });

  console.log('✅ Seed complete. Dev user:', user.email);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

Add to `package.json`:
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

Run: `pnpx prisma db seed`

---

## Key Database Patterns

### Upsert sessions (idempotent sync)

The extension re-sends the same sessionId on every sync tick. Always upsert, never insert blindly:

```typescript
await prisma.usageSession.upsert({
  where: { id: sessionId },
  update: {
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    totalCostUsd,
    turnCount,
    lastUpdatedAt: new Date(),
  },
  create: {
    id: sessionId,
    userId,
    model,
    aiProvider,
    projectName,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    totalCostUsd,
    turnCount,
  },
});
```

### Roll up to daily stats

After every session upsert, update `daily_stats`:

```typescript
async function rollupDailyStats(userId: string, session: UsageSession) {
  const date = session.sessionStartedAt.toISOString().slice(0, 10);
  await prisma.dailyStats.upsert({
    where: {
      userId_date_projectName_model: {
        userId,
        date,
        projectName: session.projectName,
        model: session.model,
      },
    },
    update: {
      inputTokens: { increment: 0 },      // recalculate from sessions instead:
      totalCostUsd: { increment: 0 },
      // Better: recalculate fully from source
    },
    create: { userId, date, projectName: session.projectName, model: session.model, aiProvider: session.aiProvider, inputTokens: session.inputTokens, ... },
  });
}

// Cleaner: full recalculation (run after sync, not blocking)
async function recalcDailyStats(userId: string, date: string) {
  const sessions = await prisma.usageSession.findMany({
    where: {
      userId,
      sessionStartedAt: {
        gte: new Date(`${date}T00:00:00Z`),
        lt:  new Date(`${date}T23:59:59Z`),
      },
    },
  });

  // Group by projectName + model
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = `${s.projectName}__${s.model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  for (const [key, group] of groups) {
    const [projectName, model] = key.split('__');
    const totals = group.reduce((acc, s) => ({
      inputTokens: acc.inputTokens + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + s.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + s.cacheWriteTokens,
      totalCostUsd: acc.totalCostUsd + s.totalCostUsd,
      sessionCount: acc.sessionCount + 1,
      turnCount: acc.turnCount + s.turnCount,
    }), { inputTokens:0, outputTokens:0, cacheReadTokens:0, cacheWriteTokens:0, totalCostUsd:0, sessionCount:0, turnCount:0 });

    await prisma.dailyStats.upsert({
      where: { userId_date_projectName_model: { userId, date, projectName, model } },
      update: { ...totals, aiProvider: group[0].aiProvider },
      create: { userId, date, projectName, model, aiProvider: group[0].aiProvider, ...totals },
    });
  }
}
```

### Enforce plan limits in queries

```typescript
// Only return history within the plan's allowed range
function getHistoryLimit(plan: Plan): number {
  const limits: Record<Plan, number> = {
    FREE: 30,
    PRO: 365,
    TEAM: 365,
    ENTERPRISE: 9999,
  };
  return limits[plan];
}

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - getHistoryLimit(user.plan));

const sessions = await prisma.usageSession.findMany({
  where: {
    userId: user.id,
    sessionStartedAt: { gte: cutoff },
  },
  orderBy: { sessionStartedAt: 'desc' },
  take: 100,
});
```

### Dashboard summary query

```typescript
// Get last 30 days of daily stats for charts
const stats = await prisma.dailyStats.findMany({
  where: {
    userId: user.id,
    date: { gte: thirtyDaysAgo },
  },
  orderBy: { date: 'asc' },
});

// Total spend this month
const monthlyTotal = await prisma.dailyStats.aggregate({
  where: {
    userId: user.id,
    date: { startsWith: '2025-05' },
  },
  _sum: { totalCostUsd: true, totalTokens: true },
});
```

---

## Neon.tech Setup

1. Go to [neon.tech](https://neon.tech), create a free project
2. Copy the connection string: `postgresql://user:pass@host/dbname?sslmode=require`
3. Paste into `DATABASE_URL` in your `.env`
4. Run `pnpx prisma migrate deploy`

Neon's free tier includes:
- 0.5 GB storage
- Scales to zero when idle (cold start ~1s)
- Upgrade to Pro ($19/mo) when you hit production traffic

---

## Indexes Explained

The schema has carefully placed indexes. Don't add more without measuring — over-indexing slows writes.

| Index | Purpose |
|---|---|
| `users.email` | Login lookup |
| `users.clerkId` | Auth middleware lookup on every request |
| `usage_sessions.[userId, lastUpdatedAt]` | Dashboard "recent sessions" query |
| `usage_sessions.[userId, projectName]` | Per-project filtering |
| `daily_stats.[userId, date]` | Chart data queries |
| `daily_stats.[date]` | Global analytics (admin) |
| `audit_log.[userId, createdAt]` | User's own audit trail |
| `audit_log.[createdAt]` | Admin time-range queries |
