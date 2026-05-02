'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface DailyStat {
  date: string;
  totalCostUsd: number;
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
