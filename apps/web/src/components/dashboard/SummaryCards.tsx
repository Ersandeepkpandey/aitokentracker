import { fmtTokens } from '@/lib/utils';
import Link from 'next/link';

interface Summary {
  todayCostUsd: number;
  monthCostUsd: number;
  totalCostUsd: number;
  totalTokens: number;
  sessionCount: number;
}

export default function SummaryCards({ summary, isPro = false }: { summary: Summary; isPro?: boolean }) {
  const cards = isPro
    ? [
        { label: "Today's cost",   value: `$${summary.todayCostUsd.toFixed(4)}` },
        { label: 'This month',     value: `$${summary.monthCostUsd.toFixed(2)}` },
        { label: 'Total tokens',   value: fmtTokens(summary.totalTokens) },
        { label: 'Total sessions', value: summary.sessionCount.toLocaleString() },
      ]
    : [
        { label: 'Total tokens',   value: fmtTokens(summary.totalTokens) },
        { label: 'Total sessions', value: summary.sessionCount.toLocaleString() },
        {
          label: "Today's cost",
          value: null, // locked
        },
        {
          label: 'This month',
          value: null, // locked
        },
      ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4 relative">
          <p className="text-xs text-gray-500 mb-1">{c.label}</p>
          {c.value !== null ? (
            <p className="text-2xl font-semibold text-gray-900">{c.value}</p>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-2xl font-semibold text-gray-300">$—</p>
              <Link href="/pricing" className="text-xs text-indigo-600 hover:underline font-medium">
                Pro
              </Link>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
