'use client';

import { useRef } from 'react';
import { StatusChip } from './StatusChip';

type DocStatus = 'missing' | 'pending' | 'verified' | 'rejected';

interface DocumentUploadCardProps {
  label: string;
  status: DocStatus;
  fileName?: string;
  rejectionReason?: string;
  onUpload?: (file: File) => void;
}

const statusTone: Record<DocStatus, 'muted' | 'secondary' | 'success' | 'danger'> = {
  missing: 'muted',
  pending: 'secondary',
  verified: 'success',
  rejected: 'danger',
};
const statusLabel: Record<DocStatus, string> = {
  missing: 'Not uploaded',
  pending: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

// KYC document tile — Driving Licence, Vehicle RC, FASTag, Goods Carriage
// Permit, PUC, Fitness Certificate, Aadhaar, PAN, GSTIN. Upload disabled
// once verified (re-upload flow, if ever needed, is a distinct "replace"
// action — not modeled here to avoid silently overwriting a verified doc).
export function DocumentUploadCard({ label, status, fileName, rejectionReason, onUpload }: DocumentUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = onUpload && status !== 'verified';

  return (
    <div className="ip-card flex items-center gap-ip-sm">
      <div className="w-11 h-11 rounded-full bg-ip-surface-container-highest flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3v5a1 1 0 001 1h5" />
          <path d="M6 3h8l6 6v11a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ip-on-surface truncate">{label}</p>
        {fileName && <p className="text-xs text-ip-on-surface-variant truncate">{fileName}</p>}
        {status === 'rejected' && rejectionReason && <p className="text-xs text-ip-error mt-0.5">{rejectionReason}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <StatusChip tone={statusTone[status]}>{statusLabel[status]}</StatusChip>
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload!(file);
              }}
            />
            <button type="button" onClick={() => inputRef.current?.click()} className="text-xs font-semibold text-ip-primary hover:underline">
              {status === 'rejected' ? 'Re-upload' : 'Upload'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
