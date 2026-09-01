'use client';

import { Suspense } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ToastProvider } from '@/components/Toast';
import { DashboardProvider } from '@/components/dashboard/DashboardContext';
import Shell from '@/components/dashboard/Shell';

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <DashboardProvider>
            <Shell>{children}</Shell>
          </DashboardProvider>
        </Suspense>
      </ToastProvider>
    </ThemeProvider>
  );
}
