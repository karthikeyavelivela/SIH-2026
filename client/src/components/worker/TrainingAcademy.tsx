'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckIcon, ClockIcon, ShieldIcon } from '@/components/ui/icons';

type ModuleStatus = 'locked' | 'in_progress' | 'completed';

interface TrainingModuleDoc {
  _id: string;
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
  content: string;
}

interface ProgressEntry {
  module: TrainingModuleDoc;
  status: ModuleStatus;
  completedAt: string | null;
}

interface CertificationDoc {
  _id: string;
  title: string;
}

interface Accent {
  bg: string;
  text: string;
  ring: string;
}

const ACCENTS: Record<'primary' | 'secondary', Accent> = {
  primary: { bg: 'bg-primary-600', text: 'text-primary-600', ring: 'border-primary-600' },
  secondary: { bg: 'bg-secondary-600', text: 'text-secondary-600', ring: 'border-secondary-600' },
};

// Shared presentational curriculum view for driver/hamali_solo/fleet_owner
// training-academy pages — sequential module list with server-enforced
// unlocking, and the auto-issued certification surfaced the moment the
// curriculum completes. Each role's page (client/src/app/*/training/page.tsx)
// is a thin wrapper that renders this with its own accent color.
export function TrainingAcademy({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('worker.trainingAcademy');
  function statusLabel(status: ModuleStatus): string {
    if (status === 'completed') return t('completed');
    if (status === 'in_progress') return t('available');
    return t('locked');
  }
  const tone = ACCENTS[accent];
  const { data, state, error, reload } = usePolling(
    () => api.get<{ modules: ProgressEntry[] }>('/api/training/progress'),
    30000
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justCertified, setJustCertified] = useState<CertificationDoc | null>(null);

  const modules = data?.modules ?? [];
  const completedCount = modules.filter((m) => m.status === 'completed').length;
  const pct = modules.length ? Math.round((completedCount / modules.length) * 100) : 0;

  async function handleComplete(moduleId: string) {
    setActionError(null);
    setCompletingId(moduleId);
    try {
      const res = await api.post<{ certification: CertificationDoc | null }>(
        `/api/training/modules/${moduleId}/complete`
      );
      if (res.certification) setJustCertified(res.certification);
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : t('errorComplete'));
    } finally {
      setCompletingId(null);
    }
  }

  if (state === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <EmptyState title={t('couldNotLoad')} description={error ?? undefined} action={<Button onClick={() => reload()}>{t('tryAgain')}</Button>} />
      </Card>
    );
  }

  if (modules.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ShieldIcon className="w-7 h-7" />}
          title={t('noModulesYet')}
          description={t('noModulesYetDesc')}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {justCertified && (
        <AlertBanner tone="success" icon={<CheckIcon className="w-4 h-4" />} action={<Button size="md" variant="ghost" onClick={() => setJustCertified(null)}>{t('dismiss')}</Button>}>
          <span className="font-semibold">{t('certified')}</span> {t('certifiedBody', { title: justCertified.title })}
        </AlertBanner>
      )}

      <Card>
        <div className="flex items-center justify-between mb-2">
          <p className="font-heading font-bold">{t('curriculumProgress')}</p>
          <span className={`font-heading font-extrabold text-xl ${tone.text}`}>{pct}%</span>
        </div>
        <p className="text-sm text-text-muted mb-3">
          {t('completedOfTotal', { completed: completedCount, total: modules.length })}
        </p>
        <div className="w-full h-2 rounded-full bg-surface overflow-hidden">
          <div className={`h-full rounded-full ${tone.bg} transition-all duration-base`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <div className="space-y-4">
        {modules.map((entry) => {
          const isExpanded = expanded === entry.module._id;
          const locked = entry.status === 'locked';
          const completed = entry.status === 'completed';
          return (
            <Card key={entry.module._id} className={locked ? 'opacity-60' : ''}>
              <div className="flex items-start gap-3">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    completed ? `${tone.bg} text-white` : locked ? 'bg-surface text-text-muted' : `border ${tone.ring} ${tone.text}`
                  }`}
                >
                  {completed ? <CheckIcon className="w-4 h-4" /> : locked ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 118 0v4" />
                    </svg>
                  ) : (
                    <span className="font-heading font-bold text-sm">{entry.module.order}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {t('moduleN', { n: entry.module.order })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <ClockIcon className="w-3 h-3" /> {t('minutesShort', { mins: entry.module.durationMinutes })}
                    </span>
                  </div>
                  <h3 className="font-heading font-bold text-base mb-1">{entry.module.title}</h3>
                  <p className="text-sm text-text-muted mb-2">{entry.module.description}</p>

                  {isExpanded && !locked && (
                    <div className="text-sm bg-surface rounded-md p-3 mb-2 whitespace-pre-wrap">{entry.module.content}</div>
                  )}

                  <div className="flex items-center gap-3 flex-wrap pt-2 mt-1 border-t border-border">
                    <span className={`text-xs font-semibold ${completed ? tone.text : 'text-text-muted'}`}>
                      {statusLabel(entry.status)}
                    </span>
                    {!locked && !completed && (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : entry.module._id)}
                          className="text-xs font-semibold text-text-muted hover:underline"
                        >
                          {isExpanded ? t('hideLesson') : t('readLesson')}
                        </button>
                        <Button
                          size="md"
                          variant={accent === 'secondary' ? 'secondary' : 'primary'}
                          className="ml-auto"
                          disabled={completingId === entry.module._id}
                          onClick={() => handleComplete(entry.module._id)}
                        >
                          {completingId === entry.module._id ? t('saving') : t('markComplete')}
                        </Button>
                      </>
                    )}
                    {locked && <span className="text-xs text-text-muted ml-auto">{t('unlockHint')}</span>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
