'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type JoinType = 'solo' | 'leader' | 'member';

export default function SignupHamaliPage() {
  const router = useRouter();
  const { refetch } = useAuth();
  const [joinType, setJoinType] = useState<JoinType>('solo');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    muthaName: '',
    inviteCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/signup/hamali', { ...form, joinType });
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
        <h1 className="font-heading text-2xl font-bold mb-6">Join FYRO as Hamali</h1>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {(['solo', 'leader', 'member'] as JoinType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setJoinType(t)}
              className={`py-2 rounded-full text-sm font-medium border ${
                joinType === t ? 'bg-secondary text-white border-secondary' : 'border-black/10 text-text-muted'
              }`}
            >
              {t === 'solo' ? 'Solo' : t === 'leader' ? 'Create Mutha' : 'Join Mutha'}
            </button>
          ))}
        </div>

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
          {joinType === 'leader' && (
            <input
              placeholder="Mutha (group) name"
              value={form.muthaName}
              onChange={(e) => setForm({ ...form, muthaName: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
          )}
          {joinType === 'member' && (
            <input
              placeholder="Invite code from your leader"
              value={form.inviteCode}
              onChange={(e) => setForm({ ...form, inviteCode: e.target.value.toUpperCase() })}
              className="w-full px-4 py-2.5 rounded-xl border border-black/10 bg-background"
              required
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full" variant="secondary">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
