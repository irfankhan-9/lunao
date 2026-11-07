import React, { useState, useEffect } from 'react';
import { MessageSquare, Phone, Settings } from 'lucide-react';
import { Messages } from './Messages';
import { Numbers } from './Numbers';
import { MessagingSettings } from './MessagingSettings';
import { playSoftTap } from '../utils/audio';
import { Business, SidebarTab } from '../types';
import { canUseOwnTelnyx } from '../lib/pipelineClient';

type MessagingTab = 'inbox' | 'numbers' | 'settings';

interface MessagingLayoutProps {
  userPlan?: string;
  businesses?: Business[];
  setBusinesses?: React.Dispatch<React.SetStateAction<Business[]>>;
  setActiveTab?: (tab: SidebarTab) => void;
}

export function MessagingLayout({ userPlan, businesses, setBusinesses, setActiveTab }: MessagingLayoutProps) {
  const [activeSubTab, setActiveSubTab] = useState<MessagingTab>('inbox');

  const effectivePlan = (
    userPlan ||
    (typeof window !== 'undefined' ? localStorage.getItem('lunao_user_plan') : '') ||
    'Free Plan'
  );

  // All plans above Free (Starter Plan, Growth Plan, Pro Plan, Agency Plan) unlock Numbers and Settings
  const isPlanAboveFree = canUseOwnTelnyx(effectivePlan) || !effectivePlan.toLowerCase().includes('free');

  // Reset to inbox if user is on Free plan
  useEffect(() => {
    if (!isPlanAboveFree && activeSubTab !== 'inbox') {
      setActiveSubTab('inbox');
    }
  }, [isPlanAboveFree, activeSubTab]);

  // Analytics section removed for all plans above free.
  // Starter, Growth, Pro, and Agency plans have full identical access to Inbox, Numbers, and Settings.
  const tabs = [
    { id: 'inbox' as MessagingTab, label: 'Inbox', icon: MessageSquare },
    { id: 'numbers' as MessagingTab, label: 'Numbers', icon: Phone },
    { id: 'settings' as MessagingTab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Sub-navigation: Shown for Starter, Pro, Agency, and all plans above Free */}
      {isPlanAboveFree && (
        <div className="mb-6">
          <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-border-light w-fit shadow-xs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    playSoftTap();
                    setActiveSubTab(tab.id);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-accent-soft text-accent font-semibold shadow-xs'
                      : 'text-ink-secondary hover:text-ink hover:bg-off-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content area: Starter, Pro, and Agency have full access to Numbers and Settings */}
      <div className="flex-1 overflow-hidden">
        {(!isPlanAboveFree || activeSubTab === 'inbox') && (
          <Messages businesses={businesses} setBusinesses={setBusinesses} setActiveTab={setActiveTab} />
        )}
        {isPlanAboveFree && activeSubTab === 'numbers' && <Numbers />}
        {isPlanAboveFree && activeSubTab === 'settings' && <MessagingSettings />}
      </div>
    </div>
  );
}

export default MessagingLayout;
