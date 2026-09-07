'use client';

import { useState } from 'react';
import { DarkCard, LightCard, Panel, Divider } from '@/components/fy/Surfaces';
import { EyebrowLabel, DisplayHeading, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill, VerifiedBadge, TierBadge } from '@/components/fy/Status';
import { MetricBlock, StatRow, DataList, DataRow, ProgressBar } from '@/components/fy/Data';
import {
  Button, Chip, ChipRow, ScrollRow, Stepper, Toggle, Slider, SearchField, Field, SelectCard,
} from '@/components/fy/Controls';
import { PhotoCard, CircularPortrait, PhotoStrip } from '@/components/fy/Media';
import { TopBar, TabRow, BottomTabBar } from '@/components/fy/Navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionDeniedState } from '@/components/ui/PermissionDeniedState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';

const SWATCHES: { group: string; items: { name: string; varName: string }[] }[] = [
  {
    group: 'Surfaces',
    items: [
      { name: 'bone', varName: '--fy-bone' },
      { name: 'panel', varName: '--fy-panel' },
      { name: 'field', varName: '--fy-field' },
      { name: 'well', varName: '--fy-well' },
      { name: 'edge', varName: '--fy-edge' },
      { name: 'card', varName: '--fy-card' },
      { name: 'dim', varName: '--fy-dim' },
    ],
  },
  {
    group: 'Ink',
    items: [
      { name: 'ink', varName: '--fy-ink' },
      { name: 'ink-soft', varName: '--fy-ink-soft' },
      { name: 'muted', varName: '--fy-muted' },
      { name: 'hairline', varName: '--fy-hairline' },
    ],
  },
  {
    group: 'Household — brown',
    items: [
      { name: 'brown', varName: '--fy-brown' },
      { name: 'brown-soft', varName: '--fy-brown-soft' },
      { name: 'on-brown-soft', varName: '--fy-on-brown-soft' },
    ],
  },
  {
    group: 'Labour — green + lime',
    items: [
      { name: 'green', varName: '--fy-green' },
      { name: 'lime', varName: '--fy-lime' },
      { name: 'lime-dim', varName: '--fy-lime-dim' },
      { name: 'lime-tint-1', varName: '--fy-lime-tint-1' },
      { name: 'lime-tint-2', varName: '--fy-lime-tint-2' },
      { name: 'lime-tint-3', varName: '--fy-lime-tint-3' },
    ],
  },
  {
    group: 'Transit — slate',
    items: [
      { name: 'slate', varName: '--fy-slate' },
      { name: 'slate-soft', varName: '--fy-slate-soft' },
      { name: 'slate-pale', varName: '--fy-slate-pale' },
    ],
  },
  {
    group: 'Status',
    items: [
      { name: 'error', varName: '--fy-error' },
      { name: 'error-bg', varName: '--fy-error-bg' },
      { name: 'peach', varName: '--fy-peach' },
      { name: 'inverse', varName: '--fy-inverse' },
    ],
  },
];

