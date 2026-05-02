import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

const nav = [
  { href: '/dashboard',          label: 'Overview' },
  { href: '/dashboard/sessions', label: 'Sessions' },
  { href: '/dashboard/projects', label: 'Projects' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <span className="font-semibold text-gray-900">◈ AI Token Tracker</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-sm text-gray-500">Account</span>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
    </div>
  );
}
