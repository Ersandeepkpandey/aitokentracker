import { api } from '@/lib/api';

export default async function ProjectsPage() {
  const projects = await api.usage.projects();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-gray-500 text-sm mt-1">Cost and token usage per project</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Project</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Sessions</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Tokens</th>
              <th className="text-right px-4 py-3 text-gray-500 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-gray-400">No projects yet.</td></tr>
            ) : projects.map((p: any) => (
              <tr key={p.projectName} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.projectName}</td>
                <td className="px-4 py-3 text-right text-gray-600">{p._count}</td>
                <td className="px-4 py-3 text-right text-gray-600">{(p._sum.totalTokens || 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-gray-600">${(p._sum.totalCostUsd || 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
