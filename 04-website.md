# Website & Frontend — Build Guide

> Next.js 14, Clerk auth, Stripe billing, usage dashboard. Everything the user sees outside VS Code.

---

## Project Setup

```bash
cd apps/web

# Create Next.js app
pnpx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-turbopack

# Install dependencies
pnpm add @clerk/nextjs stripe @stripe/stripe-js
pnpm add recharts date-fns
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs
pnpm add lucide-react clsx tailwind-merge
pnpm add -D @types/node
```

---

## File Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx                  ← root layout with Clerk provider
│   ├── page.tsx                    ← landing page
│   ├── pricing/
│   │   └── page.tsx
│   ├── auth/
│   │   ├── vscode/
│   │   │   └── page.tsx            ← OAuth entry point from extension
│   │   ├── sign-in/
│   │   │   └── [[...sign-in]]/page.tsx
│   │   └── sign-up/
│   │       └── [[...sign-up]]/page.tsx
│   ├── onboarding/
│   │   └── page.tsx                ← shown after first signup
│   ├── dashboard/
│   │   ├── layout.tsx              ← sidebar layout
│   │   ├── page.tsx                ← overview with charts
│   │   ├── sessions/page.tsx
│   │   ├── projects/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── usage/[...route]/route.ts   ← proxies to backend API
│       └── billing/[...route]/route.ts
├── components/
│   ├── ui/                         ← shadcn components
│   ├── charts/
│   │   ├── DailyUsageChart.tsx
│   │   ├── ModelBreakdownChart.tsx
│   │   └── CostTrendChart.tsx
│   ├── dashboard/
│   │   ├── SummaryCards.tsx
│   │   ├── SessionsTable.tsx
│   │   └── ProjectsTable.tsx
│   └── landing/
│       ├── Hero.tsx
│       ├── Features.tsx
│       └── Pricing.tsx
└── lib/
    ├── api.ts                      ← typed fetch wrapper for backend
    └── utils.ts
```

---

## Root Layout with Clerk

`src/app/layout.tsx`:
```tsx
import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

`middleware.ts` (root of `apps/web`):
```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/onboarding(.*)']);

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) auth().protect();
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

---

## The VS Code Auth Entry Point

This is the most important page. The extension opens this URL in the browser.

`src/app/auth/vscode/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser, SignIn } from '@clerk/nextjs';
import { useSearchParams, useRouter } from 'next/navigation';

