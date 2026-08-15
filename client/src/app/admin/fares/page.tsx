'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface FareRule {
  _id: string;
  region: string;
  category: 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  active: boolean;
}

const CATEGORIES: { value: FareRule['category']; label: string }[] = [
  { value: 'vehicle_small', label: 'Vehicle — small (≤1,000 kg)' },
  { value: 'vehicle_medium', label: 'Vehicle — medium (≤5,000 kg)' },
  { value: 'vehicle_large', label: 'Vehicle — large (>5,000 kg)' },
  { value: 'hamali', label: 'Hamali (per worker)' },
];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export default function AdminFaresPage() {
  const [rules, setRules] = useState<FareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    region: 'Visakhapatnam',
    category: 'vehicle_small' as FareRule['category'],
    baseFare: '',
    perKmRate: '',
    minimumFare: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<{ fareRules: FareRule[] }>('/api/admin/fare-rules');
    setRules(res.fareRules);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/fare-rules', {
        region: form.region,
        category: form.category,
        baseFare: Number(form.baseFare),
        perKmRate: Number(form.perKmRate),
        minimumFare: Number(form.minimumFare),
      });
      setForm({ ...form, baseFare: '', perKmRate: '', minimumFare: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create fare rule');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(rule: FareRule) {
    await api.patch(`/api/admin/fare-rules/${rule._id}`, { active: !rule.active });
    await load();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Pricing</p>
        <h1 className="font-heading text-2xl font-bold mb-1">Fare rules</h1>
        <p className="text-sm text-text-muted mb-6">
          Region × category rate cards. Creating a new active rule for the same region+category retires the
          previous one automatically.
        </p>

        {loading && <div className="h-40 rounded-lg bg-surface animate-pulse" />}

        {!loading && rules.length === 0 && (
          <Card elevation="raised" className="text-center py-10">
            <p className="text-sm text-text-muted">
              No fare rules yet — bookings can't be created until at least one exists per region/category.
            </p>
          </Card>
        )}

        <div className="space-y-3">
          {rules.map((r) => (
            <Card key={r._id} elevation="raised">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">{r.region}</p>
                <Badge tone={r.active ? 'success' : 'muted'}>{r.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-sm text-text-muted mb-3 capitalize">{r.category.replace('_', ' ')}</p>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <p className="text-xs text-text-muted">Base</p>
                  <p className="font-semibold">₹{r.baseFare}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Per km</p>
                  <p className="font-semibold">₹{r.perKmRate}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Minimum</p>
                  <p className="font-semibold">₹{r.minimumFare}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(r)}
                className="text-xs font-semibold text-primary-600 hover:underline"
              >
                {r.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary-600 mb-2">Add</p>
        <h2 className="font-heading text-xl font-bold mb-1">New fare rule</h2>
        <p className="text-sm text-text-muted mb-6">Launch region is Visakhapatnam until Phase 5's region picker.</p>
        <Card elevation="raised">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder="Region"
              aria-label="Region"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className={inputClass}
              required
            />
            <select
              aria-label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as FareRule['category'] })}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Base fare (₹)"
              aria-label="Base fare"
              value={form.baseFare}
              onChange={(e) => setForm({ ...form, baseFare: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            <input
              type="number"
              placeholder="Per-km rate (₹)"
              aria-label="Per-km rate"
              value={form.perKmRate}
              onChange={(e) => setForm({ ...form, perKmRate: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            <input
              type="number"
              placeholder="Minimum fare (₹)"
              aria-label="Minimum fare"
              value={form.minimumFare}
              onChange={(e) => setForm({ ...form, minimumFare: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            {error && <ErrorAlert message={error} />}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create fare rule'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
