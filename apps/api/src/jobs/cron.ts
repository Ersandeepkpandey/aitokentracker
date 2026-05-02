import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { getWeeklySummary } from '../services/weeklyDigest';
import { sendBudgetAlert, sendWeeklyDigest } from '../lib/email';
import { Plan } from '@prisma/client';

export function startCronJobs() {

  // Hourly budget check
  cron.schedule('0 * * * *', async () => {
    try {
      await runBudgetChecks();
    } catch (err) {
      console.error('[cron] budget check failed:', err);
    }
  });

  // Weekly digest — Monday 9am UTC
  cron.schedule('0 9 * * 1', async () => {
    try {
      await runWeeklyDigests();
    } catch (err) {
      console.error('[cron] weekly digest failed:', err);
    }
  });

  console.log('[cron] jobs started');
}

async function runBudgetChecks() {
  const budgets = await prisma.budget.findMany({
    where: { active: true },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthStart = now.toISOString().slice(0, 7);

  for (const budget of budgets) {
    let spent = 0;

    if (budget.type === 'daily') {
      const agg = await prisma.dailyStats.aggregate({
        where: { userId: budget.userId, date: today },
        _sum: { totalCostUsd: true },
      });
      spent = agg._sum.totalCostUsd ?? 0;
    } else if (budget.type === 'weekly') {
      const agg = await prisma.dailyStats.aggregate({
        where: { userId: budget.userId, date: { gte: weekAgo, lte: today } },
        _sum: { totalCostUsd: true },
      });
      spent = agg._sum.totalCostUsd ?? 0;
    } else if (budget.type === 'monthly') {
      const agg = await prisma.dailyStats.aggregate({
        where: { userId: budget.userId, date: { startsWith: monthStart } },
        _sum: { totalCostUsd: true },
      });
      spent = agg._sum.totalCostUsd ?? 0;
    }

    const threshold = budget.limitUsd * budget.alertAt;
    if (spent >= threshold && spent < budget.limitUsd) {
      console.log(`[cron] budget alert: user ${budget.userId} ${budget.type} $${spent.toFixed(4)}/$${budget.limitUsd}`);
      await sendBudgetAlert({
        to:         budget.user.email,
        name:       budget.user.name,
        budgetType: budget.type,
        spent,
        limit:      budget.limitUsd,
      }).catch(console.error);
    }
  }
}

async function runWeeklyDigests() {
  const proUsers = await prisma.user.findMany({
    where: { plan: { in: [Plan.PRO, Plan.TEAM, Plan.ENTERPRISE] } },
    select: { id: true, email: true, name: true },
  });

  for (const user of proUsers) {
    const summary = await getWeeklySummary(user.id);
    if (summary.sessionCount === 0) continue;

    await sendWeeklyDigest({
      to:           user.email,
      name:         user.name,
      totalCost:    summary.totalCostUsd,
      totalTokens:  summary.totalTokens,
      sessionCount: summary.sessionCount,
      vsLastWeek:   summary.vsLastWeek,
      topProject:   summary.topProject,
    }).catch(console.error);
  }
}
