import { useState, useEffect } from 'react';
import { MessageSquare, Phone, BarChart3, Settings } from 'lucide-react';
import { Messages } from './Messages';
import { Numbers } from './Numbers';
import { MessagingAnalytics } from './MessagingAnalytics';
import { MessagingSettings } from './MessagingSettings';
import { playSoftTap } from '../utils/audio';

type MessagingTab = 'inbox' | 'numbers' | 'analytics' | 'settings';

interface MessagingLayoutProps {
  userPlan?: string;
}

export function MessagingLayout({ userPlan }: MessagingLayoutProps) {
  const [activeSubTab, setActiveSubTab] = useState<MessagingTab>('inbox');

  const effectivePlan = (
    userPlan ||
    (typeof window !== 'undefined' ? localStorage.getItem('lunao_user_plan') : '') ||
    'Free'
  ).toLowerCase();

  // Growth, Pro, and Agency plans unlock Numbers, Analytics, and Settings
  const isAdvancedPlan = ['growth', 'pro', 'agency'].some(tier => effectivePlan.includes(tier));

  // Reset to inbox if user is on Free/Starter
  useEffect(() => {
    if (!isAdvancedPlan && activeSubTab !== 'inbox') {
      setActiveSubTab('inbox');
    }
  }, [isAdvancedPlan, activeSubTab]);

  const tabs = [
    { id: 'inbox' as MessagingTab, label: 'Inbox', icon: MessageSquare },
    { id: 'numbers' as MessagingTab, label: 'Numbers', icon: Phone },
    { id: 'analytics' as MessagingTab, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as MessagingTab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Sub-navigation: ONLY shown for Growth, Pro, Agency plans. Free & Starter users see only Inbox */}
      {isAdvancedPlan && (
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

      {/* Content area: Free and Starter users see ONLY Inbox */}
      <div className="flex-1 overflow-hidden">
        {(!isAdvancedPlan || activeSubTab === 'inbox') && <Messages />}
        {isAdvancedPlan && activeSubTab === 'numbers' && <Numbers />}
        {isAdvancedPlan && activeSubTab === 'analytics' && <MessagingAnalytics />}
        {isAdvancedPlan && activeSubTab === 'settings' && <MessagingSettings />}
      </div>
    </div>
  );
}
