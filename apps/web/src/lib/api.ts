import { auth } from '@clerk/nextjs/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

async function apiFetch(path: string, options: RequestInit = {}) {
  let token: string | null = null;
  try {
    const { getToken } = auth();
    token = await getToken();
  } catch {
    // Client-side call — token passed in options.headers
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  usage: {
    summary:  ()                            => apiFetch('/usage/summary'),
    daily:    (from: string, to: string)    => apiFetch(`/usage/daily?from=${from}&to=${to}`),
    sessions: (limit = 20, offset = 0)     => apiFetch(`/usage/sessions?limit=${limit}&offset=${offset}`),
    projects: ()                            => apiFetch('/usage/projects'),
  },
  billing: {
    plans:    ()              => apiFetch('/billing/plans'),
    checkout: (plan: string)  => apiFetch('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
    portal:   ()              => apiFetch('/billing/portal',   { method: 'POST' }),
  },
  user: {
    me:             ()             => apiFetch('/user/me'),
    updateSettings: (s: object)   => apiFetch('/user/settings', { method: 'PUT', body: JSON.stringify(s) }),
  },
};
