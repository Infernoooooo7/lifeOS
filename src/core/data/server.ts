'use client';

import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/core/app';
import { ApiError, api, type AccountUser } from './session';

/**
 * Server state (TanStack Query). Almost everything in LIFEOS is local-first and lives in IndexedDB;
 * the few things that only the server knows — the account profile and the signed-in devices — are
 * cached here, refreshed when the window regains focus, and never retried on authentication errors.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: (count, error) => !(error instanceof ApiError && (error.status === 401 || error.status === 403)) && count < 2 },
  },
});

export interface DeviceSession {
  id: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

const useSignedIn = () => useApp((s) => s.identity?.mode === 'account');

export function useAccount() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: ['account'], enabled, queryFn: async () => (await api<{ user: AccountUser }>('auth/me')).user });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<AccountUser, 'displayName' | 'timezone' | 'locale' | 'currency' | 'avatarColor'>>) => (await api<{ user: AccountUser }>('auth/me', { method: 'PATCH', body: patch })).user,
    onSuccess: (user) => qc.setQueryData(['account'], user),
  });
}

export function useDeviceSessions() {
  const enabled = useSignedIn();
  return useQuery({ queryKey: ['sessions'], enabled, queryFn: async () => (await api<{ sessions: DeviceSession[] }>('auth/sessions')).sessions });
}

export function useRevokeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: { id: string } | { others: true }) => api('auth/sessions/revoke', { body: target }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
