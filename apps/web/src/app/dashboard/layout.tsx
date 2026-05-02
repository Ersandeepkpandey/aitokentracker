import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

const nav = [
  { href: '/dashboard',          label: 'Overview' },
  { href: '/dashboard/sessions', label: 'Sessions' },
  { href: '/dashboard/projects', label: 'Projects' },
  { href: '/dashboard/models',   label: 'Models' },
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
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-end px-6 shrink-0">
          <UserButton afterSignOutUrl="/" />
        </header>
        <main className="flex-1 bg-gray-50 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
