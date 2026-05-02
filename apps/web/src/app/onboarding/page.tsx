import PlanSelector from './PlanSelector';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">◈</div>
          <h1 className="text-2xl font-bold mb-2">Welcome to AI Token Tracker</h1>
          <p className="text-gray-500">Choose a plan to get started. You can upgrade anytime.</p>
        </div>
        <PlanSelector />
        <p className="text-center text-sm text-gray-400 mt-6">
          Questions?{' '}
          <a href="mailto:hello@aitokentracker.com" className="underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
