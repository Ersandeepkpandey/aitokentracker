import { prisma } from '../lib/prisma';

export async function getInsight(userId: string): Promise<string> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const sevenDaysAgo  = new Date(Date.now() -  7 * 86_400_000);

  const [recent30, recent7, topProject, mostExpensiveModel] = await Promise.all([
    prisma.usageSession.aggregate({
      where: { userId, sessionStartedAt: { gte: thirtyDaysAgo } },
      _sum:  { totalCostUsd: true, totalTokens: true, cacheReadTokens: true, inputTokens: true },
      _count: true,
    }),
    prisma.usageSession.aggregate({
      where: { userId, sessionStartedAt: { gte: sevenDaysAgo } },
      _sum:  { totalCostUsd: true },
    }),
    prisma.usageSession.groupBy({
      by: ['projectName'],
      where: { userId, sessionStartedAt: { gte: thirtyDaysAgo } },
      _sum: { totalCostUsd: true },
      orderBy: { _sum: { totalCostUsd: 'desc' } },
      take: 1,
    }),
    prisma.usageSession.groupBy({
      by: ['model'],
      where: { userId, sessionStartedAt: { gte: thirtyDaysAgo } },
      _sum: { totalCostUsd: true },
      orderBy: { _sum: { totalCostUsd: 'desc' } },
      take: 1,
    }),
  ]);

  const totalCost   = recent30._sum.totalCostUsd   ?? 0;
  const totalTokens = recent30._sum.totalTokens    ?? 0;
  const inputTokens = recent30._sum.inputTokens    ?? 0;
  const cacheTokens = recent30._sum.cacheReadTokens ?? 0;
  const week7Cost   = recent7._sum.totalCostUsd    ?? 0;
  const sessionCnt  = recent30._count;

  // Cache efficiency insight
  if (inputTokens > 0 && cacheTokens / inputTokens > 0.4) {
    const pct = Math.round((cacheTokens / inputTokens) * 100);
    return `Great cache usage! ${pct}% of your input tokens came from cache reads over the last 30 days, saving you significant cost.`;
  }

  // High spend week
  if (week7Cost > totalCost * 0.5 && totalCost > 0.10) {
    return `Your spending spiked this week — $${week7Cost.toFixed(2)} of your $${totalCost.toFixed(2)} 30-day total. Consider reviewing large sessions or switching to a lighter model for exploratory work.`;
  }

  // Top project
  if (topProject.length > 0 && (topProject[0]._sum.totalCostUsd ?? 0) > totalCost * 0.6) {
    const name = topProject[0].projectName;
    const pct  = Math.round(((topProject[0]._sum.totalCostUsd ?? 0) / totalCost) * 100);
    return `Project "${name}" accounts for ${pct}% of your 30-day spend. If it's exploratory work, try claude-haiku for drafts and save Sonnet/Opus for final passes.`;
  }

  // Model suggestion
  if (mostExpensiveModel.length > 0 && totalCost > 0.50) {
    const model = mostExpensiveModel[0].model;
    if (model.includes('opus')) {
      return `You're spending most on ${model}. For tasks like summarization or code review, claude-sonnet-4-5 delivers similar quality at ~5× lower cost.`;
    }
  }

  // Low activity
  if (sessionCnt === 0) {
    return 'No sessions in the last 30 days. Install the extension in VS Code and start a Claude Code session to see your usage here.';
  }

  const avgCost = totalCost / sessionCnt;
  return `You ran ${sessionCnt} sessions averaging $${avgCost.toFixed(4)} each over the past 30 days, totalling ${(totalTokens / 1000).toFixed(0)}K tokens.`;
}
