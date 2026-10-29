'use client';

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, AuroraClient } from '@aurora/sdk';
import type { CapabilitiesResponse, SessionInfo } from '@aurora/types';

/**
 * Session context: who is signed in, which companies they may act in, which one is selected,
 * and the capabilities (modules, permissions, navigation) for that company. Everything comes
 * from the server; the client only remembers the selected company id.
 */
interface SessionContextValue {
  session: SessionInfo;
  companyId: string | undefined;
  selectCompany: (id: string) => void;
  capabilities: CapabilitiesResponse | undefined;
  api: AuroraClient;
  can: (permission: string) => boolean;
  hasModule: (module: string) => boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const COMPANY_KEY = 'aurora.companyId';

export const baseClient = new AuroraClient({ baseUrl: '' });

export function SessionProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => baseClient.me(),
    retry: false,
  });

  useEffect(() => {
    if (!me.data) return;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(COMPANY_KEY) : null;
    const valid = me.data.companies.find((c) => c.id === stored)?.id ?? me.data.companies[0]?.id;
    setCompanyId(valid);
  }, [me.data]);

  const api = useMemo(() => baseClient.withCompany(companyId), [companyId]);

  const capabilities = useQuery({
    queryKey: ['capabilities', companyId],
    queryFn: () => api.capabilities(),
    enabled: Boolean(me.data && companyId),
    retry: false,
  });

  const selectCompany = useCallback(
    (id: string) => {
      window.localStorage.setItem(COMPANY_KEY, id);
      setCompanyId(id);
      void qc.invalidateQueries();
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    try {
      await baseClient.logout();
    } finally {
      window.localStorage.removeItem(COMPANY_KEY);
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) window.location.href = '/login';
  }, [me.error]);

  if (me.isPending) return <>{fallback}</>;
  if (!me.data) return <>{fallback}</>;

  const value: SessionContextValue = {
    session: me.data,
    companyId,
    selectCompany,
    capabilities: capabilities.data,
    api,
    can: (p) => capabilities.data?.permissions.includes(p) ?? false,
    hasModule: (m) => (capabilities.data?.modules as string[] | undefined)?.includes(m) ?? false,
    signOut,
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Map an API error to a user-facing message key without leaking internals. */
export function errorMessage(
  error: unknown,
  t: (
    k: 'common.error' | 'common.forbidden' | 'common.moduleDisabled' | 'common.notFound',
  ) => string,
): { message: string; requestId?: string } {
  if (error instanceof ApiError) {
    if (error.code === 'MODULE_DISABLED')
      return { message: t('common.moduleDisabled'), requestId: error.body.requestId };
    if (error.code === 'FORBIDDEN')
      return { message: t('common.forbidden'), requestId: error.body.requestId };
    if (error.code === 'NOT_FOUND')
      return { message: t('common.notFound'), requestId: error.body.requestId };
    if (
      error.code === 'VALIDATION_FAILED' ||
      error.code === 'BUSINESS_RULE' ||
      error.code === 'CONFLICT' ||
      error.code === 'VERSION_CONFLICT'
    ) {
      const fields = error.body.fieldErrors?.map((f) => `${f.path}: ${f.message}`).join('; ');
      return {
        message: fields ? `${error.message} — ${fields}` : error.message,
        requestId: error.body.requestId,
      };
    }
    return { message: t('common.error'), requestId: error.body.requestId };
  }
  return { message: t('common.error') };
}
