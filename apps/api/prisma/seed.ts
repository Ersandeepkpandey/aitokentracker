import { PrismaClient, Plan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'dev@test.com' },
    update: {},
    create: {
      clerkId: 'clerk_test_dev',
      email: 'dev@test.com',
      name: 'Dev User',
      plan: Plan.PRO,
      onboardedAt: new Date(),
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  await prisma.usageSession.createMany({
    data: [
      {
        id: 'seed-session-001',
        userId: user.id,
        model: 'claude-sonnet-4',
        aiProvider: 'claude',
        projectName: 'my-app',
        inputTokens: 45200,
        outputTokens: 8300,
        cacheReadTokens: 12000,
        cacheWriteTokens: 0,
        totalTokens: 65500,
        inputCostUsd: 0.1356,
        outputCostUsd: 0.1245,
        cacheReadCostUsd: 0.0036,
        cacheWriteCostUsd: 0,
        totalCostUsd: 0.2637,
        turnCount: 14,
        sessionStartedAt: new Date(`${today}T09:00:00Z`),
      },
      {
        id: 'seed-session-002',
        userId: user.id,
        model: 'claude-opus-4',
        aiProvider: 'claude',
        projectName: 'my-app',
        inputTokens: 22100,
        outputTokens: 5400,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 27500,
        inputCostUsd: 0.3315,
        outputCostUsd: 0.4050,
        cacheReadCostUsd: 0,
        cacheWriteCostUsd: 0,
        totalCostUsd: 0.7365,
        turnCount: 7,
        sessionStartedAt: new Date(`${yesterday}T14:00:00Z`),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.dailyStats.upsert({
    where: {
      userId_date_projectName_model: {
        userId: user.id,
        date: today,
        projectName: 'my-app',
        model: 'claude-sonnet-4',
      },
    },
    update: {},
    create: {
      userId: user.id,
      date: today,
      projectName: 'my-app',
      model: 'claude-sonnet-4',
      aiProvider: 'claude',
      inputTokens: 45200,
      outputTokens: 8300,
      cacheReadTokens: 12000,
      totalCostUsd: 0.2637,
      sessionCount: 1,
      turnCount: 14,
    },
  });

  await prisma.budget.upsert({
    where: { userId_type: { userId: user.id, type: 'daily' } },
    update: {},
    create: {
      userId: user.id,
      type: 'daily',
      limitUsd: 5.00,
      alertAt: 0.8,
    },
  });

  console.log('Seed complete. Dev user:', user.email);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
