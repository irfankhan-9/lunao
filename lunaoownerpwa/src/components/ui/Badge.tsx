import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  dot = false,
}) => {
  const baseClasses =
    'inline-flex items-center gap-1.5 font-medium rounded-full border whitespace-nowrap select-none transition-colors';

  const sizeClasses = {
    sm: 'text-[11px] px-2.5 py-0.5 leading-4',
    md: 'text-xs px-3 py-1 leading-4',
  };

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    accent:
      'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  const dotColor = {
    default: 'bg-slate-400',
    neutral: 'bg-slate-400',
    accent: 'bg-emerald-600',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-emerald-600',
  };

  return (
    <span className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor[variant]}`} />}
      {children}
    </span>
  );
};
