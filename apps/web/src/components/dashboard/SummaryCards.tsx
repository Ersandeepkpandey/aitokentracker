import { fmtTokens } from '@/lib/utils';

interface Summary {
  todayCostUsd: number;
  monthCostUsd: number;
  totalCostUsd: number;
  totalTokens: number;
  sessionCount: number;
}

export default function SummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Today's cost",   value: `$${summary.todayCostUsd.toFixed(4)}` },
    { label: 'This month',     value: `$${summary.monthCostUsd.toFixed(2)}` },
    { label: 'Total tokens',   value: fmtTokens(summary.totalTokens) },
    { label: 'Total sessions', value: summary.sessionCount.toLocaleString() },
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
