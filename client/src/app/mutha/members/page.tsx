'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MuthaResponse } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { DataList, DataRow } from '@/components/fy/Data';
import { Button, Chip, ChipRow, SearchField } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/society_members.html.

   Section order there, top to bottom: 64px brand bar -> "Collective ledger"
   eyebrow with an active-seal count -> "Society Member Roster" heading and
   blurb -> the self-federating onboarding card carrying the invite code and
   its copy/share actions -> a search field -> filter chips with live counts
   (All / Active on job / Standby ready / Resting) -> the roster.

   Largest element: the heading, then the invite code. Dark surfaces: none.
   Green is the society accent.

   The design's "Share QR" opens a QR of the invite code. That is real —
   the code is a real join secret — so the action shares the code itself
   through the device's own share sheet, falling back to copy where the
   Web Share API is unavailable. */

type Filter = 'all' | 'on_job' | 'online' | 'offline';

export default function MuthaMembersPage() {
  const t = useTranslations('muthaMembers');
  const { data, reload } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const [toRemove, setToRemove] = useState<{ _id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);

  const members = useMemo(() => data?.members ?? [], [data]);

  const counts = useMemo(() => {
    return {
      all: members.length,
      on_job: members.filter((m) => m.availabilityStatus === 'on_job').length,
      online: members.filter((m) => m.availabilityStatus === 'online').length,
      offline: members.filter((m) => m.availabilityStatus === 'offline').length,
    } as Record<Filter, number>;
  }, [members]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => filter === 'all' || m.availabilityStatus === filter)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.phone.includes(q));
  }, [members, filter, query]);

  async function confirmRemove() {
    if (!toRemove) return;
    setPending(true);
    setError(null);
    try {
      await api.delete(`/api/mutha/members/${toRemove._id}`);
      setToRemove(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorRemove'));
    } finally {
      setPending(false);
    }
  }

  async function shareCode() {
    const code = data?.mutha.inviteCode;
    if (!code) return;
    const text = t('shareText', { code });
    try {
      if (navigator.share) {
        await navigator.share({ title: t('shareTitle'), text });
        return;
      }
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Share sheet dismissed, or the clipboard is blocked — the code is on
      // screen and selectable either way.
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Society"
        title={t('title')}
        actions={
          <Link
            href="/mutha/create-group"
            className="font-body text-label font-semibold text-fy-green hover:underline"
          >
            {t('groupSettings')}
          </Link>
        }
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone="green">{t('registerEyebrow', { count: members.length })}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('rosterHeading')}</h2>
          <Body className="mt-1.5">{t('rosterBlurb')}</Body>
        </div>

        {data && (
          <Panel className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <IconTile tone="lime" size="md">
                <Icon name="qr_code_2" size={20} />
              </IconTile>
              <div className="min-w-0">
                <EyebrowLabel tone="green">{t('portalEyebrow')}</EyebrowLabel>
                <Body size="label">{t('selfJoinHint')}</Body>
              </div>
            </div>
            <Divider />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <EyebrowLabel>{t('yourInviteCode')}</EyebrowLabel>
                <p className="font-heading text-heading text-fy-green tracking-[0.12em]">{data.mutha.inviteCode}</p>
              </div>
              <Button
                type="button"
                variant="green"
                size="md"
                glyph={copied ? 'check' : 'share'}
                onClick={shareCode}
                className="shrink-0"
              >
                {copied ? t('copied') : t('shareCode')}
              </Button>
            </div>
          </Panel>
        )}

        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          trailingGlyph={query ? 'cancel' : undefined}
          onTrailingClick={() => setQuery('')}
        />

        <ChipRow>
          {(['all', 'on_job', 'online', 'offline'] as Filter[]).map((f) => (
            <Chip key={f} type="button" shape="round" accent="lime" active={filter === f} onClick={() => setFilter(f)}>
              {t(`filters.${f}`)} ({counts[f]})
            </Chip>
          ))}
        </ChipRow>

        {members.length === 0 ? (
          <LightCard>
            <EmptyState title={t('noMembersYet')} description={t('noMembersYetDesc')} />
          </LightCard>
        ) : visible.length === 0 ? (
          <LightCard>
            <Body size="label">{t('noMatches')}</Body>
          </LightCard>
        ) : (
          <Section title={<SectionHeading>{t('rosterSection')}</SectionHeading>}>
            <Panel className="py-0">
              <DataList>
                {visible.map((m) => (
                  <DataRow
                    key={m._id}
                    lead={<Avatar name={m.name} photoUrl={m.profilePhoto} accent="secondary" status={m.availabilityStatus} />}
                    title={m.name}
                    meta={m.phone}
                    trailing={
                      <div className="flex items-center gap-2">
                        <StatusPill tone={m.availabilityStatus === 'online' ? 'lime' : m.availabilityStatus === 'on_job' ? 'neutral' : 'outline'}>
                          {t(`status.${m.availabilityStatus}`)}
                        </StatusPill>
                        <button
                          type="button"
                          onClick={() => setToRemove({ _id: m._id, name: m.name })}
                          className="font-body text-label font-semibold text-fy-error hover:underline"
                        >
                          {t('remove')}
                        </button>
                      </div>
                    }
                  />
                ))}
              </DataList>
            </Panel>
          </Section>
        )}
      </main>

      <Modal open={!!toRemove} onClose={() => setToRemove(null)} title={t('removeMemberTitle')}>
        <Body size="label" className="mb-5">
          {t('removeMemberBody', { name: toRemove?.name ?? '' })}
        </Body>
        {error && (
          <div role="alert" className="mb-4 rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setToRemove(null)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button variant="slate" className="flex-1 bg-fy-error" onClick={confirmRemove} disabled={pending}>
            {pending ? t('removing') : t('remove')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
