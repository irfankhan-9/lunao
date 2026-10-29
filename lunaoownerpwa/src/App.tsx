/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect } from 'react';
import { BusinessProvider, useBusiness } from './context/BusinessContext';
import { AppShell } from './components/layout/AppShell';
import { OwnerAuthModal } from './components/auth/OwnerAuthModal';
import { scrollToTop } from './utils/scrollToTop';

import { DashboardPage } from './pages/DashboardPage';
import { BookingsPage } from './pages/BookingsPage';
import { CustomersPage } from './pages/CustomersPage';
import { WebsitePage } from './pages/WebsitePage';
import { AutomationsPage } from './pages/AutomationsPage';
import { SettingsPage } from './pages/SettingsPage';

const ActiveSectionRenderer: React.FC = () => {
  const { activeSection } = useBusiness();

  // Guarantee every section begins from the top upon navigation
  useLayoutEffect(() => {
    scrollToTop();
  }, [activeSection]);

  useEffect(() => {
    scrollToTop();
  }, [activeSection]);

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardPage />;
      case 'bookings':
        return <BookingsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'website':
        return <WebsitePage />;
      case 'automations':
        return <AutomationsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return <div key={activeSection} className="animate-in fade-in duration-150">{renderContent()}</div>;
};

const AuthenticatedAppLayout: React.FC = () => {
  const { isAuthenticated, business } = useBusiness();

  useLayoutEffect(() => {
    scrollToTop();
  }, [isAuthenticated]);

  useEffect(() => {
    scrollToTop();
    if (isAuthenticated && business?.name) {
      document.title = `${business.name} | Owner Portal`;
    }
  }, [isAuthenticated, business?.name]);

  if (!isAuthenticated) {
    return <OwnerAuthModal />;
  }

  return (
    <AppShell>
      <ActiveSectionRenderer />
    </AppShell>
  );
};

export default function App() {
  return (
    <BusinessProvider>
      <AuthenticatedAppLayout />
    </BusinessProvider>
  );
}
