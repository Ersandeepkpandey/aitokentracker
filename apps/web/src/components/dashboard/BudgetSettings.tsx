'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

interface Budget {
  id: string;
  type: string;
  limitUsd: number;
  alertAt: number;
  active: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

export default function BudgetSettings({ initialBudgets }: { initialBudgets: Budget[] }) {
  const { getToken } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [saving, setSaving] = useState(false);
  const [editType, setEditType] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState('');

  const TYPES = ['daily', 'weekly', 'monthly'];

  async function saveBudget(type: string, limitUsd: number) {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/user/budget`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, limitUsd }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      setBudgets(prev => {
        const filtered = prev.filter(b => b.type !== type);
        return [...filtered, updated];
      });
      setEditType(null);
    } catch {
      alert('Failed to save budget.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBudget(type: string) {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/user/budget/${type}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setBudgets(prev => prev.filter(b => b.type !== type));
    } catch {
      alert('Failed to remove budget.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {TYPES.map(type => {
        const existing = budgets.find(b => b.type === type);
        const isEditing = editType === type;

        return (
          <div key={type} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div>
              <p className="text-sm font-medium text-gray-700 capitalize">{type}</p>
              {existing ? (
                <p className="text-xs text-gray-500 mt-0.5">
                  Limit: ${existing.limitUsd.toFixed(2)} · Alert at {Math.round(existing.alertAt * 100)}%
                </p>
              ) : (
                <p className="text-xs text-gray-400 mt-0.5">Not set</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editLimit}
                    onChange={e => setEditLimit(e.target.value)}
                    className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    onClick={() => saveBudget(type, parseFloat(editLimit))}
                    disabled={saving || !editLimit || isNaN(parseFloat(editLimit))}
                    className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditType(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditType(type); setEditLimit(existing?.limitUsd.toString() ?? ''); }}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    {existing ? 'Edit' : 'Set limit'}
                  </button>
                  {existing && (
                    <button
                      onClick={() => deleteBudget(type)}
                      className="text-sm text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
