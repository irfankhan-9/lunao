import React from 'react';
import { CheckCircle } from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';

export const Toast: React.FC = () => {
  const { toastMessage } = useBusiness();

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 right-1/2 translate-x-1/2 md:translate-x-0 md:right-6 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-emerald-300 shadow-lg text-emerald-950 text-xs font-semibold">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="whitespace-nowrap">{toastMessage}</span>
      </div>
    </div>
  );
};
