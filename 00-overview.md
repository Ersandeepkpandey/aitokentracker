# AI Token Tracker — Master Overview

> Hand this folder to a developer. Every decision is pre-made. Every file has a purpose. Start with this document, then follow the numbered guides in order.

---

## What We're Building

A VS Code extension + web platform that tracks AI token usage and cost in real-time across Claude, OpenAI, and other AI APIs. Users install the extension, create a free account, and immediately see token counts and cost in their status bar. Premium users get cost prediction, model comparison, and team dashboards.

---

## File Reading Order

```
00-overview.md          ← you are here (read first)
01-database.md          ← set up DB before anything else
02-backend.md           ← build the API server
03-extension.md         ← build the VS Code extension
04-website.md           ← build landing page + auth + user dashboard
```

Each guide is fully self-contained. A developer can work on backend and extension in parallel after reading both guides.

---

## Product Tiers

| Plan | Price | Key Limits |
|---|---|---|
| Free | $0/forever | Claude only, 30-day history, local tracking |
| Pro | $9/mo | All AI models, unlimited history, cost prediction, model comparison, budget alerts, CSV export |
| Team | $19/seat/mo | Everything Pro + team dashboard, per-dev attribution, shared budgets, Slack reports |
| Enterprise | Custom | SSO, audit logs, self-hosted option, budget enforcement |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VS CODE EXTENSION                                          │
│                                                             │
│  fs.watch(~/.claude/*.jsonl)  →  tokenTracker.ts           │
│  tokenUsage events            →  statusBar + webviewPanel  │
│  authManager.ts               →  SecretStorage (OS keychain)│
│  usageSync.ts                 →  POST /usage/sync (10s)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + Bearer token
┌──────────────────────────▼──────────────────────────────────┐
│  BACKEND API  (Node.js + Fastify on Railway)                │
│                                                             │
│  /auth/*      ← Clerk webhooks + token exchange            │
│  /usage/*     ← ingest + query session data                │
│  /billing/*   ← Stripe checkout + webhooks                 │
│  /team/*      ← team management (Phase 2)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  DATABASE  (PostgreSQL on Neon.tech)                        │
│                                                             │
│  users          sessions        daily_stats                 │
│  team_members   budgets         audit_log                   │
└─────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  WEBSITE  (Next.js 14 on Vercel)                            │
│                                                             │
│  /                 ← landing page                          │
│  /pricing          ← plan picker                           │
│  /auth/vscode      ← OAuth callback entry point            │
│  /dashboard        ← user's usage charts + history         │
│  /team             ← team admin (Phase 2)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (All Decisions Pre-Made)

### Backend
| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable, massive ecosystem |
| Framework | Fastify 4 | 2× faster than Express, built-in schema validation |
| Database | PostgreSQL via Neon.tech | Serverless Postgres, generous free tier, scales to millions of rows |
| ORM | Prisma 5 | Type-safe, great migrations, excellent DX |
| Auth | Clerk.com | Handles signup/login/social/MFA — don't build this |
| Payments | Stripe | Industry standard, excellent webhooks |
| Hosting | Railway.app | Git-push deploys, $5/mo to start, Postgres addon optional |
| Email | Resend.com | 3000 free emails/mo, React email templates |
| Queue (Phase 2) | BullMQ + Redis | Async processing for team rollups, anomaly detection |

### VS Code Extension
| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5 | Required for VS Code API, type-safe |
| Bundler | esbuild | 100× faster than webpack, tiny output |
| Storage | VS Code SecretStorage | OS keychain, encrypted — never use globalState for tokens |
| HTTP | Node built-in fetch | No extra deps needed |
| File watching | Node fs.watch | Built-in, reliable for JSONL tailing |

### Website
| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR for SEO, API routes, easy auth integration |
| UI | shadcn/ui + Tailwind CSS | Consistent, accessible, copy-paste components |
| Charts | Recharts | React-native, responsive, good DX |
| Auth | Clerk (Next.js SDK) | Same provider as backend — one system |
| Deploy | Vercel | Zero-config Next.js, free tier |

---

## Environment Variables Master List

Keep a `.env.example` at the repo root with all of these. Never commit real values.

### Backend `.env`
```env
# Database
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"

# Clerk (get from clerk.com dashboard)
CLERK_SECRET_KEY="sk_live_..."
CLERK_WEBHOOK_SECRET="whsec_..."

# Stripe (get from stripe.com dashboard)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_PRO_MONTHLY="price_..."
STRIPE_PRICE_TEAM_MONTHLY="price_..."

# App
API_BASE_URL="https://api.aitokentracker.com"
APP_BASE_URL="https://aitokentracker.com"
JWT_SECRET="generate-with-openssl-rand-base64-32"
NODE_ENV="production"
PORT=3001
```

### Website `.env.local`
```env
# Clerk (Next.js)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/onboarding"

# Backend API
NEXT_PUBLIC_API_URL="https://api.aitokentracker.com"

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
```

### Extension (injected at build time via esbuild define)
```env
API_BASE=https://api.aitokentracker.com
APP_BASE=https://aitokentracker.com
```

---

## Monorepo Structure (Recommended)

```
aitokentracker/
├── apps/
│   ├── api/              ← Fastify backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   └── index.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── package.json
│   │   └── .env
│   │
│   ├── web/              ← Next.js website
│   │   ├── app/
│   │   ├── components/
│   │   ├── package.json
│   │   └── .env.local
│   │
│   └── extension/        ← VS Code extension
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/           ← shared types (UsageSession, Plan, etc.)
│       ├── src/types.ts
│       └── package.json
│
├── package.json          ← workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── .env.example
```

---

## Local Development Setup

```bash
# Prerequisites: Node 20+, pnpm, Docker (for local Postgres)

# 1. Clone and install
git clone https://github.com/yourorg/aitokentracker
cd aitokentracker
pnpm install

# 2. Start local Postgres
docker run -d --name aitokentracker-db \
  -e POSTGRES_DB=aitokentracker \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev \
  -p 5432:5432 postgres:16

# 3. Copy env files and fill in values
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Run DB migrations
cd apps/api
pnpm prisma migrate dev

# 5. Start all services
cd ../..
pnpm dev     # starts api (port 3001) + web (port 3000) concurrently

# 6. Run extension in VS Code
cd apps/extension
code .       # then press F5 to launch Extension Development Host
```

---

## Deployment Checklist

### First Deploy
- [ ] Create Neon.tech project → copy `DATABASE_URL`
- [ ] Create Clerk application → copy keys, configure OAuth
- [ ] Create Stripe account → create products/prices, configure webhooks
- [ ] Create Railway project → link GitHub repo, set env vars, deploy API
- [ ] Create Vercel project → link GitHub repo, set env vars, deploy website
- [ ] Run `pnpm prisma migrate deploy` against production DB
- [ ] Test full auth flow end-to-end
- [ ] Package extension `.vsix` with production `API_BASE` and `APP_BASE`
- [ ] Submit to VS Code Marketplace

### Ongoing
- [ ] Set up GitHub Actions: test → build → deploy on merge to main
- [ ] Set up Sentry for error tracking (free tier)
- [ ] Set up Axiom or Logtail for log aggregation

---

## Phase Delivery Schedule

| Phase | What | Timeline |
|---|---|---|
| 0 | Monorepo setup, DB live, auth endpoints working | Week 1 |
| 1 | Extension with local tracking + onboarding + sync | Weeks 2–3 |
| 2 | User dashboard (charts, history, export) | Weeks 4–6 |
| 3 | Pro features: cost prediction, model comparison, budget alerts | Weeks 7–10 |
| 4 | Team plan: team dashboard, per-dev attribution | Weeks 11–14 |
| 5 | Enterprise: SSO, audit log, self-hosted | Month 4+ |
