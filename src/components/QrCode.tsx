// Renders a scannable QR code as inline SVG using the `qrcode` library.
// Builds the vector path directly from QRCode.create().modules so it renders
// synchronously with zero flicker and scales crisply at any size.

import React, { useMemo } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  className?: string;
}

export const QrCode: React.FC<QrCodeProps> = ({
  value,
  size = 200,
  fg = '#1A1916',
  bg = '#FFFFFF',
  className = '',
}) => {
  const matrix = useMemo(() => {
    try {
      if (!value) return null;
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const data = qr.modules.data;
      let path = '';
      const margin = 2;
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (data[r * count + c]) {
            path += `M${c + margin},${r + margin}h1v1h-1z`;
          }
        }
      }
      return { count, margin, total: count + margin * 2, path };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-ink-secondary ${className}`}
        style={{ width: size, height: size }}
      >
        QR unavailable
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0 }}
      role="img"
      aria-label={`QR code: ${value}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${matrix.total} ${matrix.total}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="w-full h-full rounded-lg"
      >
        <rect width={matrix.total} height={matrix.total} fill={bg} />
        <path d={matrix.path} fill={fg} />
      </svg>
    </div>
  );
};

export default QrCode;
