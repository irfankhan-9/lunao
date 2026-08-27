import { useState } from 'react';
import { MessageSquare, Phone, BarChart3, Settings } from 'lucide-react';
import { Messages } from './Messages';
import { Numbers } from './Numbers';
import { MessagingAnalytics } from './MessagingAnalytics';
import { MessagingSettings } from './MessagingSettings';

type MessagingTab = 'inbox' | 'numbers' | 'analytics' | 'settings';

export function MessagingLayout() {
  const [activeSubTab, setActiveSubTab] = useState<MessagingTab>('inbox');

  const tabs = [
    { id: 'inbox' as MessagingTab, label: 'Inbox', icon: MessageSquare },
    { id: 'numbers' as MessagingTab, label: 'Numbers', icon: Phone },
    { id: 'analytics' as MessagingTab, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as MessagingTab, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-navigation */}
      <div className="mb-6">
        <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-border-light w-fit">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-accent-soft text-accent'
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

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'inbox' && <Messages />}
        {activeSubTab === 'numbers' && <Numbers />}
        {activeSubTab === 'analytics' && <MessagingAnalytics />}
        {activeSubTab === 'settings' && <MessagingSettings />}
      </div>
    </div>
  );
}
