'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';

interface Region {
  _id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md — all
// fetch/mutation logic identical to before this pass.
export default function AdminRegionsPage() {
  const { data, reload } = usePolling(() => api.get<{ regions: Region[] }>('/api/admin/regions'), 20000);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLaunch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/regions', { name });
      setName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not launch this region.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(region: Region) {
    await api.patch(`/api/admin/regions/${region._id}`, { enabled: !region.enabled });
    await reload();
  }

  const regions = data?.regions ?? [];

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Expansion</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Regions</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">
          A region only matters once fare rules exist for it (Fares tab) — launching it here just marks it live.
        </p>

        <div className="space-y-3">
          {regions.map((r) => (
            <div key={r._id} className="ip-card flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-ip-on-surface-variant">Launched {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusChip tone={r.enabled ? 'success' : 'muted'}>{r.enabled ? 'Live' : 'Disabled'}</StatusChip>
                <button onClick={() => toggle(r)} className="text-xs font-semibold text-ip-primary hover:underline">
                  {r.enabled ? 'Disable' : 'Re-enable'}
                </button>
              </div>
            </div>
          ))}
          {regions.length === 0 && <p className="text-sm text-ip-on-surface-variant">No regions launched yet.</p>}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">Launch</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">New region</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">e.g. &quot;Vijayawada&quot; — must match the region string used on fare rules.</p>
        <div className="ip-card">
          <form onSubmit={handleLaunch} className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Region name"
              aria-label="Region name"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm placeholder:text-ip-on-surface-variant/70 focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20 transition-colors"
              required
              minLength={2}
            />
            {error && <p className="text-sm text-ip-error">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Launching…' : 'Launch region'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
