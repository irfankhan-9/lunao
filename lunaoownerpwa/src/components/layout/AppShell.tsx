import React from 'react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { MobileNav } from './MobileNav';
import { Toast } from '../ui/Toast';
import { OfflineIndicator } from '../ui/OfflineIndicator';
import { PWAInstallBanner } from '../ui/PWAInstallBanner';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex antialiased">
      <OfflineIndicator />
      <Toast />

      {/* Desktop Persistent Sidebar */}
      <Sidebar />

      {/* Main Content Viewport */}
      <div id="app-viewport" className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        <TopHeader />
        <PWAInstallBanner />

        <main id="main-content" className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24 lg:pb-12">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav />
      </div>
    </div>
  );
};
