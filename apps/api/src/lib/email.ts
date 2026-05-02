import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'AI Token Tracker <noreply@aitokentracker.com>';

export async function sendBudgetAlert(opts: {
  to: string;
  name: string;
  budgetType: string;
  spent: number;
  limit: number;
}) {
  const pct = Math.round((opts.spent / opts.limit) * 100);
  await resend.emails.send({
    from: FROM,
    to:   opts.to,
    subject: `⚠️ ${opts.budgetType} budget ${pct}% used`,
    html: `
      <p>Hi ${opts.name},</p>
      <p>You've used <strong>$${opts.spent.toFixed(4)}</strong> of your ${opts.budgetType} budget
         (<strong>${pct}%</strong> of $${opts.limit.toFixed(2)}).</p>
      <p>Log in to <a href="${process.env.APP_BASE}/dashboard">your dashboard</a> to review usage or adjust your budget.</p>
      <p>— AI Token Tracker</p>
    `,
  });
}

export async function sendWeeklyDigest(opts: {
  to: string;
  name: string;
  totalCost: number;
  totalTokens: number;
  sessionCount: number;
  vsLastWeek: number | null;
  topProject: string | null;
}) {
  const change = opts.vsLastWeek !== null
    ? (opts.vsLastWeek >= 0 ? `+${opts.vsLastWeek}%` : `${opts.vsLastWeek}%`) + ' vs last week'
    : '';
  await resend.emails.send({
    from: FROM,
    to:   opts.to,
    subject: `Your weekly AI usage: $${opts.totalCost.toFixed(2)} spent`,
    html: `
      <p>Hi ${opts.name},</p>
      <h2>This week's summary</h2>
      <ul>
        <li><strong>Total cost:</strong> $${opts.totalCost.toFixed(4)} ${change}</li>
        <li><strong>Tokens used:</strong> ${(opts.totalTokens / 1000).toFixed(0)}K</li>
        <li><strong>Sessions:</strong> ${opts.sessionCount}</li>
        ${opts.topProject ? `<li><strong>Top project:</strong> ${opts.topProject}</li>` : ''}
      </ul>
      <p><a href="${process.env.APP_BASE}/dashboard">View full dashboard →</a></p>
      <p>— AI Token Tracker</p>
    `,
  });
}
