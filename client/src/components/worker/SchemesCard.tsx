'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';

interface Plan {
  code: 'pmsby' | 'pmjjby';
  premiumAnnual: number | null;
  premiumKnown: boolean;
  sourceUrl?: string;
}
interface Enrolment {
  _id: string;
  scheme: 'pmsby' | 'pmjjby';
  status: 'recorded' | 'confirmed_by_bank' | 'lapsed';
  bankReference?: string;
  renewalDate?: string;
  renewalHold?: { reason: 'premium_not_set' | 'pool_insufficient' | 'no_district' };
  memberId?: string;
}

const input = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm';
const link = 'self-start text-xs font-semibold text-fy-green hover:underline disabled:opacity-50';

/**
 * PMSBY / PMJJBY: a record of enrolment made through the member's own bank.
 * With `memberId` a society leader records it for a member who has no phone.
 * The premium is shown only when an admin has set it with a source; until then
 * the card says renewals are on hold rather than showing a number.
 */
export function SchemesCard({ memberId, memberName }: { memberId?: string; memberName?: string }) {
  const t = useTranslations('schemes');
  const locale = useLocale();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [mine, setMine] = useState<Enrolment[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ bankName: '', accountLast4: '', nomineeName: '', nomineeRelation: '', consent: false });
  const [refFor, setRefFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([
        api.get<{ plans: Plan[] }>('/api/schemes'),
        memberId ? api.get<{ enrolments: Enrolment[] }>('/api/schemes/society') : api.get<{ enrolments: Enrolment[] }>('/api/schemes/mine'),
      ]);
      setPlans(p.plans);
      setMine(memberId ? e.enrolments.filter((x) => x.memberId === memberId) : e.enrolments);
    } catch {
      setPlans(null);
    }
  }, [memberId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(null);
      setForm({ bankName: '', accountLast4: '', nomineeName: '', nomineeRelation: '', consent: false });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!plans) return null;
  return (
    <div className="mt-3 rounded-control border border-fy-muted/20 px-3 py-2.5 flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold text-fy-brown">{t('title')}</p>
        <p className="text-xs font-semibold text-fy-ink">{t('label')}</p>
        <p className="text-xs text-fy-muted">{t('intro')}</p>
      </div>
      {plans.map((p) => {
        const e = mine.find((x) => x.scheme === p.code && x.status !== 'lapsed');
        return (
          <div key={p.code} className="flex flex-col gap-1.5 border-t border-fy-muted/10 pt-2">
            <p className="text-sm font-medium text-fy-ink">{t(p.code)}</p>
            <p className="text-xs text-fy-muted">
              {p.premiumKnown ? t('premium', { amount: p.premiumAnnual ?? 0, source: p.sourceUrl ?? '' }) : t('premiumUnknown')}
            </p>
            {e ? (
              <>
                <p className="text-xs text-fy-ink">
                  {e.status === 'confirmed_by_bank'
                    ? t('statusConfirmed', { ref: e.bankReference ?? '', date: e.renewalDate ? new Date(e.renewalDate).toLocaleDateString(locale) : '' })
                    : t('statusRecorded')}
                </p>
                {e.renewalHold && <p className="text-xs text-fy-brown">{t(`hold_${e.renewalHold.reason}`)}</p>}
                {e.status === 'recorded' && (
                  <>
                    <input
                      className={input}
                      value={refFor[e._id] ?? ''}
                      onChange={(ev) => setRefFor((r) => ({ ...r, [e._id]: ev.target.value }))}
                      placeholder={t('bankRef')}
                      aria-label={t('bankRef')}
                      maxLength={60}
                    />
                    <button
                      type="button"
                      className={link}
                      disabled={busy || (refFor[e._id] ?? '').trim().length < 3}
                      onClick={() => void run(() => api.post(`/api/schemes/enrolments/${e._id}/bank-confirmation`, { bankReference: refFor[e._id] }))}
                    >
                      {t('confirm')}
                    </button>
                  </>
                )}
              </>
            ) : open === p.code ? (
              <div className="flex flex-col gap-1.5">
                <input className={input} placeholder={t('bank')} aria-label={t('bank')} value={form.bankName} onChange={(ev) => setForm({ ...form, bankName: ev.target.value })} maxLength={100} />
                <input className={input} inputMode="numeric" maxLength={4} placeholder={t('last4')} aria-label={t('last4')} value={form.accountLast4} onChange={(ev) => setForm({ ...form, accountLast4: ev.target.value.replace(/\D/g, '') })} />
                <input className={input} placeholder={t('nomineeName')} aria-label={t('nomineeName')} value={form.nomineeName} onChange={(ev) => setForm({ ...form, nomineeName: ev.target.value })} maxLength={100} />
                <input className={input} placeholder={t('nomineeRelation')} aria-label={t('nomineeRelation')} value={form.nomineeRelation} onChange={(ev) => setForm({ ...form, nomineeRelation: ev.target.value })} maxLength={40} />
                <label className="flex items-start gap-2 text-xs text-fy-ink">
                  <input type="checkbox" checked={form.consent} onChange={(ev) => setForm({ ...form, consent: ev.target.checked })} className="mt-0.5" />
                  {memberId ? t('consentOnBehalf', { name: memberName ?? '' }) : t('consent')}
                </label>
                <button
                  type="button"
                  className={link}
                  disabled={busy || !form.consent || form.bankName.trim().length < 2 || form.nomineeName.trim().length < 2 || form.nomineeRelation.trim().length < 2 || (form.accountLast4.length > 0 && form.accountLast4.length !== 4)}
                  onClick={() =>
                    void run(() =>
                      api.post(`/api/schemes/${p.code}/enrol`, {
                        ...(memberId ? { memberId } : {}),
                        bankName: form.bankName.trim(),
                        ...(form.accountLast4 ? { accountLast4: form.accountLast4 } : {}),
                        nominee: { name: form.nomineeName.trim(), relation: form.nomineeRelation.trim() },
                        consent: form.consent,
                      })
                    )
                  }
                >
                  {t('enrol')}
                </button>
              </div>
            ) : (
              <button type="button" className={link} onClick={() => setOpen(p.code)}>
                {t('enrol')}
              </button>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
    </div>
  );
}
