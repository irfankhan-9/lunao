import React from 'react';

interface SectionDividerProps {
  withMark?: boolean;
  className?: string;
}

// A 1px hairline that sits above a section, full bleed, with an optional
// centered 12deg-rotated square that breaks the line in the middle. This is
// the "skinny brand-consistent line" primitive referenced in the plan.
export const SectionDivider: React.FC<SectionDividerProps> = ({ withMark = false, className = '' }) => {
  return (
    <div className={`relative w-full ${className}`} aria-hidden="true">
      <div className="h-px w-full bg-border-main" />
      {withMark && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-[5px] bg-off-white p-1">
          <div className="w-2.5 h-2.5 bg-accent rounded-[2px] rotate-[12deg]" />
        </div>
      )}
    </div>
  );
};
