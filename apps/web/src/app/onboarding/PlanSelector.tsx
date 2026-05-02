'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['Claude tracking', '30-day history', 'Status bar'],
    cta: 'Continue with Free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    popular: true,
    features: ['All AI models', 'Unlimited history', 'Cost prediction', 'Budget alerts', 'CSV export'],
    cta: 'Start Pro — $9/mo',
  },
];

export default function PlanSelector() {
  const router   = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelect(planId: string) {
    setLoading(planId);
    if (planId === 'free') {
      router.push('/dashboard');
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/billing/checkout`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ plan: planId }),
        }
      );
      if (!res.ok) throw new Error('Failed to create checkout session');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      // Stripe not configured yet — go to dashboard
      router.push('/dashboard');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`bg-white rounded-2xl p-6 border ${
            plan.popular ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200'
          }`}
        >
          {plan.popular && (
            <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full mb-3">
              Recommended
            </span>
          )}
          <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
          <div className="mb-4">
            <span className="text-3xl font-bold">${plan.price}</span>
            {plan.price > 0 && <span className="text-gray-400 text-sm">/mo</span>}
          </div>
          <ul className="space-y-2 mb-6">
            {plan.features.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-gray-600">
                <span className="text-green-500">✓</span> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => handleSelect(plan.id)}
            disabled={loading === plan.id}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              plan.popular
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {loading === plan.id ? 'Loading…' : plan.cta}
          </button>
        </div>
      ))}
    </div>
  );
}
