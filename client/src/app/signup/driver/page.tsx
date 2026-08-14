'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function SignupDriverPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    vehicleType: 'mini_truck',
    capacityKg: '',
    registrationNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/driver', { ...form, capacityKg: Number(form.capacityKg) });
      await refetch();
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <h1 className="font-heading text-2xl font-bold mb-6">Drive with FYRO</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            minLength={8}
          />
          <select
            value={form.vehicleType}
            onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
          >
            <option value="mini_truck">Mini truck</option>
            <option value="medium_truck">Medium truck</option>
            <option value="large_truck">Large truck</option>
          </select>
          <input
            type="number"
            placeholder="Capacity (kg)"
            value={form.capacityKg}
            onChange={(e) => setForm({ ...form, capacityKg: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
            min={1}
          />
          <input
            placeholder="Registration number"
            value={form.registrationNumber}
            onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
            className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
