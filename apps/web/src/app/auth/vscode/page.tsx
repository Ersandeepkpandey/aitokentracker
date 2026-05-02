'use client';

import { useEffect, useState } from 'react';
import { useUser, useAuth, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';

export default function VsCodeAuthPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'error'>('loading');

  const state = searchParams.get('state');
  const callbackUrl = searchParams.get('callback');

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && state && callbackUrl) {
      generateCodeAndRedirect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  async function generateCodeAndRedirect() {
    try {
      setStatus('redirecting');
      const clerkToken = await getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(
        `${apiBase}/auth/vscode-callback?userId=${user?.id}&state=${state}&callbackUrl=${encodeURIComponent(callbackUrl!)}`,
        { headers: { Authorization: `Bearer ${clerkToken}` } }
      );

      if (!res.ok) throw new Error('Failed to generate code');
      window.location.href = res.url;
    } catch {
      setStatus('error');
    }
  }

  if (!isLoaded) {
    return <Layout><Spinner /></Layout>;
  }

  if (!isSignedIn) {
    return (
      <Layout>
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">◈</div>
          <h1 className="text-xl font-semibold mb-2">Sign in to AI Token Tracker</h1>
          <p className="text-sm text-gray-500">
            You&apos;re connecting your VS Code extension. Sign in or create a free account below.
          </p>
        </div>
        <SignIn
          redirectUrl={`/auth/vscode?state=${state}&callback=${encodeURIComponent(callbackUrl || '')}`}
          appearance={{ elements: { card: 'shadow-none border border-gray-200' } }}
        />
      </Layout>
    );
  }

  if (status === 'redirecting') {
    return (
      <Layout>
        <div className="text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-lg font-medium mb-2">Signed in! Connecting to VS Code...</h2>
          <p className="text-sm text-gray-500">You can close this tab once VS Code confirms.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="text-center text-red-500">
        Something went wrong. Please try again from VS Code.
      </div>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
