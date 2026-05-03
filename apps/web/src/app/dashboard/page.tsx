import { auth } from '@clerk/nextjs/server';
import { api } from '@/lib/api';
import SummaryCards from '@/components/dashboard/SummaryCards';
import DailyUsageChart from '@/components/charts/DailyUsageChart';
import SessionsTable from '@/components/dashboard/SessionsTable';
import LockedOverlay from '@/components/dashboard/LockedOverlay';
import Link from 'next/link';

const PLACEHOLDER_CHART = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10),
  totalCostUsd: 0, inputTokens: 0, outputTokens: 0,
}));

const PLACEHOLDER_SESSIONS = Array.from({ length: 3 }, (_, i) => ({
  id: `placeholder-${i}`,
  model: '—', projectName: '—', totalTokens: 0,
  totalCostUsd: 0, turnCount: 0,
  sessionStartedAt: new Date().toISOString(),
}));

export default async function DashboardPage() {
  const { sessionClaims } = await auth();
  // plan is embedded in the JWT via Clerk session metadata
  const plan = (sessionClaims?.plan as string | undefined) ?? 'free';
  const isPro = plan !== 'free';

  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to   = new Date().toISOString().slice(0, 10);

  let summary: any = null;
  let sessions: { sessions: any[] } = { sessions: [] };
  let dailyStats: any[] = [];
  let insight: string | null = null;
  let apiError: string | null = null;

  try {
    if (isPro) {
      const [s, sess, d, ins] = await Promise.all([
        api.usage.summary(),
        api.usage.sessions(10),
        api.usage.daily(from, to),
        api.usage.insights().catch(() => ({ insight: null })),
      ]);
      summary = s; sessions = sess; dailyStats = d; insight = ins?.insight ?? null;
    } else {
      // Free users: only fetch summary (tokens + session count), no cost/session data sent to browser
      summary = await api.usage.summary();
    }
  } catch (err: any) {
    console.error('[dashboard] API error:', err);
    apiError = err?.message ?? 'Failed to load usage data';
  }

  if (apiError) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">Overview</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
          <strong>Could not load data:</strong> {apiError}
          <p className="mt-1 text-red-500">Make sure the API is running and you are signed in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Your AI usage at a glance</p>
        </div>
        {!isPro && (
          <Link
            href="/pricing"
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>

      {/* AI Insight (Pro only) */}
      {isPro && insight && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800 flex gap-3">
          <span className="text-lg shrink-0">💡</span>
          <p>{insight}</p>
        </div>
      )}

      {/* Trial countdown banner */}
      {summary?.trialDaysLeft !== null && summary?.trialDaysLeft !== undefined && (
        <div className={`rounded-xl p-4 text-sm flex items-center justify-between gap-4 ${
          summary.trialDaysLeft <= 1
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-amber-50 border border-amber-200 text-amber-800'
        }`}>
          <span>
            ⏳ <strong>{summary.trialDaysLeft} day{summary.trialDaysLeft !== 1 ? 's' : ''} left</strong> in your free trial — upgrade to keep full access.
          </span>
          <Link href="/pricing" className="bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 whitespace-nowrap">
            Upgrade now
          </Link>
        </div>
      )}

      {summary && <SummaryCards summary={summary} isPro={isPro} />}

      {/* Daily chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 relative min-h-[200px]">
        <h2 className="text-base font-medium mb-4">Daily cost — last 30 days</h2>
        {isPro ? (
          <DailyUsageChart data={dailyStats} />
        ) : (
          <>
            <DailyUsageChart data={PLACEHOLDER_CHART} />
            <LockedOverlay feature="Cost breakdown and daily trends" />
          </>
        )}
      </div>

      {/* Sessions table */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 relative min-h-[200px]">
        <h2 className="text-base font-medium mb-4">Recent sessions</h2>
        {isPro ? (
          <SessionsTable sessions={sessions.sessions} isPro={isPro} />
        ) : (
          <>
            <SessionsTable sessions={PLACEHOLDER_SESSIONS} isPro={false} />
            <LockedOverlay feature="Session history" />
          </>
        )}
      </div>
    </div>
  );
}
