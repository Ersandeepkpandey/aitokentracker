import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-6">
          ← Back
        </Link>
        <SignIn />
      </div>
    </div>
  );
}