export default function VsCodeAuthPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'error'>('loading');

  const state = searchParams.get('state');
  const callbackUrl = searchParams.get('callback');

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && state && callbackUrl) {
      // User is signed in — call backend to generate exchange code, then redirect to extension's local server
      generateCodeAndRedirect();
    }
  }, [isLoaded, isSignedIn]);

  async function generateCodeAndRedirect() {
    try {
      setStatus('redirecting');
      // Get a fresh Clerk session token to call your backend
      const clerkToken = await user?.getToken();

      // Your backend creates a short-lived exchange code
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/vscode-callback?userId=${user?.id}&state=${state}&callbackUrl=${encodeURIComponent(callbackUrl!)}`, {
        headers: { Authorization: `Bearer ${clerkToken}` },
      });

      if (!res.ok) throw new Error('Failed to generate code');

      // Backend redirects to the extension's local server automatically
      window.location.href = res.url;
    } catch (err) {
      setStatus('error');
    }
  }

  if (!isLoaded) {
    return <AuthPageLayout><LoadingSpinner /></AuthPageLayout>;
  }

  if (!isSignedIn) {
    // Show Clerk's sign-in/sign-up UI — user is not logged in yet
    return (
      <AuthPageLayout>
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">◈</div>
          <h1 className="text-xl font-semibold mb-2">Sign in to AI Token Tracker</h1>
          <p className="text-sm text-gray-500">
            You're connecting your VS Code extension. Sign in or create a free account below.
          </p>
        </div>
        <SignIn
          redirectUrl={`/auth/vscode?state=${state}&callback=${encodeURIComponent(callbackUrl || '')}`}
          appearance={{ elements: { card: 'shadow-none border border-gray-200' } }}
        />
      </AuthPageLayout>
    );
  }

  if (status === 'redirecting') {
    return (
      <AuthPageLayout>
        <div className="text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-lg font-medium mb-2">Signed in! Connecting to VS Code...</h2>
          <p className="text-sm text-gray-500">You can close this tab once VS Code confirms.</p>
        </div>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <div className="text-center text-red-500">
        Something went wrong. Please try again from VS Code.
      </div>
    </AuthPageLayout>
  );
}

function AuthPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function LoadingSpinner() {
  return <div className="flex justify-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" /></div>;
}
```

---

## Onboarding Page (After Sign-Up)

`src/app/onboarding/page.tsx`:
```tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import PlanSelector from './PlanSelector';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">◈</div>
          <h1 className="text-2xl font-bold mb-2">Welcome to AI Token Tracker</h1>
          <p className="text-gray-500">Choose a plan to get started. You can upgrade anytime.</p>
        </div>
        <PlanSelector />
        <p className="text-center text-sm text-gray-400 mt-6">
          Questions? <a href="mailto:hello@aitokentracker.com" className="underline">Contact us</a>
        </p>
      </div>
    </div>
  );
}
```

---

## API Client

`src/lib/api.ts`:
```typescript
import { auth } from '@clerk/nextjs/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

async function apiFetch(path: string, options: RequestInit = {}) {
  // Next.js server components: get Clerk token server-side
  let token: string | null = null;
  try {
    const { getToken } = auth();
    token = await getToken();
  } catch {
    // Client-side: token should be passed in options.headers
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  usage: {
    summary: ()     => apiFetch('/usage/summary'),
    daily:   (from: string, to: string) => apiFetch(`/usage/daily?from=${from}&to=${to}`),
    sessions:(limit = 20, offset = 0)   => apiFetch(`/usage/sessions?limit=${limit}&offset=${offset}`),
    projects:()     => apiFetch('/usage/projects'),
    export:  ()     => fetch(`${API_BASE}/usage/export`, { headers: { Authorization: `Bearer TODO` } }),
  },
  billing: {
    plans:    ()           => apiFetch('/billing/plans'),
    checkout: (plan: string) => apiFetch('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
    portal:   ()           => apiFetch('/billing/portal', { method: 'POST' }),
  },
  user: {
    me:           ()               => apiFetch('/user/me'),
    updateSettings: (s: object)   => apiFetch('/user/settings', { method: 'PUT', body: JSON.stringify(s) }),
  },
};
```

---

## Dashboard Page

`src/app/dashboard/page.tsx`:
```tsx
import { api } from '@/lib/api';
import SummaryCards from '@/components/dashboard/SummaryCards';
import DailyUsageChart from '@/components/charts/DailyUsageChart';
import SessionsTable from '@/components/dashboard/SessionsTable';

export default async function DashboardPage() {
  const [summary, sessions, dailyStats] = await Promise.all([
    api.usage.summary(),
    api.usage.sessions(10),
    api.usage.daily(
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)
    ),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Your AI usage at a glance</p>
      </div>

      <SummaryCards summary={summary} />

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-medium mb-4">Daily cost — last 30 days</h2>
        <DailyUsageChart data={dailyStats} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-medium mb-4">Recent sessions</h2>
        <SessionsTable sessions={sessions.sessions} />
      </div>
    </div>
  );
}
```

`src/components/dashboard/SummaryCards.tsx`:
```tsx
interface Summary {
  todayCostUsd: number;
  monthCostUsd: number;
  totalCostUsd: number;
  totalTokens: number;
  sessionCount: number;
}

export default function SummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Today's cost",     value: `$${summary.todayCostUsd.toFixed(4)}` },
    { label: 'This month',       value: `$${summary.monthCostUsd.toFixed(2)}` },
    { label: 'Total tokens',     value: fmtTokens(summary.totalTokens) },
    { label: 'Total sessions',   value: summary.sessionCount.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">{c.label}</p>
          <p className="text-2xl font-semibold text-gray-900">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
```

`src/components/charts/DailyUsageChart.tsx`:
```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface DailyStat {
  date: string;
  totalCostUsd: number;
  totalTokens: number;
}

export default function DailyUsageChart({ data }: { data: DailyStat[] }) {
  // Aggregate by date (multiple models/projects per day)
  const byDate = new Map<string, number>();
  for (const d of data) {
    byDate.set(d.date, (byDate.get(d.date) || 0) + d.totalCostUsd);
  }

  const chartData = Array.from(byDate.entries())
    .map(([date, cost]) => ({
      date,
      label: format(parseISO(date), 'MMM d'),
      cost: parseFloat(cost.toFixed(4)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No data yet — start using Claude Code to see your usage here.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} barSize={16}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
          contentStyle={{ border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
        />
        <Bar dataKey="cost" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

---

## Pricing Page

`src/app/pricing/page.tsx`:
```tsx
import Link from 'next/link';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'For solo developers getting started',
    features: ['Claude Code tracking', '30-day history', 'Status bar + dashboard', '1 AI model'],
    cta: 'Get started',
    href: '/sign-up',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    popular: true,
    description: 'For developers serious about AI costs',
    features: ['All AI models (Claude, GPT, Gemini)', 'Unlimited history', 'Cost prediction before send', 'Model comparison', 'Budget alerts', 'CSV / JSON export'],
    cta: 'Start Pro',
    href: '/sign-up?plan=pro',
  },
  {
    id: 'team',
    name: 'Team',
    price: 19,
    per: 'seat',
    description: 'For engineering teams',
    features: ['Everything in Pro', 'Team web dashboard', 'Per-developer attribution', 'Shared budget pools', 'Weekly Slack digest', 'Admin controls'],
    cta: 'Start Team',
    href: '/sign-up?plan=team',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-3">Simple, honest pricing</h1>
          <p className="text-gray-500">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-6 border ${
                plan.popular ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full mb-3">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
              <div className="mb-2">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-gray-400 text-sm">/{plan.per || 'mo'}</span>
              </div>
              <p className="text-sm text-gray-500 mb-5">{plan.description}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="bg-gray-100 rounded-2xl p-6 text-center text-sm text-gray-500">
          <strong className="text-gray-700">🔒 Privacy first:</strong> We never store your prompts or AI responses.
          Only token counts, model names, and cost estimates are synced to our servers.
          You can delete all your data at any time from your account settings.
        </div>
      </div>
    </main>
  );
}
```

---

## Deploying to Vercel

```bash
# From apps/web/
vercel

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# CLERK_SECRET_KEY
# NEXT_PUBLIC_API_URL
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Or via CLI:
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
```

`vercel.json` (optional):
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

---

## Clerk Setup Checklist

1. Create account at [clerk.com](https://clerk.com)
2. Create a new application
3. Enable "Email + password" and any social providers you want (Google recommended)
4. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
5. Add your domain to the allowed origins
6. Set up a webhook in Clerk Dashboard → Webhooks:
   - Endpoint: `https://api.aitokentracker.com/webhooks/clerk`
   - Events: `user.created`, `user.deleted`, `user.updated`
   - Copy the signing secret to `CLERK_WEBHOOK_SECRET` in backend `.env`
7. Set redirect URLs:
   - Sign-in fallback: `/dashboard`
   - Sign-up fallback: `/onboarding`

---

## Email Setup with Resend

```bash
pnpm add resend
```

`src/lib/email.ts` (in backend):
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendBudgetAlert(email: string, name: string, spent: number, limit: number) {
  await resend.emails.send({
    from: 'AI Token Tracker <alerts@aitokentracker.com>',
    to: email,
    subject: `⚠️ You've used ${Math.round(spent/limit*100)}% of your daily AI budget`,
    html: `
      <p>Hi ${name},</p>
      <p>You've spent <strong>$${spent.toFixed(4)}</strong> today out of your $${limit} daily budget.</p>
      <p><a href="https://aitokentracker.com/dashboard">View your usage dashboard →</a></p>
    `,
  });
}

export async function sendWeeklyDigest(email: string, name: string, stats: object) {
  // TODO: build weekly digest email
}
```
