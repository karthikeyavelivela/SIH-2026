'use client';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';

interface Progress {
  bonusAmount: number;
  completedJobs: number;
  requiredJobs: number;
  remainingJobs: number;
}

interface IncentiveProgressBarProps {
  accent?: 'primary' | 'secondary';
}

// Spec: "gamified incentives visible in real numbers ('2 more trips to
// bonus') — proven retention driver". IncentiveRule/Incentive already
// existed (admin/incentives creates rules, grants happen server-side) —
// this is the missing forward-looking half: nothing showed a worker where
// they stood before a grant lands. Deliberately a plain bar, not
// confetti/badges — "gamification done tastefully" per DESIGN.md.
export function IncentiveProgressBar({ accent = 'primary' }: IncentiveProgressBarProps) {
  const { data } = usePolling(() => api.get<{ progress: Progress | null }>('/api/incentives/my-progress'), 60000);
  const progress = data?.progress;
  if (!progress) return null;

  const fillPct = Math.min(100, Math.round((progress.completedJobs / Math.max(1, progress.requiredJobs)) * 100));
  const bar = accent === 'primary' ? 'bg-primary-600' : 'bg-secondary-600';

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4 mb-6">
      <p className="text-sm font-semibold mb-2">
        {progress.remainingJobs > 0
          ? `${progress.remainingJobs} more trip${progress.remainingJobs === 1 ? '' : 's'} for ₹${progress.bonusAmount} bonus`
          : `₹${progress.bonusAmount} bonus unlocked — keep going`}
      </p>
      <div className="h-2 rounded-full bg-surface overflow-hidden">
        <div className={`h-full rounded-full ${bar} transition-all duration-base`} style={{ width: `${fillPct}%` }} />
      </div>
      <p className="text-xs text-text-muted mt-1.5">
        {progress.completedJobs} / {progress.requiredJobs} trips
      </p>
    </div>
  );
}
