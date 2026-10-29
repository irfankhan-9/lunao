// Renders an invite code (LUNAO-XXXX-XXXX) as a hero "code pill":
// each character is a small monospace block, separated by hyphens,
// optimized to fit perfectly on desktop and mobile screens.

import React, { useState } from 'react';

interface CodePillProps {
  code: string;        // e.g. "LUNAO-7H2K-9XF1"
  onCopy?: () => void;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  floating?: boolean;
}

const SIZE_CLASSES = {
  sm: { wrap: 'gap-1 px-2 py-1.5', char: 'w-6 h-8 text-xs', dash: 'text-xs' },
  md: { wrap: 'gap-1 px-2.5 py-2', char: 'w-7 h-8 text-sm', dash: 'text-sm' },
  lg: { wrap: 'gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5', char: 'w-6 h-8 sm:w-7 sm:h-9 text-xs sm:text-sm', dash: 'text-xs sm:text-sm' },
};

export const CodePill: React.FC<CodePillProps> = ({ code, onCopy, onClick, size = 'md', floating = false }) => {
  const [flashing, setFlashing] = useState(false);
  const [, setCopied] = useState(false);
  const cls = SIZE_CLASSES[size];

  const segments = code.split('-');
  const chars: Array<{ ch: string; idx: number; isDash: boolean }> = [];
  segments.forEach((seg, si) => {
    for (let ci = 0; ci < seg.length; ci++) {
      chars.push({ ch: seg[ci], idx: chars.length, isDash: false });
    }
    if (si < segments.length - 1) {
      chars.push({ ch: '-', idx: chars.length, isDash: true });
    }
  });

  const handleClick = async () => {
    if (onClick) onClick();
    if (!onCopy) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    onCopy();
    setCopied(true);
    setFlashing(true);
    setTimeout(() => setFlashing(false), 650);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title="Click to copy"
      className={`group inline-flex items-center justify-center font-mono font-bold text-ink select-none cursor-pointer
                  transition-all max-w-full overflow-hidden
                  ${floating
                    ? 'bg-white/90 backdrop-blur-sm border border-border-main rounded-xl shadow-sm hover:shadow-md hover:bg-white'
                    : 'bg-off-white border border-border-main rounded-xl hover:border-accent/40 hover:bg-white'}
                  ${cls.wrap}
                  ${flashing ? 'animate-code-copy-flash' : ''}`}
    >
      {chars.map((c, i) =>
        c.isDash ? (
          <span key={i} className={`${cls.dash} text-ink-tertiary px-0.5 font-bold`}>-</span>
        ) : (
          <span
            key={i}
            className={`${cls.char} inline-flex items-center justify-center rounded bg-white border border-border-light text-ink shadow-2xs
                        group-hover:border-accent/40 group-hover:text-accent transition-colors`}
          >
            {c.ch}
          </span>
        )
      )}
    </div>
  );
};
