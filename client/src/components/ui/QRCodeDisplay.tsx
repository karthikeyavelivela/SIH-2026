'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

// Renders a real, scannable QR code client-side (no external service call —
// `qrcode` encodes locally) for depot-gate certification checks, referral
// links, invite codes.
export function QRCodeDisplay({ value, size = 160, className = '' }: QRCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1D1B19', light: '#FEF8F4' } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className={`animate-pulse rounded-ip-input bg-ip-surface-container-high ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt={`QR code for ${value}`} width={size} height={size} className={`rounded-ip-input ${className}`} />;
}
