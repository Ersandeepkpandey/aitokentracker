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
