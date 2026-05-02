import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-gray-900">◈ AI Token Tracker</span>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
            <Link href="/sign-in" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link href="/sign-up" className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 py-24 text-center">
        <div className="inline-block bg-indigo-50 text-indigo-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          VS Code Extension
        </div>
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Know exactly what your<br />AI usage costs
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Real-time token tracking for Claude, OpenAI, and all AI APIs — right in your VS Code status bar.
          No setup, no configuration. Just install and go.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up" className="bg-indigo-600 text-white px-8 py-3.5 rounded-xl font-medium text-lg hover:bg-indigo-700">
            Install Free Extension
          </Link>
          <Link href="/pricing" className="text-gray-600 px-8 py-3.5 rounded-xl font-medium text-lg border border-gray-200 hover:bg-gray-50">
            See pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '⚡', title: 'Real-time tracking', desc: 'Token counts and cost update live as you type prompts — no refresh needed.' },
              { icon: '💰', title: 'Accurate cost estimates', desc: 'Up-to-date pricing for Claude, GPT-4o, Gemini, and more. Cache tokens counted separately.' },
              { icon: '📊', title: 'Usage history', desc: 'Daily charts, per-project breakdown, and CSV export. See where your AI budget goes.' },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-200">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} AI Token Tracker · <Link href="/pricing" className="hover:text-gray-600">Pricing</Link> · Privacy first: we never store your prompts.</p>
      </footer>
    </main>
  );
}
