'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';

const TYPES = ['school', 'college', 'hospital', 'hostel', 'office', 'apartment_association', 'factory', 'warehouse', 'other'] as const;

interface Me {
  user: { accountType?: 'household' | 'institution'; institutionProfile?: { institutionType: string; orgName: string; gstin?: string } };
}

/**
 * P1.6 — a customer can register as an institution (school, hostel,
 * office…) to hold standing contracts with societies. GSTIN is optional and
 * prints on the monthly invoice when given.
 */
export function InstitutionSection() {
  const t = useTranslations('contracts.institution');
  const [loaded, setLoaded] = useState(false);
  const [isInstitution, setIsInstitution] = useState(false);
  const [institutionType, setInstitutionType] = useState<string>('school');
  const [orgName, setOrgName] = useState('');
  const [gstin, setGstin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Me>('/api/auth/me')
      .then((res) => {
        setIsInstitution(res.user.accountType === 'institution');
        if (res.user.institutionProfile) {
          setInstitutionType(res.user.institutionProfile.institutionType);
          setOrgName(res.user.institutionProfile.orgName);
          setGstin(res.user.institutionProfile.gstin ?? '');
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save(next: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api.put('/api/contracts/institution-profile', next
        ? { accountType: 'institution', institutionType, orgName: orgName.trim(), gstin: gstin.trim() }
        : { accountType: 'household' });
      setIsInstitution(next);
      setMessage(t('saved'));
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <Panel className="flex flex-col gap-3">
      <EyebrowLabel>{t('title')}</EyebrowLabel>
      <Body size="label">{t('explainer')}</Body>
      <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
        {t('type')}
        <select
          value={institutionType}
          onChange={(e) => setInstitutionType(e.target.value)}
          className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink"
        >
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`types.${ty}`)}
            </option>
          ))}
        </select>
      </label>
      <Field value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t('orgName')} aria-label={t('orgName')} />
      <Field value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder={t('gstin')} aria-label={t('gstin')} />
      <div className="flex flex-wrap gap-2">
        <Button size="md" disabled={busy || orgName.trim().length < 2} onClick={() => save(true)}>
          {isInstitution ? t('update') : t('become')}
        </Button>
        {isInstitution && (
          <Button size="md" variant="ghost" disabled={busy} onClick={() => save(false)}>
            {t('backToHousehold')}
          </Button>
        )}
      </div>
      {message && <Body size="label">{message}</Body>}
      {isInstitution && (
        <Link href="/customer/contracts" className="font-body text-label font-semibold text-fy-green underline">
          {t('openContracts')}
        </Link>
      )}
    </Panel>
  );
}
