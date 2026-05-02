import { prisma } from '../lib/prisma';

export interface WeeklySummary {
  weekOf:           string;
  totalCostUsd:     number;
  totalTokens:      number;
  sessionCount:     number;
  topProject:       string | null;
  topModel:         string | null;
  vsLastWeek:       number | null; // % change in cost, null if no prior data
  dailyBreakdown:   Array<{ date: string; costUsd: number; tokens: number }>;
}

export async function getWeeklySummary(userId: string): Promise<WeeklySummary> {
  const now        = new Date();
  const weekStart  = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const twoWksAgo  = new Date(now);
  twoWksAgo.setUTCDate(twoWksAgo.getUTCDate() - 14);

  const weekStartStr   = weekStart.toISOString().slice(0, 10);
  const twoWksAgoStr   = twoWksAgo.toISOString().slice(0, 10);
  const todayStr       = now.toISOString().slice(0, 10);

  const [thisWeekAgg, lastWeekAgg, topProjectRows, topModelRows, dailyRows] = await Promise.all([
    prisma.dailyStats.aggregate({
      where: { userId, date: { gte: weekStartStr, lte: todayStr } },
      _sum: { totalCostUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, sessionCount: true },
    }),
    prisma.dailyStats.aggregate({
      where: { userId, date: { gte: twoWksAgoStr, lt: weekStartStr } },
      _sum: { totalCostUsd: true },
    }),
    prisma.dailyStats.groupBy({
      by: ['projectName'],
      where: { userId, date: { gte: weekStartStr, lte: todayStr } },
      _sum: { totalCostUsd: true },
      orderBy: { _sum: { totalCostUsd: 'desc' } },
      take: 1,
    }),
    prisma.dailyStats.groupBy({
      by: ['model'],
      where: { userId, date: { gte: weekStartStr, lte: todayStr } },
      _sum: { totalCostUsd: true },
      orderBy: { _sum: { totalCostUsd: 'desc' } },
      take: 1,
    }),
    prisma.dailyStats.groupBy({
      by: ['date'],
      where: { userId, date: { gte: weekStartStr, lte: todayStr } },
      _sum: { totalCostUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const thisCost   = thisWeekAgg._sum.totalCostUsd ?? 0;
  const lastCost   = lastWeekAgg._sum.totalCostUsd ?? 0;
  const totalTok   = (thisWeekAgg._sum.inputTokens ?? 0)
                   + (thisWeekAgg._sum.outputTokens ?? 0)
                   + (thisWeekAgg._sum.cacheReadTokens ?? 0);

  const vsLastWeek = lastCost > 0
    ? Math.round(((thisCost - lastCost) / lastCost) * 100)
    : null;

  return {
    weekOf:         weekStartStr,
    totalCostUsd:   thisCost,
    totalTokens:    totalTok,
    sessionCount:   thisWeekAgg._sum.sessionCount ?? 0,
    topProject:     topProjectRows[0]?.projectName ?? null,
    topModel:       topModelRows[0]?.model         ?? null,
    vsLastWeek,
    dailyBreakdown: dailyRows.map(r => ({
      date:    r.date,
      costUsd: r._sum.totalCostUsd ?? 0,
      tokens:  (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0) + (r._sum.cacheReadTokens ?? 0),
    })),
  };
}
