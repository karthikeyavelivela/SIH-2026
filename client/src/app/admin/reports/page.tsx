'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { BoxIcon } from '@/components/ui/icons';

const SOURCE_VALUES = ['ledger', 'bookings'] as const;

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-control border border-fy-muted/20 bg-fy-bone text-fy-ink placeholder:text-fy-ink-soft/70 transition-colors focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20';

// New page — DESIGN_INVENTORY.md advanced_reporting_exports. CSV is the
// substitute for "Excel" per the build spec (no xlsx dependency in the
// project). PDF (Phase 6.6) is real — pdfkit was already a dependency
// (bolPdf.service.ts) so the earlier "deferred" placeholder was stale,
// not a genuine missing-library blocker.
export default function AdminReportsPage() {
  const t = useTranslations('adminReports');
  const SOURCES = SOURCE_VALUES.map((value) => ({ value, label: t(`sources.${value}`) }));
  const [source, setSource] = useState<(typeof SOURCE_VALUES)[number]>('ledger');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [region, setRegion] = useState('');
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');

  function download() {
    const params = new URLSearchParams({ source, format });
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (region) params.set('region', region);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
    window.open(`${base}/api/admin/reports/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out] max-w-xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-heading font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-fy-ink-soft mb-7">{t('subtitle')}</p>

      <div className="fy-surface-card">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-11 h-11 rounded-full bg-fy-brown-soft/20 text-fy-brown flex items-center justify-center flex-shrink-0">
            <BoxIcon className="w-5 h-5" />
          </span>
          <p className="font-heading font-semibold">{t('exportBuilder')}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-1.5">
              {t('dataSource')}
            </label>
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={inputClass}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-1.5">
                {t('from')}
              </label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-1.5">
                {t('to')}
              </label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-1.5">
              {t('regionOptional')}
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t('regionPlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-1.5">
              {t('format')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-colors ${
                  format === 'csv' ? 'bg-fy-brown-soft/20 text-fy-brown' : 'bg-fy-field text-fy-ink-soft'
                }`}
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-colors ${
                  format === 'pdf' ? 'bg-fy-brown-soft/20 text-fy-brown' : 'bg-fy-field text-fy-ink-soft'
                }`}
              >
                PDF
              </button>
            </div>
            {format === 'pdf' && <p className="text-xs text-fy-ink-soft mt-2">{t('pdfNote')}</p>}
          </div>
          <Button className="w-full" size="lg" onClick={download}>
            {format === 'pdf' ? t('downloadPdf') : t('downloadCsv')}
          </Button>
        </div>
      </div>
    </div>
  );
}
