import React from 'react';

interface LogoProps {
  size?: number; // outer square size in px
  showWordmark?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, showWordmark = false, className = '' }) => {
  // Outer 12deg-rotated accent square with an inner white square unrotated.
  const innerSize = Math.round(size * 0.44);
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="bg-accent rounded-sm rotate-[12deg] flex items-center justify-center shadow-sm"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <div
          className="bg-white rounded-xs -rotate-[12deg]"
          style={{ width: innerSize, height: innerSize }}
        />
      </div>
      {showWordmark && (
        <span className="font-serif text-ink leading-none text-[22px] tracking-tight">
          Lunao
        </span>
      )}
    </div>
  );
};
