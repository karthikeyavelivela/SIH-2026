'use client';

import { useTranslations } from 'next-intl';

export interface DocPrecheck {
  recommendation: 'looks_ok' | 'needs_review' | 'unmasked_aadhaar';
  checks: { key: string; status: 'pass' | 'warn' | 'fail' | 'skipped'; detail?: string }[];
  ocrConfidence: number;
}

const KNOWN_CHECKS = ['legible', 'unmasked_aadhaar', 'id_pattern', 'name_match', 'dob_year'] as const;
const TONE: Record<DocPrecheck['checks'][number]['status'], string> = {
  pass: 'text-fy-green',
  warn: 'text-fy-brown',
  fail: 'text-fy-error',
  skipped: 'text-fy-muted',
};

/**
 * P2.4 — what the automatic reading of a KYC image suggested, for the
 * reviewer. A suggestion only: it never changes a document's status, and it
 * carries no text or number read from the document, just statuses.
 */
export function PrecheckNote({ precheck }: { precheck: DocPrecheck }) {
  const t = useTranslations('kycPrecheck');
  return (
    <div className="rounded-control bg-fy-field px-3.5 py-2.5 text-xs text-fy-ink-soft flex flex-col gap-1">
      <p className="font-semibold text-fy-ink">
        {t('title')}: {t(`rec_${precheck.recommendation}`)} · {t('confidence', { percent: precheck.ocrConfidence })}
      </p>
      <ul className="flex flex-col gap-0.5">
        {precheck.checks
          .filter((c): c is typeof c & { key: (typeof KNOWN_CHECKS)[number] } => (KNOWN_CHECKS as readonly string[]).includes(c.key))
          .map((c) => (
            <li key={c.key}>
              {t(`check_${c.key}`)}: <span className={TONE[c.status]}>{t(`status_${c.status}`)}</span>
            </li>
          ))}
      </ul>
      <p>{t('suggestion')}</p>
    </div>
  );
}
