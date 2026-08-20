'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { BoxIcon } from '@/components/ui/icons';

const SOURCES = [
  { value: 'ledger', label: 'Financial ledger' },
  { value: 'bookings', label: 'Bookings' },
] as const;

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

// New page — DESIGN_INVENTORY.md advanced_reporting_exports. CSV is the
// substitute for "Excel" per the build spec (no xlsx dependency in the
// project); real PDF generation is deferred for the same reason (no PDF
// library present either) — noted here in the UI, not silently dropped.
export default function AdminReportsPage() {
  const [source, setSource] = useState<(typeof SOURCES)[number]['value']>('ledger');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [region, setRegion] = useState('');

  function download() {
    const params = new URLSearchParams({ source });
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    if (region) params.set('region', region);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
    window.open(`${base}/api/admin/reports/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out] max-w-xl">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Reporting</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Custom exports</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">
        Build a filtered export of real platform data. Exports as CSV — a spreadsheet-compatible substitute for
        Excel, added without a new dependency. PDF generation is deferred until a PDF library is added to the
        project.
      </p>

      <div className="ip-card">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-11 h-11 rounded-full bg-ip-primary-container/20 text-ip-primary flex items-center justify-center flex-shrink-0">
            <BoxIcon className="w-5 h-5" />
          </span>
          <p className="font-heading font-semibold">Export builder</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Data source
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
              <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                From
              </label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                To
              </label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Region (optional)
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Visakhapatnam"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Format
            </label>
            <div className="flex gap-2">
              <span className="px-3.5 py-2 rounded-ip-pill text-xs font-semibold bg-ip-primary-container/20 text-ip-primary">CSV</span>
              <span className="px-3.5 py-2 rounded-ip-pill text-xs font-semibold bg-ip-surface-container text-ip-on-surface-variant" title="Deferred — no PDF library in the project yet">
                PDF (deferred)
              </span>
            </div>
          </div>
          <Button className="w-full" size="lg" onClick={download}>
            Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
