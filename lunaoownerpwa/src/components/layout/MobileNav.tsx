import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Workflow,
  Menu,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { NavSection } from '../../types';
import { MoreDrawer } from './MoreDrawer';
import { soundEffects } from '../../utils/soundEffects';

export const MobileNav: React.FC = () => {
  const { activeSection, setActiveSection } = useBusiness();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const primaryItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      label: 'Home',
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    {
      id: 'bookings',
      label: 'Bookings',
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      id: 'customers',
      label: 'Clients',
      icon: <Users className="w-5 h-5" />,
    },
    {
      id: 'automations',
      label: 'Automations',
      icon: <Workflow className="w-5 h-5" />,
    },
  ];

  const isMoreActive = [
    'website',
    'settings',
  ].includes(activeSection);

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-2 py-1.5 flex items-center justify-around pb-[calc(0.4rem+env(safe-area-inset-bottom))] shadow-lg">
        {primaryItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                soundEffects.playTabSwitch();
                setActiveSection(item.id);
              }}
              className={`flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'text-emerald-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isActive ? 'scale-110 text-emerald-700' : ''
                }`}
              >
                {item.icon}
              </div>
              <span className="text-[10px] tracking-tight leading-none mt-0.5">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More Drawer Button */}
        <button
          onClick={() => {
            soundEffects.playButtonClick();
            setIsMoreOpen(true);
          }}
          className={`flex-1 flex flex-col items-center justify-center min-h-[46px] py-1 rounded-xl transition-all duration-150 relative ${
            isMoreActive
              ? 'text-emerald-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <div
            className={`p-1 rounded-lg transition-transform ${
              isMoreActive ? 'scale-110 text-emerald-700' : ''
            }`}
          >
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight leading-none mt-0.5">
            More
          </span>
          {isMoreActive && (
            <span className="absolute top-1 right-5 w-1.5 h-1.5 rounded-full bg-emerald-600" />
          )}
        </button>
      </nav>

      <MoreDrawer isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  );
};
