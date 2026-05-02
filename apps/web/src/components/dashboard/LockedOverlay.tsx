'use client';
import Link from 'next/link';

interface Props {
  feature?: string;
}

export default function LockedOverlay({ feature = 'This feature' }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl overflow-hidden">
      <div className="absolute inset-0 backdrop-blur-sm bg-white/60" />
      <div className="relative bg-white border border-gray-200 rounded-xl p-8 shadow-lg text-center max-w-sm mx-4">
        <div className="text-3xl mb-3">🔒</div>
        <h3 className="text-base font-semibold text-gray-900 mb-2">Unlock your dashboard</h3>
        <p className="text-sm text-gray-500 mb-5">
          {feature} is a Pro feature. Upgrade to access cost breakdown, daily trends, model comparison, and budget alerts.
        </p>
        <Link
          href="/pricing"
          className="inline-block bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Upgrade to Pro — $9/mo
        </Link>
      </div>
    </div>
  );
}
