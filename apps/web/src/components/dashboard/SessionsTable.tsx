import { fmtTokens } from '@/lib/utils';
import { format } from 'date-fns';

interface Session {
  id: string;
  model: string;
  projectName: string;
  totalTokens: number;
  totalCostUsd: number;
  turnCount: number;
  sessionStartedAt: string;
}

export default function SessionsTable({ sessions, isPro = false }: { sessions: Session[]; isPro?: boolean }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        No sessions yet — start using Claude Code to see your usage here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left pb-2 text-gray-500 font-medium">Date</th>
            <th className="text-left pb-2 text-gray-500 font-medium">Project</th>
            <th className="text-left pb-2 text-gray-500 font-medium">Model</th>
            <th className="text-right pb-2 text-gray-500 font-medium">Tokens</th>
            <th className="text-right pb-2 text-gray-500 font-medium">Cost</th>
            <th className="text-right pb-2 text-gray-500 font-medium">Turns</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2.5 text-gray-500">
                {format(new Date(s.sessionStartedAt), 'MMM d, HH:mm')}
              </td>
              <td className="py-2.5 text-gray-700">{s.projectName}</td>
              <td className="py-2.5 text-gray-700">{s.model}</td>
              <td className="py-2.5 text-right text-gray-600">{fmtTokens(s.totalTokens)}</td>
              <td className="py-2.5 text-right text-gray-600">{isPro ? `$${s.totalCostUsd.toFixed(4)}` : '—'}</td>
              <td className="py-2.5 text-right text-gray-600">{s.turnCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
