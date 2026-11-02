import React from 'react';

interface MonogramProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  logoUrl?: string | null;
}

export const Monogram: React.FC<MonogramProps> = ({
  name,
  size = 'md',
  className = '',
  logoUrl,
}) => {
  if (logoUrl) {
    const sizeImgMap = {
      sm: 'w-7 h-7',
      md: 'w-9 h-9',
      lg: 'w-12 h-12',
      xl: 'w-16 h-16',
    };
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`rounded-xl object-cover border border-slate-200 ${sizeImgMap[size]} ${className}`}
      />
    );
  }

  // Generate initial monogram
  const words = name.trim().split(/\s+/).filter(w => !['the', 'and', 'a', '&'].includes(w.toLowerCase()));
  const monogram = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : (name[0] || 'L').toUpperCase();

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs rounded-lg',
    md: 'w-9 h-9 text-sm rounded-xl',
    lg: 'w-12 h-12 text-lg rounded-2xl',
    xl: 'w-16 h-16 text-2xl rounded-2xl',
  };

  return (
    <div
      className={`inline-flex items-center justify-center font-bold tracking-tight text-white shadow-xs shrink-0 select-none bg-emerald-700 relative overflow-hidden ${sizeClasses[size]} ${className}`}
    >
      <span className="relative z-10 text-white">
        {monogram}
      </span>
    </div>
  );
};
