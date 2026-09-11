'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';

/* Built against client/public/design/worker_training_academy.html — the
   curriculum list, with the sequential lock the server enforces and the
   certification that is issued the moment the curriculum completes.

   This is the console-embedded variant: it renders the list only, with no
   page chrome of its own, because it sits inside the fleet owner's sidebar
   layout. The phone-shell variant with its own TopBar and accreditation
   card is TrainingScreen.

   Nothing here is decorative: every module, its order, its duration and its
   lock state come from GET /api/training/progress, and completing one is a
   real POST that can return a real certification. */

type ModuleStatus = 'locked' | 'in_progress' | 'completed';

interface TrainingModuleDoc {
  _id: string;
  title: string;
  description: string;
  content: string;
  order: number;
  durationMinutes: number;
}

interface ProgressEntry {
  module: TrainingModuleDoc;
  status: ModuleStatus;
}

interface CertificationDoc {
  _id: string;
  title: string;
}

// Shared presentational curriculum view for driver/hamali_solo/fleet_owner
// training-academy pages. Each role's page is a thin wrapper that renders
// this with its own accent colour.
export function TrainingAcademy({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('worker.trainingAcademy');
  const { data, state, error, reload } = usePolling(
    () => api.get<{ modules: ProgressEntry[] }>('/api/training/progress'),
    30000
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justCertified, setJustCertified] = useState<CertificationDoc | null>(null);

  const modules = data?.modules ?? [];
  const accentTone = accent === 'secondary' ? 'green' : 'brown';

  function statusLabel(status: ModuleStatus): string {
    if (status === 'completed') return t('completed');
    if (status === 'in_progress') return t('available');
    return t('locked');
  }

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
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-card bg-fy-field animate-pulse" />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <LightCard className="flex flex-col gap-3">
        <Body className="font-semibold">{t('couldNotLoad')}</Body>
        {error && <MutedText>{error}</MutedText>}
        <Button variant="light" className="w-full" onClick={() => reload()}>
          {t('tryAgain')}
        </Button>
      </LightCard>
    );
  }

  if (modules.length === 0) {
    return (
      <LightCard className="flex flex-col gap-1.5">
        <Body className="font-semibold">{t('noModulesYet')}</Body>
        <MutedText>{t('noModulesYetDesc')}</MutedText>
      </LightCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {justCertified && (
        <Panel className="border border-fy-lime/50 bg-fy-lime-tint-1 flex items-start justify-between gap-3">
          <span className="flex items-start gap-3 min-w-0">
            <IconTile tone="lime" size="sm">
              <Icon name="workspace_premium" size={16} />
            </IconTile>
            <span className="flex flex-col min-w-0">
              <Body className="font-semibold">{t('certified')}</Body>
              <MutedText>{t('certifiedBody', { title: justCertified.title })}</MutedText>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setJustCertified(null)}
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-fy-green font-bold"
          >
            {t('dismiss')}
          </button>
        </Panel>
      )}

      {actionError && (
        <div role="alert" className="rounded-card bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
          {actionError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {modules.map((entry) => {
          const isExpanded = expanded === entry.module._id;
          const locked = entry.status === 'locked';
          const completed = entry.status === 'completed';
          return (
            <Panel key={entry.module._id} className={`flex flex-col gap-3 ${locked ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <IconTile tone={completed ? (accentTone === 'green' ? 'green' : 'brown') : 'slate-pale'} size="lg">
                  {completed ? (
                    <Icon name="check" size={20} />
                  ) : locked ? (
                    <Icon name="lock" size={18} />
                  ) : (
                    <span className="font-heading text-title font-bold">{entry.module.order}</span>
                  )}
                </IconTile>

                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <EyebrowLabel>{t('moduleN', { n: entry.module.order })}</EyebrowLabel>
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-fy-muted">
                      <Icon name="schedule" size={12} />
                      {t('minutesShort', { mins: entry.module.durationMinutes })}
                    </span>
                  </div>
                  <Body className="font-semibold">{entry.module.title}</Body>
                  <MutedText>{entry.module.description}</MutedText>
                </div>

                <StatusPill tone={completed ? 'lime' : locked ? 'neutral' : 'slate'} className="shrink-0">
                  {statusLabel(entry.status)}
                </StatusPill>
              </div>

              {isExpanded && !locked && (
                <div className="rounded-cell bg-fy-well p-4 font-body text-body text-fy-ink-soft whitespace-pre-wrap leading-relaxed">
                  {entry.module.content}
                </div>
              )}

              {!locked && !completed && (
                <>
                  <Divider />
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : entry.module._id)}
                      className="font-mono text-[10px] uppercase tracking-wider text-fy-muted hover:text-fy-ink transition-colors"
                    >
                      {isExpanded ? t('hideLesson') : t('readLesson')}
                    </button>
                    <Button
                      size="md"
                      variant={accent === 'secondary' ? 'green' : 'brown'}
                      disabled={completingId === entry.module._id}
                      onClick={() => handleComplete(entry.module._id)}
                    >
                      {completingId === entry.module._id ? t('saving') : t('markComplete')}
                    </Button>
                  </div>
                </>
              )}

              {locked && (
                <>
                  <Divider />
                  <MutedText>{t('unlockHint')}</MutedText>
                </>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
