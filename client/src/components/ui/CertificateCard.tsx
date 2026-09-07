import { QRCodeDisplay } from './QRCodeDisplay';
import { StatusChip } from './StatusChip';

interface CertificateCardProps {
  title: string;
  skills: string[];
  validFrom: string;
  validUntil: string;
  qrValue: string;
  expired?: boolean;
  onDownload?: () => void;
}

// Certification issued on training-academy completion — endorsed skills,
// validity window, scannable QR for depot-gate verification.
export function CertificateCard({ title, skills, validFrom, validUntil, qrValue, expired = false, onDownload }: CertificateCardProps) {
  return (
    <div className="fy-surface-card flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-fy-brown-soft/25 text-fy-brown flex items-center justify-center">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15a5 5 0 100-10 5 5 0 000 10z" />
          <path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" />
        </svg>
      </div>
      <div>
        <h3 className="font-heading font-extrabold text-lg text-fy-ink">{title}</h3>
        <StatusChip tone={expired ? 'danger' : 'success'} dot>
          {expired ? 'Expired' : 'Certified'}
        </StatusChip>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {skills.map((s) => (
          <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-fy-well text-fy-ink-soft">
            {s}
          </span>
        ))}
      </div>
      <p className="text-xs text-fy-ink-soft">
        Valid {validFrom} – {validUntil}
      </p>
      <QRCodeDisplay value={qrValue} size={120} />
      {onDownload && (
        <button type="button" onClick={onDownload} className="text-sm font-semibold text-fy-brown hover:underline">
          Download PDF
        </button>
      )}
    </div>
  );
}
