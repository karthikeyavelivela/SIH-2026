'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';

export interface StatutoryFloor {
  state: string;
  zone: string;
  skillBand: 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled';
  monthlyRate: number;
  dailyRate: number;
  hourlyRate: number;
  workingDaysPerMonth: number;
  workingHoursPerDay: number;
  notificationNumber: string;
  scheduledEmployment: string;
  sourceType: 'gazette' | 'department_website' | 'secondary_compilation';
  notificationDate?: string;
  sourceUrl?: string;
  /** The notification's end date has passed; the last notified rate is still enforced. */
  stale?: boolean;
  /** The server's one-line citation, when it sent one. */
  source?: string;
}

/**
 * The line on a customer's price breakdown that makes "fair wage" checkable.
 *
 * Two things here are deliberate and both are about not overclaiming.
 *
 * The derivation is printed, not just the conclusion. The government
 * publishes a MONTHLY figure; the hourly floor this platform enforces is
 * ours, arrived at by dividing by a working month and a working day. A
 * customer — or a labour inspector, or the worker — should be able to see
 * that arithmetic rather than take an hourly number on trust.
 *
 * And it says which rates the check actually covers. A per-unit or
 * per-task price has no measured duration behind it, so no honest hourly
 * comparison exists for it. Letting the badge imply otherwise would be the
 * exact kind of unearned reassurance this feature is supposed to replace.
 */
export function StatutoryFloorNote({ floor, expandable = true }: { floor: StatutoryFloor; expandable?: boolean }) {
  const t = useTranslations('wageFloor');

  return (
    <div className="rounded-control bg-fy-lime-tint-1 border border-fy-lime/50 px-3 py-2.5 flex flex-col gap-1.5">
      {floor.stale && (
        <span role="status" className="self-start rounded-full bg-fy-brown/10 px-2 py-0.5 font-body text-[11px] font-semibold text-fy-brown">
          {t('staleBanner')}
        </span>
      )}
      <span className="flex items-start gap-2">
        <Icon name="gavel" size={15} className="text-fy-green shrink-0 mt-px" />
        <span className="font-body text-label text-fy-ink">
          {t('customerLine', { state: floor.state, notification: floor.notificationNumber })}
        </span>
      </span>

      {expandable && (
        <span className="pl-[23px] flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-fy-ink-soft">
            {t('working', {
              monthly: floor.monthlyRate.toLocaleString('en-IN'),
              days: floor.workingDaysPerMonth,
              hours: floor.workingHoursPerDay,
              hourly: floor.hourlyRate,
            })}
          </span>
          <span className="font-mono text-[10px] text-fy-muted">
            {t('band', { band: t(`bands.${floor.skillBand}`) })} · {floor.scheduledEmployment}
          </span>
          <span className="font-mono text-[10px] text-fy-muted">{t('hourlyOnlyNote')}</span>
          {/* A figure read out of the gazette and one transcribed from a
              compliance vendor's summary are not the same kind of fact, and
              the screen says which one it is standing on. */}
          <span className="font-mono text-[10px] text-fy-muted">
            {floor.sourceType === 'gazette' ? t('sourceGazette') : t('sourceSecondary')}
          </span>
          {floor.notificationDate && (
            <span className="font-mono text-[10px] text-fy-muted">
              {t('notifiedOn', {
                notification: floor.notificationNumber,
                date: new Date(floor.notificationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
              })}
            </span>
          )}
          {floor.sourceUrl && (
            <a
              href={floor.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-fy-brown underline underline-offset-2 break-all"
            >
              {t('sourceLink')}
            </a>
          )}
        </span>
      )}
    </div>
  );
}
