import React, { useEffect, useState } from 'react';

interface Particle {
  id: number;
  x: number; // percentage (0-100)
  size: number; // pixels
  color: string;
  delay: number; // ms
  duration: number; // s
  shape: 'star' | 'circle' | 'diamond';
  rotation: number;
}

const CELEBRATION_COLORS = [
  '#2563EB', // accent blue
  '#60A5FA', // light blue
  '#16A34A', // success green
  '#34D399', // mint green
  '#F59E0B', // gold yellow
  '#F472B6', // rose pink
];

export const CelebrationEffect: React.FC = () => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Generate 48 high-quality falling celebratory sparkles
    const pool: Particle[] = Array.from({ length: 48 }).map((_, i) => {
      const colors = CELEBRATION_COLORS;
      const shapes: ('star' | 'circle' | 'diamond')[] = ['star', 'circle', 'diamond'];
      return {
        id: i,
        x: Math.random() * 100, // random start horizontal %
        size: Math.random() * 12 + 6, // 6px to 18px
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 2000, // wider staggered release for 8s action
        duration: Math.random() * 3.5 + 4.5, // 4.5s to 8.0s glide
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        rotation: Math.random() * 360,
      };
    });

    setParticles(pool);

    // After 8.0 seconds, trigger the 1.5-second transition to fade the opacity out beautifully by 9.5 seconds
    const fadeTimer = setTimeout(() => {
      setVisible(false);
    }, 8000);

    return () => {
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div 
      id="visual-celebration-overlayer-wrapper" 
      className="absolute inset-0 pointer-events-none overflow-hidden z-40 rounded-xl transition-opacity duration-[1500ms]"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {particles.map((p) => {
        return (
          <div
            key={p.id}
            className="absolute top-0"
            style={{
              left: `${p.x}%`,
              animationName: 'fall',
              animationTimingFunction: 'ease-out',
              animationIterationCount: 'infinite',
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}s`,
              transform: `rotate(${p.rotation}deg)`,
              opacity: 0.95,
            }}
          >
            {p.shape === 'star' && (
              <svg
                width={p.size}
                height={p.size}
                viewBox="0 0 24 24"
                fill={p.color}
                className="drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.15)] animate-pulse"
              >
                <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.786 1.4 8.168-7.334-3.856-7.334 3.856 1.4-8.168-5.934-5.786 8.2-1.192z" />
              </svg>
            )}
            {p.shape === 'diamond' && (
              <div
                className="drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.15)] rotate-45"
                style={{
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: p.color,
                }}
              />
            )}
            {p.shape === 'circle' && (
              <div
                className="rounded-full drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.15)]"
                style={{
                  width: `${p.size - 2}px`,
                  height: `${p.size - 2}px`,
                  backgroundColor: p.color,
                }}
              />
            )}
          </div>
        );
      })}

      {/* Embedded CSS rules for the falling physics */}
      <style>{`
        @keyframes fall {
          0% {
            transform: translateY(-20px) rotate(0deg) scale(0.3);
            opacity: 0;
          }
          10% {
            opacity: 1;
            transform: translateY(0px) rotate(36deg) scale(1);
          }
          90% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(580px) rotate(360deg) scale(0.6);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