/** Each block names the screenshot its anatomy was read from. */
function Block({ title, from, children }: { title: string; from: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <SectionHeading>{title}</SectionHeading>
        <MutedText className="font-mono">{from}</MutedText>
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  const [tab, setTab] = useState('status');
  const [pillTab, setPillTab] = useState('affiliation');
  const [crew, setCrew] = useState(4);
  const [tonnes, setTonnes] = useState(340);
  const [on, setOn] = useState(true);
  const [chips, setChips] = useState<string[]>(['cement']);
  const [scale, setScale] = useState('standard');
  const [q, setQ] = useState('');
  const toast = useToast();

  const toggleChip = (k: string) =>
    setChips((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />
      <TopBar
        eyebrow="FYRO Cooperative"
        title="Styleguide"
        actions={<StatusPill tone="lime">measured</StatusPill>}
      />

      <main className="relative z-10 pt-16 pb-28 px-gutter max-w-2xl mx-auto">
        <div className="py-6">
          <EyebrowLabel>Design system</EyebrowLabel>
          <DisplayHeading className="mt-1">
            Components,
            <br />
            read from pixels
          </DisplayHeading>
          <Body size="body-lg" className="mt-2">
            Every value below is sampled from the screenshots in design-reference/. Each block
            names the screen its anatomy came from.
          </Body>
        </div>

        <Block title="Colour" from="all 10 screens">
          <div className="flex flex-col gap-4">
            {SWATCHES.map((g) => (
              <div key={g.group}>
                <EyebrowLabel>{g.group}</EyebrowLabel>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {g.items.map((s) => (
                    <div key={s.varName} className="rounded-cell overflow-hidden border border-fy-hairline/50">
                      <div className="h-12" style={{ background: `var(${s.varName})` }} />
                      <div className="bg-fy-card px-2 py-1.5">
                        <div className="font-body text-[10px] font-semibold text-fy-ink">{s.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Type" from="login, worker_dashboard_online">
          <div className="flex flex-col gap-4">
            <div>
              <MutedText className="font-mono">display · 44px · serif</MutedText>
              <DisplayHeading>Member Ledger Access</DisplayHeading>
            </div>
            <div>
              <MutedText className="font-mono">heading · 32px · serif</MutedText>
              <h2 className="font-heading text-heading text-fy-ink">Society Governance</h2>
            </div>
            <div>
              <MutedText className="font-mono">title · 22px · serif</MutedText>
              <SectionHeading>Queue Dispatch Standby</SectionHeading>
            </div>
            <div>
              <MutedText className="font-mono">metric · 56px · serif</MutedText>
              <div className="font-heading text-metric text-fy-green tabular-nums">₹2,840</div>
            </div>
            <div>
              <MutedText className="font-mono">body-lg / body / label · sans</MutedText>
              <Body size="body-lg">Direct access to member passbook, mandis, and dispatch allocations.</Body>
              <Body>Active agricultural transit corridor covering inter-hub vegetable freight.</Body>
              <Body size="label">4.98 shift rating · 6 trips completed</Body>
            </div>
            <div>
              <MutedText className="font-mono">eyebrow · 11px · 600 · +0.08em</MutedText>
              <div>
                <EyebrowLabel>Authentication Protocol</EyebrowLabel>
              </div>
            </div>
          </div>
        </Block>

        <Block title="Surfaces" from="household_home, society_governance, worker_dashboard_online">
          <div className="flex flex-col gap-3">
            <LightCard>
              <EyebrowLabel>Light card</EyebrowLabel>
              <Body className="mt-1">The default content surface — #F7F3EA, 16px radius, no border.</Body>
            </LightCard>
            <Panel>
              <EyebrowLabel>Panel (white)</EyebrowLabel>
              <Body className="mt-1">Record and form cards — login, registration, profile rows.</Body>
            </Panel>
            <DarkCard>
              <EyebrowLabel tone="lime">Union Co-pilot · 24/7 AI Desk</EyebrowLabel>
              <SectionHeading tone="on-dark" className="mt-1">Ask Union Co-pilot</SectionHeading>
              <p className="font-body text-label text-fy-on-brown-soft mt-1">
                Instant fare rules, diesel indices and rest-stop guidance.
              </p>
            </DarkCard>
            <DarkCard accent="slate">
              <EyebrowLabel tone="lime">Transit dispatch</EyebrowLabel>
              <SectionHeading tone="on-dark" className="mt-1">Multiple coordinated vehicles</SectionHeading>
            </DarkCard>
          </div>
        </Block>

        <Block title="Status" from="login, household_home, admin_overview, society_governance">
          <ChipRow>
            <StatusPill tone="lime">Secure gate</StatusPill>
            <StatusPill tone="lime" dot>Chartered active</StatusPill>
            <StatusPill tone="neutral">Tier 1</StatusPill>
            <StatusPill tone="critical">4 SLA breaches</StatusPill>
            <StatusPill tone="brown">Most booked</StatusPill>
            <StatusPill tone="slate">Heavy log</StatusPill>
            <StatusPill tone="outline">Domestic</StatusPill>
          </ChipRow>
          <div className="flex items-center gap-3 mt-3">
            <VerifiedBadge />
            <TierBadge>Audit Grade AAA</TierBadge>
          </div>
        </Block>

        <Block title="Data" from="worker_dashboard_online, live_tracking_1, admin_overview">
          <div className="flex flex-col gap-3">
            <LightCard>
              <MetricBlock
                label="Today's certified ledger"
                value="₹2,840"
                tone="lime"
                note="6 trips completed · 100% direct passbook credit"
                aside={<StatusPill tone="brown">Instant audit</StatusPill>}
              />
            </LightCard>
            <Panel>
              <MetricBlock
                label="Estimated travel duration"
                value="14"
                unit="mins"
                note="Estimated arrival at 02:45 PM"
                aside={
                  <div className="bg-fy-lime rounded-cell px-3 py-2 text-center">
                    <div className="font-heading text-title text-fy-on-lime leading-none">2.8</div>
                    <div className="font-body text-eyebrow uppercase text-fy-green">km left</div>
                  </div>
                }
              />
            </Panel>
            <LightCard>
              <div className="grid grid-cols-2 gap-3">
                <StatRow label="Federation status" value="Chartered Active" valueTone="green" />
                <StatRow label="State Reg. No." value="AP-GNT-2021-0482" />
              </div>
              <Divider className="my-3" />
              <DataList>
                <DataRow
                  lead={
                    <span className="w-9 h-9 rounded-full bg-fy-brown-soft text-fy-on-brown flex items-center justify-center font-body text-label font-semibold">
                      RD
                    </span>
                  }
                  title="Rameshwar Dash"
                  meta="President & Chief Custodian"
                  trailing={<span className="font-body text-label text-fy-green">Term &rsquo;26</span>}
                />
                <DataRow
                  lead={
                    <span className="w-9 h-9 rounded-full bg-fy-slate text-fy-on-slate flex items-center justify-center font-body text-label font-semibold">
                      PK
                    </span>
                  }
                  title="Pooja Kalyani"
                  meta="Welfare Auditor"
                  trailing={<span className="font-body text-label text-fy-green">Term &rsquo;25</span>}
                />
              </DataList>
              <ProgressBar value={64} className="mt-3" />
            </LightCard>
          </div>
        </Block>

        <Block title="Controls" from="login, hamali_labour_standard, goods_transport">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button glyph="key" onClick={() => toast.show('Primary')}>Authorize</Button>
              <Button variant="green" glyph="group_add">Continue</Button>
              <Button variant="slate" glyph="fact_check">Review fleet</Button>
              <Button variant="lime" glyph="call">Call directly</Button>
              <Button variant="light" glyph="fingerprint">Biometric</Button>
              <Button variant="ghost" glyph="sms">SMS OTP</Button>
            </div>

            <SearchField
              placeholder="Search by artisan, trade, or booking ref..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              trailingGlyph="tune"
            />
            <Field placeholder="98765 43210" />

            <ChipRow>
              {[
                ['cement', 'Cement bags', 'inventory_2'],
                ['steel', 'Steel rods', 'reorder'],
                ['produce', 'Agricultural produce', 'agriculture'],
                ['fragile', 'Fragile goods', 'wine_bar'],
              ].map(([k, label, glyph]) => (
                <Chip key={k} glyph={glyph} active={chips.includes(k)} onClick={() => toggleChip(k)}>
                  {label}
                </Chip>
              ))}
            </ChipRow>

            <ScrollRow>
              <Chip shape="round" glyph="history" active>Mandi Yard 3</Chip>
              <Chip shape="round" glyph="warehouse">Kankipadu Cold Storage</Chip>
              <Chip shape="round" glyph="domain">Bhavanipuram Hub</Chip>
            </ScrollRow>

            <SelectCard
              selected={scale === 'standard'}
              onClick={() => setScale('standard')}
              glyph="swap_driving_apps_wheel"
              title="Standard load"
              description="Under 100 tonnes · book a crew directly"
              badge={<StatusPill tone="lime">Active</StatusPill>}
            />
            <SelectCard
              selected={scale === 'bulk'}
              onClick={() => setScale('bulk')}
              glyph="forklift"
              title="Bulk consignment"
              description="Over 100 tonnes · multiple societies dispatched"
            />

            <LightCard>
              <div className="text-center">
                <EyebrowLabel>Crew size</EyebrowLabel>
              </div>
              <Stepper value={crew} onChange={setCrew} label="Certified porters" className="mt-2" />
            </LightCard>

            <LightCard>
              <div className="flex items-center justify-between mb-2">
                <EyebrowLabel>Consignment volume</EyebrowLabel>
                <span className="font-heading text-title text-fy-brown tabular-nums">{tonnes} t</span>
              </div>
              <Slider min={100} max={2000} step={10} value={tonnes} onChange={(e) => setTonnes(Number(e.target.value))} />
            </LightCard>

            <div className="flex items-center justify-between bg-fy-lime rounded-card p-4">
              <div className="min-w-0">
                <div className="font-body text-body font-semibold text-fy-on-lime">Add loading workers?</div>
                <div className="font-body text-label text-fy-green">4-person crew at origin &amp; destination</div>
              </div>
              <Toggle checked={on} onChange={setOn} label="Add loading workers" />
            </div>
          </div>
        </Block>

        <Block title="Media" from="household_home, hamali_labour_standard, live_tracking_1">
          <div className="flex flex-col gap-3">
            <PhotoCard
              id="household.category.electrician"
              alt="Electrician wiring a switchboard"
              height="hero"
              topRight={<StatusPill tone="lime">Most booked</StatusPill>}
              overlay={
                <>
                  <EyebrowLabel tone="lime">Electrician Union #04</EyebrowLabel>
                  <div className="font-heading text-title text-fy-bone mt-0.5">Switchboard &amp; Power Wiring</div>
                  <div className="font-body text-label text-fy-on-brown-soft">Standard &amp; heavy load inspection</div>
                </>
              }
            />
            <PhotoStrip
              id="labour.crew.loading"
              alt="Loading crew at a mandi yard"
              caption={
                <>
                  <span className="font-body text-label flex items-center gap-1.5">
                    <Icon name="verified" size={16} className="text-fy-lime" />
                    Cooperative verified union labor · Insured
                  </span>
                  <span className="font-heading text-label text-fy-lime">4.9 ★</span>
                </>
              }
            />
            <div className="flex gap-4">
              {['G. Anand Rao', 'Kavitha Reddy'].map((n) => (
                <div key={n} className="flex flex-col items-center gap-1.5">
                  <CircularPortrait id={`worker.portrait.${n}`} alt={n} size={64} badge={<VerifiedBadge size={18} />} />
                  <span className="font-body text-label font-semibold text-fy-ink">{n}</span>
                  <EyebrowLabel tone="brown">Master Plumber</EyebrowLabel>
                </div>
              ))}
            </div>
          </div>
        </Block>

        <Block title="Navigation" from="live_tracking_1, society_governance, household_home">
          <div className="flex flex-col gap-3">
            <div>
              <MutedText className="font-mono">TabRow · inset (live_tracking_1)</MutedText>
              <TabRow
                className="mt-1.5"
                variant="inset"
                active={tab}
                onChange={setTab}
                tabs={[
                  { key: 'status', label: 'Status' },
                  { key: 'chat', label: 'Chat' },
                  { key: 'payment', label: 'Payment' },
                  { key: 'custody', label: 'Custody' },
                ]}
              />
            </div>
            <div>
              <MutedText className="font-mono">TabRow · pill (society_governance)</MutedText>
              <TabRow
                className="mt-1.5"
                active={pillTab}
                onChange={setPillTab}
                tabs={[
                  { key: 'affiliation', label: 'Affiliation', glyph: 'apartment' },
                  { key: 'byelaws', label: 'Bye-laws', glyph: 'gavel' },
                  { key: 'equity', label: 'Equity', glyph: 'pie_chart' },
                ]}
              />
            </div>
            <MutedText className="font-mono">BottomTabBar is fixed at the foot of this page.</MutedText>
          </div>
        </Block>

        <Block title="Feedback" from="carried forward — states the designs do not draw">
          <div className="grid gap-3">
            <LightCard>
              <EmptyState title="No drivers available" description="We're widening the search radius." />
            </LightCard>
            <LightCard>
              <ErrorState onRetry={() => toast.show('Retrying…')} />
            </LightCard>
            <LightCard>
              <PermissionDeniedState />
            </LightCard>
            <LightCard className="flex flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </LightCard>
            <Button variant="ghost" onClick={() => toast.show('Saved', 'success')}>Fire a toast</Button>
          </div>
        </Block>
      </main>

      <BottomTabBar
        items={[
          { href: '/styleguide', label: 'Services', glyph: 'local_convenience_store' },
          { href: '/styleguide#transit', label: 'Transit', glyph: 'local_shipping' },
          { href: '/styleguide#passbook', label: 'Passbook', glyph: 'account_balance_wallet' },
          { href: '/styleguide#union', label: 'Union', glyph: 'diversity_3' },
        ]}
      />
    </div>
  );
}
