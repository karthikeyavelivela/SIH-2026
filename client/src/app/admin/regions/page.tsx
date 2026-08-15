'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface Region {
  _id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
}

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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Expansion</p>
        <h1 className="font-heading text-2xl font-bold mb-1">Regions</h1>
        <p className="text-sm text-text-muted mb-6">
          A region only matters once fare rules exist for it (Fares tab) — launching it here just marks it live.
        </p>

        <div className="space-y-3">
          {regions.map((r) => (
            <Card key={r._id} elevation="raised" className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-text-muted">Launched {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={r.enabled ? 'success' : 'muted'}>{r.enabled ? 'Live' : 'Disabled'}</Badge>
                <button onClick={() => toggle(r)} className="text-xs font-semibold text-primary-600 hover:underline">
                  {r.enabled ? 'Disable' : 'Re-enable'}
                </button>
              </div>
            </Card>
          ))}
          {regions.length === 0 && <p className="text-sm text-text-muted">No regions launched yet.</p>}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary-600 mb-2">Launch</p>
        <h2 className="font-heading text-xl font-bold mb-1">New region</h2>
        <p className="text-sm text-text-muted mb-6">e.g. "Vijayawada" — must match the region string used on fare rules.</p>
        <Card elevation="raised">
          <form onSubmit={handleLaunch} className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Region name"
              aria-label="Region name"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-sm placeholder:text-text-muted/70 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 transition-colors duration-fast"
              required
              minLength={2}
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Launching…' : 'Launch region'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
