'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@aurora/ui';
import { AppShell } from '../../components/app-shell';
import { SessionProvider } from '../../lib/session';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      fallback={
        <div style={{ padding: 48 }}>
          <Skeleton rows={6} />
        </div>
      }
    >
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
