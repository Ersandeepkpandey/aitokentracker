import { prisma } from '../lib/prisma';

export async function recalcDailyStats(userId: string, date: string): Promise<void> {
  // Use exclusive upper bound at start of next day so the full day is captured
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd   = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const sessions = await prisma.usageSession.findMany({
    where: {
      userId,
      sessionStartedAt: { gte: dayStart, lt: dayEnd },
    },
  });

  if (sessions.length === 0) return;

  // Group by projectName + model
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = `${s.projectName}__${s.model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  for (const [key, group] of groups) {
    const [projectName, model] = key.split('__');
    const totals = group.reduce(
      (acc, s) => ({
        inputTokens:      acc.inputTokens      + s.inputTokens,
        outputTokens:     acc.outputTokens     + s.outputTokens,
        cacheReadTokens:  acc.cacheReadTokens  + s.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens + s.cacheWriteTokens,
        totalCostUsd:     acc.totalCostUsd     + s.totalCostUsd,
        sessionCount:     acc.sessionCount     + 1,
        turnCount:        acc.turnCount        + s.turnCount,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
        totalCostUsd: 0, sessionCount: 0, turnCount: 0 }
    );

    await prisma.dailyStats.upsert({
      where: { userId_date_projectName_model: { userId, date, projectName, model } },
      update: { ...totals, aiProvider: group[0].aiProvider },
      create: {
        userId, date, projectName, model,
        aiProvider: group[0].aiProvider,
        ...totals,
      },
    });
  }
}
