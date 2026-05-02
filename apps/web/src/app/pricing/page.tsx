import Link from 'next/link';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'For solo developers getting started',
    features: ['Claude Code tracking', '30-day history', 'Status bar + dashboard', '1 AI model'],
    cta: 'Get started',
    href: '/sign-up',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    popular: true,
    description: 'For developers serious about AI costs',
    features: ['All AI models (Claude, GPT, Gemini)', 'Unlimited history', 'Cost prediction before send', 'Model comparison', 'Budget alerts', 'CSV / JSON export'],
    cta: 'Start Pro',
    href: '/sign-up?plan=pro',
  },
  {
    id: 'team',
    name: 'Team',
    price: 19,
    per: 'seat',
    description: 'For engineering teams',
    features: ['Everything in Pro', 'Team web dashboard', 'Per-developer attribution', 'Shared budget pools', 'Weekly Slack digest', 'Admin controls'],
    cta: 'Start Team',
    href: '/sign-up?plan=team',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <Link href="/" className="text-indigo-600 text-sm mb-4 inline-block">← Back</Link>
          <h1 className="text-3xl font-bold mb-3">Simple, honest pricing</h1>
          <p className="text-gray-500">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl p-6 border ${
                plan.popular ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full mb-3">
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
              <div className="mb-2">
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-gray-400 text-sm">/{plan.per || 'mo'}</span>
              </div>
              <p className="text-sm text-gray-500 mb-5">{plan.description}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-green-500 mt-0.5">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="bg-gray-100 rounded-2xl p-6 text-center text-sm text-gray-500">
          <strong className="text-gray-700">Privacy first:</strong> We never store your prompts or AI responses.
          Only token counts, model names, and cost estimates are synced to our servers.
          You can delete all your data at any time from your account settings.
        </div>
      </div>
    </main>
  );
}
