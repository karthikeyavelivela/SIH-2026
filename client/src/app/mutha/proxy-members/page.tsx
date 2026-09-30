'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TopBar } from '@/components/fy/Navigation';
import { Panel, LightCard } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Field } from '@/components/fy/Controls';

interface ProxyMember {
  _id: string;
  name: string;
  kycStatus: string;
  kycDocs: { _id: string; type: string; status: string }[];
  availabilityStatus: string;
  hasPayout: boolean;
  payoutConsentAt?: string;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * P1.7 — members with no phone, run by their leader: KYC (still reviewed),
 * availability, payout details with the member's consent, their own
 * earnings, and a one-time code for when they get a phone.
 */
export default function ProxyMembersPage() {
  const t = useTranslations('proxyMembers');
  const router = useRouter();
  const { data, reload } = usePolling(() => api.get<{ members: ProxyMember[] }>('/api/proxy-members'), 20000);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/proxy-members', { name: name.trim() });
      setName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto flex flex-col gap-3">
        <Body size="label">{t('explainer')}</Body>
        <Panel className="flex flex-col gap-2">
          <EyebrowLabel>{t('addTitle')}</EyebrowLabel>
          <Field value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} aria-label={t('namePlaceholder')} />
          <Button size="md" disabled={busy || name.trim().length < 2} onClick={add}>
            {t('add')}
          </Button>
          {error && <Body size="label">{error}</Body>}
        </Panel>
        {!data ? (
          <div className="h-32 rounded-card bg-fy-panel animate-pulse" />
        ) : data.members.length === 0 ? (
          <LightCard>
            <Body size="label">{t('none')}</Body>
          </LightCard>
        ) : (
          data.members.map((m) => <MemberCard key={m._id} member={m} onChanged={reload} />)
        )}
      </main>
    </div>
  );
}

function MemberCard({ member, onChanged }: { member: ProxyMember; onChanged: () => Promise<unknown> }) {
  const t = useTranslations('proxyMembers');
  const [open, setOpen] = useState<'none' | 'payout' | 'earnings'>('none');
  const [message, setMessage] = useState<string | null>(null);
  const [claim, setClaim] = useState<{ code: string; expiresAt: string } | null>(null);
  const [earnings, setEarnings] = useState<{ total: number; jobs: number } | null>(null);
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [consent, setConsent] = useState(false);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
      await onChanged();
    } catch (err) {
      setMessage(err instanceof ApiClientError ? err.message : t('failed'));
    }
  }

  async function upload(type: 'aadhaar' | 'pan', file: File) {
    await run(async () => {
      await api.post(`/api/proxy-members/${member._id}/kyc`, { type, fileBase64: await readAsBase64(file) });
    }, t('uploaded'));
  }

  function goOnline() {
    if (!navigator.geolocation) return setMessage(t('noLocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        run(() =>
          api.patch(`/api/proxy-members/${member._id}/availability`, {
            status: 'online',
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          })
        ),
      () => setMessage(t('noLocation'))
    );
  }

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-body font-semibold text-fy-ink truncate">{member.name}</p>
          <Body size="label">{t('noPhone')}</Body>
        </div>
        <StatusPill tone={member.availabilityStatus === 'online' ? 'lime' : 'outline'}>
          {member.availabilityStatus === 'online' ? t('online') : t('offline')}
        </StatusPill>
      </div>
      <Body size="label">
        {t('kyc', { status: member.kycStatus })} · {member.kycDocs.map((d) => `${d.type}: ${d.status}`).join(', ') || t('noDocs')}
      </Body>

      <div className="flex flex-wrap gap-2">
        {(['aadhaar', 'pan'] as const).map((type) => (
          <label key={type} className="cursor-pointer rounded-control border border-fy-muted/20 px-3 py-1.5 text-xs font-semibold text-fy-ink">
            {t(type === 'aadhaar' ? 'uploadAadhaar' : 'uploadPan')}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(type, e.target.files[0])} />
          </label>
        ))}
        {member.availabilityStatus === 'online' ? (
          <Button size="md" variant="light" onClick={() => run(() => api.patch(`/api/proxy-members/${member._id}/availability`, { status: 'offline' }))}>
            {t('setOffline')}
          </Button>
        ) : (
          <Button size="md" variant="light" onClick={goOnline}>
            {t('setOnline')}
          </Button>
        )}
        <Button size="md" variant="ghost" onClick={() => setOpen(open === 'payout' ? 'none' : 'payout')}>
          {member.hasPayout ? t('changePayout') : t('addPayout')}
        </Button>
        <Button
          size="md"
          variant="ghost"
          onClick={async () => {
            setOpen('earnings');
            setEarnings(await api.get(`/api/proxy-members/${member._id}/earnings`));
          }}
        >
          {t('earnings')}
        </Button>
        <Button size="md" variant="ghost" onClick={async () => setClaim(await api.post(`/api/proxy-members/${member._id}/claim-code`))}>
          {t('claimCode')}
        </Button>
      </div>

      {open === 'payout' && (
        <LightCard className="flex flex-col gap-2">
          <select value={method} onChange={(e) => setMethod(e.target.value as 'upi' | 'bank')} className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm">
            <option value="upi">UPI</option>
            <option value="bank">{t('bank')}</option>
          </select>
          {method === 'upi' ? (
            <Field value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@bank" aria-label="UPI" />
          ) : (
            <>
              <Field value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t('accountNumber')} aria-label={t('accountNumber')} />
              <Field value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="IFSC" aria-label="IFSC" />
            </>
          )}
          <label className="flex items-start gap-2 text-xs text-fy-ink">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            {t('consent', { name: member.name })}
          </label>
          <Button
            size="md"
            disabled={!consent}
            onClick={() =>
              run(
                () =>
                  api.put(`/api/proxy-members/${member._id}/payout`, {
                    method,
                    accountHolderName: member.name,
                    upiId: method === 'upi' ? upiId.trim() : undefined,
                    bankAccountNumber: method === 'bank' ? account.trim() : undefined,
                    ifsc: method === 'bank' ? ifsc.trim() : undefined,
                    consent,
                  }),
                t('payoutSaved')
              )
            }
          >
            {t('savePayout')}
          </Button>
        </LightCard>
      )}
      {open === 'earnings' && earnings && <Body size="label">{t('earningsLine', { total: earnings.total, jobs: earnings.jobs })}</Body>}
      {claim && (
        <LightCard>
          <Body size="label">{t('claimCodeShown', { code: claim.code, date: claim.expiresAt.slice(0, 10) })}</Body>
        </LightCard>
      )}
      {message && <Body size="label">{message}</Body>}
    </Panel>
  );
}
