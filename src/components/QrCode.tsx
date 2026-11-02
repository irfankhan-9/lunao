// Renders a scannable QR code as inline SVG using the `qrcode` library.
// The library handles all the spec compliance (Reed-Solomon EC, masking,
// format info) so we don't reinvent any wheels. We render as SVG (not
// canvas) so it scales crisply at any size and can be styled with CSS.

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
  size = 220,
  fg = '#1A1916',
  bg = '#FFFFFF',
  className = '',
}) => {
  // Build the SVG once per value/color change. We pick the smallest QR
  // version that fits the string (error correction M is plenty for a
  // short invite code).
  const svg = useMemo(() => {
    try {
      return QRCode.create(value, {
        errorCorrectionLevel: 'M',
        margin: 1, // 1-module quiet zone (4 modules equivalent at high zoom)
        width: size,
        color: { dark: fg, light: bg },
        type: 'svg',
      });
    } catch (err) {
      return null;
    }
  }, [value, size, fg, bg]);

  if (!svg) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-ink-secondary ${className}`}
        style={{ width: size, height: size }}
      >
        QR unavailable
      </div>
    );
  }

  // The library returns an object with `.svg()` returning a string. We
  // embed it directly so styling matches the rest of the drawer.
  const svgString = (svg as any).svg ? (svg as any).svg() : '';

  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0 }}
      role="img"
      aria-label={`QR code: ${value}`}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
};

export default QrCode;
