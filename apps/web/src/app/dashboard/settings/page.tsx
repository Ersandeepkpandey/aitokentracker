import { UserProfile } from '@clerk/nextjs';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-medium mb-4">Account</h2>
          <UserProfile appearance={{ elements: { card: 'shadow-none border-0 p-0' } }} />
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
    </div>
  );
}
