import { api } from '@/lib/api';
import SessionsTable from '@/components/dashboard/SessionsTable';

export default async function SessionsPage() {
  const { sessions, total } = await api.usage.sessions(50);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-gray-500 text-sm mt-1">{total} sessions total</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <SessionsTable sessions={sessions} />
      </div>
    </div>
  );
}
