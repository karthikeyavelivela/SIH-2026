'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AlertIcon } from '@/components/ui/icons';

interface DocRow {
  key: 'licenseExpiryAt' | 'insuranceExpiryAt';
  label: string;
  value: string | null;
}

interface DocumentExpiryCardProps {
  license: string | null;
  insurance?: string | null; // omit entirely for roles with no vehicle (hamali/mutha)
  onSaved: (updated: { licenseExpiryAt?: string | null; insuranceExpiryAt?: string | null }) => void;
}

const WARN_WINDOW_DAYS = 30;

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Spec: "status pills (verified/pending/expiring soon in a warm amber, not
// alarming red unless actually expired) — reduces anxiety while still
// being informative." Self-reported dates for now — see
// User.licenseExpiryAt / Vehicle.insuranceExpiryAt doc comments.
export function DocumentExpiryCard({ license, insurance, onSaved }: DocumentExpiryCardProps) {
  const [editing, setEditing] = useState(false);
  const [licenseDraft, setLicenseDraft] = useState(license?.slice(0, 10) ?? '');
  const [insuranceDraft, setInsuranceDraft] = useState(insurance?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows: DocRow[] = [
    { key: 'licenseExpiryAt', label: 'License / ID', value: license },
    ...(insurance !== undefined ? [{ key: 'insuranceExpiryAt' as const, label: 'Vehicle insurance', value: insurance }] : []),
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ user: { licenseExpiryAt?: string }; insuranceExpiryAt: string | null }>(
        '/api/auth/me/documents',
        {
          licenseExpiryAt: licenseDraft || null,
          ...(insurance !== undefined ? { insuranceExpiryAt: insuranceDraft || null } : {}),
        }
      );
      onSaved({ licenseExpiryAt: res.user.licenseExpiryAt ?? null, insuranceExpiryAt: res.insuranceExpiryAt });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card elevation="raised" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-heading font-bold">Documents</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-primary-600">
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="space-y-3">
          {rows.map((row) => {
            if (!row.value) {
              return (
                <div key={row.key} className="flex items-center justify-between text-sm">
                  <span>{row.label}</span>
                  <Badge tone="muted">Not set</Badge>
                </div>
              );
            }
            const days = daysUntil(row.value);
            const expired = days < 0;
            const soon = days >= 0 && days <= WARN_WINDOW_DAYS;
            return (
              <div key={row.key} className="flex items-center justify-between text-sm">
                <span>{row.label}</span>
                {expired ? (
                  <Badge tone="danger">Expired</Badge>
                ) : soon ? (
                  <Badge tone="warning">Expires in {days}d</Badge>
                ) : (
                  <Badge tone="success">Valid</Badge>
                )}
              </div>
            );
          })}
          {rows.some((r) => r.value && daysUntil(r.value) <= WARN_WINDOW_DAYS) && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <AlertIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Renew soon to avoid a sudden account pause.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-text-muted">License / ID expiry</span>
            <input
              type="date"
              value={licenseDraft}
              onChange={(e) => setLicenseDraft(e.target.value)}
              className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-md border border-border bg-background text-sm"
            />
          </label>
          {insurance !== undefined && (
            <label className="block">
              <span className="text-xs text-text-muted">Vehicle insurance expiry</span>
              <input
                type="date"
                value={insuranceDraft}
                onChange={(e) => setInsuranceDraft(e.target.value)}
                className="mt-1 w-full min-h-[44px] px-3.5 py-2 rounded-md border border-border bg-background text-sm"
              />
            </label>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="md" disabled={saving} onClick={save} className="flex-1">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
