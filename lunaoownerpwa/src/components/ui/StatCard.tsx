import React from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`relative p-4 md:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs transition-all duration-200 overflow-hidden ${
        onClick ? 'cursor-pointer hover:border-emerald-300 hover:shadow-sm active:scale-[0.99]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <div className="p-2 rounded-xl text-emerald-700 bg-emerald-50 shrink-0 border border-emerald-100">
          {icon}
        </div>
      </div>
      <div className="mt-2.5">
        <div className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 font-mono">
          {value}
        </div>
        {subtext && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-1">
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
};
