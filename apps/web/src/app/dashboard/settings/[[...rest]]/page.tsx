import { auth } from '@clerk/nextjs/server';
import { UserProfile } from '@clerk/nextjs';
import Link from 'next/link';
import { api } from '@/lib/api';
import BudgetSettings from '@/components/dashboard/BudgetSettings';

export default async function SettingsPage() {
  const { sessionClaims } = await auth();
  const plan = (sessionClaims?.plan as string | undefined) ?? 'free';
  const isPro = plan !== 'free';

  let budgets: any[] = [];
  if (isPro) {
    try { budgets = await api.user.getBudgets(); } catch {}
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-medium mb-4">Account</h2>
        <UserProfile appearance={{ elements: { card: 'shadow-none border-0 p-0' } }} />
      </div>

      {/* Budget settings — Pro only */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 relative">
        <h2 className="text-base font-medium mb-1">Budget alerts</h2>
        <p className="text-sm text-gray-500 mb-4">
          Get notified when your spending reaches a threshold.
        </p>
        {isPro ? (
          <BudgetSettings initialBudgets={budgets} />
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">Upgrade to Pro to set budget alerts.</p>
            <Link
              href="/pricing"
              className="text-sm text-indigo-600 hover:underline font-medium"
            >
              Upgrade →
            </Link>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-medium mb-2">Billing</h2>
        <p className="text-sm text-gray-500 mb-4">Manage your subscription and payment method.</p>
        <Link
          href="/api/billing/portal"
          className="inline-block bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700"
        >
          Manage billing →
        </Link>
      </div>
    </div>
  );
}
