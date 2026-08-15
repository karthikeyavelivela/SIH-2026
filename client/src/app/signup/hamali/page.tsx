'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon } from '@/components/ui/icons';

type JoinType = 'solo' | 'leader' | 'member';

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

const JOIN_TYPE_META: Record<JoinType, { label: string; hint: string }> = {
  solo: { label: 'Solo', hint: 'Work independently' },
  leader: { label: 'Create Mutha', hint: 'Lead a new group' },
  member: { label: 'Join Mutha', hint: 'Join with a code' },
};

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
      const home =
        joinType === 'solo' ? '/hamali/dashboard' : joinType === 'leader' ? '/mutha/dashboard' : '/mutha-member/job';
      router.push(home);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden bg-background">
      <Link
        href="/"
        aria-label="Back to home"
        className="absolute top-5 left-5 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-surface-raised border border-border shadow-sm hover:bg-surface transition-colors duration-fast"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </Link>
      <div
        className="pointer-events-none absolute -top-32 -left-24 w-80 h-80 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden="true"
      />

      <Card elevation="raised" className="w-full max-w-sm relative z-10 animate-[fadeUp_600ms_ease-out]">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-secondary-600 mb-2">
          Join the crew
        </p>
        <h1 className="font-heading text-2xl font-bold mb-1">Join FYRO as Hamali</h1>
        <p className="text-sm text-text-muted mb-6">Pick how you&apos;d like to get started.</p>

        <div
          className="grid grid-cols-3 gap-2 mb-7 p-1.5 rounded-lg border border-border bg-surface shadow-sm"
          role="radiogroup"
          aria-label="How would you like to join?"
        >
          {(['solo', 'leader', 'member'] as JoinType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={joinType === t}
              onClick={() => setJoinType(t)}
              className={`flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-md text-xs font-semibold transition-all duration-fast ${
                joinType === t
                  ? 'bg-secondary-600 text-white shadow-md -translate-y-0.5'
                  : 'text-text-muted hover:bg-surface-raised hover:text-text-primary'
              }`}
            >
              <span>{JOIN_TYPE_META[t].label}</span>
              <span className={`text-[10px] font-normal ${joinType === t ? 'text-white/80' : 'text-text-muted/70'}`}>
                {JOIN_TYPE_META[t].hint}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Full name"
            aria-label="Full name"
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            required
          />
          <input
            type="tel"
            placeholder="Phone number"
            aria-label="Phone number"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputClass}
            required
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            aria-label="Password (min 8 characters)"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
            required
            minLength={8}
          />
          {joinType === 'leader' && (
            <input
              placeholder="Mutha (group) name"
              aria-label="Mutha (group) name"
              value={form.muthaName}
              onChange={(e) => setForm({ ...form, muthaName: e.target.value })}
              className={`${inputClass} animate-[fadeUp_300ms_ease-out]`}
              required
            />
          )}
          {joinType === 'member' && (
            <input
              placeholder="Invite code from your leader"
              aria-label="Invite code from your leader"
              value={form.inviteCode}
              onChange={(e) => setForm({ ...form, inviteCode: e.target.value.toUpperCase() })}
              className={`${inputClass} animate-[fadeUp_300ms_ease-out]`}
              required
            />
          )}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-[fadeIn_200ms_ease-out]"
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <p>{error}</p>
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full" variant="secondary" size="lg">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="text-sm text-text-muted mt-7 pt-6 border-t border-border">
          Already have an account?{' '}
          <Link href="/login" className="text-secondary-600 font-semibold hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
