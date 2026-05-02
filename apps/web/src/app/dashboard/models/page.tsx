import { auth } from '@clerk/nextjs/server';
import { api } from '@/lib/api';
import LockedOverlay from '@/components/dashboard/LockedOverlay';
import Link from 'next/link';

export default async function ModelsPage() {
  const { sessionClaims } = await auth();
  const plan = (sessionClaims?.plan as string | undefined) ?? 'free';
  const isPro = plan !== 'free';

  let sessions: { sessions: any[] } = { sessions: [] };
  let projects: any[] = [];

  if (isPro) {
    try {
      [sessions, projects] = await Promise.all([
        api.usage.sessions(50),
        api.usage.projects(),
      ]);
    } catch {}
  }

  // Build per-model breakdown from recent sessions
  const modelMap = new Map<string, { cost: number; tokens: number; sessions: number }>();
  for (const s of sessions.sessions) {
    const m = s.model as string;
    const ex = modelMap.get(m) ?? { cost: 0, tokens: 0, sessions: 0 };
    modelMap.set(m, {
      cost:     ex.cost + (s.totalCostUsd ?? 0),
      tokens:   ex.tokens + (s.totalTokens ?? 0),
      sessions: ex.sessions + 1,
    });
  }
  const models = Array.from(modelMap.entries())
    .map(([model, d]) => ({ model, ...d }))
    .sort((a, b) => b.cost - a.cost);

  const totalCost = models.reduce((a, m) => a + m.cost, 0);

  if (!isPro) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-6">Models</h1>
        <div className="bg-white border border-gray-200 rounded-xl p-8 relative min-h-[200px]">
          <div className="blur-sm select-none pointer-events-none">
            <div className="space-y-3">
              {['claude-sonnet-4-5', 'claude-opus-4', 'gpt-4o'].map(m => (
                <div key={m} className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="font-medium text-gray-700">{m}</span>
                  <span className="text-gray-400">$0.0000</span>
                </div>
              ))}
            </div>
          </div>
          <LockedOverlay feature="Model breakdown and cost comparison" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Models</h1>
        <p className="text-gray-500 text-sm mt-1">Cost breakdown by AI model — last 50 sessions</p>
      </div>

      {models.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
          No sessions yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Model</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">Sessions</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">Tokens</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">Cost</th>
                <th className="text-right px-5 py-3 text-gray-500 font-medium">% of total</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const pct = totalCost > 0 ? Math.round((m.cost / totalCost) * 100) : 0;
                return (
                  <tr key={m.model} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{m.model}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{m.sessions}</td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {m.tokens >= 1_000_000
                        ? `${(m.tokens / 1_000_000).toFixed(1)}M`
                        : `${(m.tokens / 1000).toFixed(0)}K`}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-800 font-medium">${m.cost.toFixed(4)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-project model breakdown */}
      {projects.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-medium mb-4">Cost by project</h2>
          <div className="space-y-2">
            {projects.slice(0, 10).map((p: any) => {
              const pct = totalCost > 0 ? Math.round(((p._sum?.totalCostUsd ?? 0) / totalCost) * 100) : 0;
              return (
                <div key={p.projectName} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-24 bg-gray-100 rounded-full h-1.5 shrink-0">
                      <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm text-gray-700 truncate">{p.projectName}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-800 shrink-0 ml-4">
                    ${(p._sum?.totalCostUsd ?? 0).toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
