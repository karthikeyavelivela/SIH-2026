'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { Avatar } from '@/components/ui/Avatar';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { DataRow } from '@/components/ui/DataRow';
import { ListDivider } from '@/components/ui/ListDivider';
import { TopBar } from '@/components/ui/TopBar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Modal } from '@/components/ui/Modal';
import { MetricCard } from '@/components/ui/MetricCard';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionDeniedState } from '@/components/ui/PermissionDeniedState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { SidebarNav } from '@/components/admin/SidebarNav';
import { DataTable } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { FlatRowList, FlatRow } from '@/components/ui/FlatRowList';
import { Tabs } from '@/components/ui/Tabs';
import { IconButton } from '@/components/ui/IconButton';
import { ChipRow } from '@/components/ui/ChipRow';
import { FilterChip } from '@/components/ui/FilterChip';
import { Toggle } from '@/components/ui/Toggle';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { Slider } from '@/components/ui/Slider';
import { DatePicker } from '@/components/ui/DatePicker';
import { RatingHistogram } from '@/components/ui/RatingHistogram';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Media } from '@/components/ui/Media';
import { AgentCard } from '@/components/ui/AgentResultCard';
import { useToast } from '@/components/ui/Toast';
import { RotaryDial } from '@/components/ui/RotaryDial';
import { HomeIcon, UsersIcon, TruckIcon } from '@/components/ui/icons';

const DIAL_SECTORS = [
  { key: 'household', label: 'Household', icon: <HomeIcon /> },
  { key: 'labour', label: 'Labour', icon: <UsersIcon /> },
  { key: 'transport', label: 'Transport', icon: <TruckIcon /> },
];

const PALETTE = [
  { name: 'bone', varName: '--fyro-bone' },
  { name: 'ink', varName: '--fyro-ink' },
  { name: 'brown', varName: '--fyro-brown' },
  { name: 'lime', varName: '--fyro-lime' },
  { name: 'slate', varName: '--fyro-slate' },
  { name: 'muted', varName: '--fyro-muted' },
];
const ACCENTS = [
  { name: 'household', varName: '--accent-household' },
  { name: 'labour', varName: '--accent-labour' },
  { name: 'transport', varName: '--accent-transport' },
];
const TYPE_SCALE = [
  { cls: 'text-display-hero-mobile md:text-display-hero', label: 'display-hero' },
  { cls: 'text-headline-lg-mobile md:text-headline-lg', label: 'headline-lg' },
  { cls: 'text-headline-md', label: 'headline-md' },
  { cls: 'text-headline-sm', label: 'headline-sm' },
  { cls: 'text-body-lg font-body', label: 'body-lg' },
  { cls: 'text-body-default font-body', label: 'body-default' },
  { cls: 'text-label-caps font-body uppercase tracking-widest', label: 'label-caps' },
];

function StyleSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="font-heading font-bold text-headline-md text-fyro-ink mb-1">{title}</h2>
      {description && <p className="text-ip-on-surface-variant mb-6 max-w-2xl font-body">{description}</p>}
      <div className={description ? '' : 'mt-6'}>{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [lang, setLang] = useState<LanguageCode>('en');
  const [tab, setTab] = useState('one');
  const [toggleOn, setToggleOn] = useState(true);
  const [count, setCount] = useState(2);
  const [tonnage, setTonnage] = useState(45);
  const [search, setSearch] = useState('');
  const [dialMode, setDialMode] = useState('household');
  const toast = useToast();

  return (
    <RotaryDial sectors={DIAL_SECTORS} activeKey={dialMode} onChange={setDialMode}>
    <div className="min-h-screen bg-fyro-bone text-fyro-ink pb-32 relative">
      <div className="fixed inset-0 pointer-events-none fyro-grain z-0 opacity-40" />
      <TopBar title="FYRO Styleguide v3" showBack={false} right={<StatusPill tone="labour">v3 · live</StatusPill>} />

      <div className="max-w-5xl mx-auto px-ip-edge pt-10 relative z-10">
        <PageHeader
          title="Cooperative Ledger design system"
          subline="Living reference for DESIGN_MAP.md — the v3 palette, Fraunces/Inter type, and every shared component new pages are built from. Compare against the Stitch screen.png files while building."
          className="mb-14"
        />

        <StyleSection title="Palette" description="The six raw hues from DESIGN.md, plus the three semantic domain accents built on top of them.">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-6">
            {PALETTE.map((t) => (
              <div key={t.varName} className="rounded-card overflow-hidden border border-[color:var(--hairline)]">
                <div className="h-20" style={{ background: `var(${t.varName})` }} />
                <div className="p-3 bg-white">
                  <p className="text-xs font-semibold font-body">{t.name}</p>
                  <p className="text-xs text-ip-outline font-mono">{t.varName}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {ACCENTS.map((t) => (
              <div key={t.varName} className="rounded-card overflow-hidden border border-[color:var(--hairline)]">
                <div className="h-14" style={{ background: `var(${t.varName})` }} />
                <div className="p-3 bg-white">
                  <p className="text-xs font-semibold font-body">accent-{t.name}</p>
                </div>
              </div>
            ))}
          </div>
        </StyleSection>

        <StyleSection title="Typography" description="Fraunces (headings, display numbers) + Inter (body, UI). Headings swap script automatically per <html lang> — see LanguagePill below.">
          <div className="flex flex-col gap-4">
            {TYPE_SCALE.map((t) => (
              <div key={t.label} className="flex items-baseline gap-4 border-b border-[color:var(--hairline)] pb-3">
                <span className="w-32 shrink-0 font-mono text-xs text-ip-outline">{t.label}</span>
                <span className={`font-heading ${t.cls} text-fyro-ink truncate`}>Cooperative dignity, made visible</span>
              </div>
            ))}
            <div className="flex items-baseline gap-4">
              <span className="w-32 shrink-0 font-mono text-xs text-ip-outline">data-metric</span>
              <span className="font-heading text-data-metric tabular-nums text-fyro-ink">₹8,42,300</span>
            </div>
          </div>
        </StyleSection>

        <StyleSection title="PageHeader / Section / FlatRowList" description="The v3 page-structure primitives — every rebuilt page is a PageHeader followed by a stack of Sections, and lists are hairline-separated rows, not boxed cards.">
          <Section title="Recent bookings" description="FlatRowList in action — ledger-style, tabular figures right-aligned.">
            <FlatRowList>
              <FlatRow left="Visakhapatnam → Guntur" right="₹2,330" onClick={() => toast.show('Row clicked', 'neutral')} />
              <FlatRow left="Household — Electrician" right="₹450" />
              <FlatRow left="Bulk labour — 120t" right="₹18,400" />
            </FlatRowList>
          </Section>
        </StyleSection>

        <StyleSection title="Tabs">
          <Tabs tabs={[{ key: 'one', label: 'Status' }, { key: 'two', label: 'Chat' }, { key: 'three', label: 'Payment' }]} active={tab} onChange={setTab} />
          <p className="mt-4 text-sm text-ip-on-surface-variant font-body">Active: {tab}</p>
        </StyleSection>

        <StyleSection title="Controls">
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <Button onClick={() => toast.show('Saved', 'success')}>Primary Button</Button>
              <Button variant="secondary">Secondary Button</Button>
              <Button variant="ghost">Ghost Button</Button>
              <div className="flex items-center gap-3">
                <IconButton icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>} label="Add" />
                <Toggle checked={toggleOn} onChange={setToggleOn} label="Online" />
                <NumberStepper value={count} onChange={setCount} label="Workers" />
              </div>
              <ChipRow>
                <FilterChip active>All</FilterChip>
                <FilterChip>Household</FilterChip>
                <FilterChip>Labour</FilterChip>
                <FilterChip>Transport</FilterChip>
              </ChipRow>
            </div>
            <div className="flex flex-col gap-4">
              <SearchField placeholder="Search bookings…" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} />
              <Select placeholder="Goods type" options={[{ value: 'furniture', label: 'Furniture' }, { value: 'electronics', label: 'Electronics' }]} />
              <DatePicker />
              <Slider min={1} max={200} value={tonnage} valueLabel={`${tonnage} tonnes`} onChange={(e) => setTonnage(Number(e.target.value))} />
            </div>
          </div>
        </StyleSection>

        <StyleSection title="StatusPill" description="Consolidates the old StatusChip + Badge + admin ad-hoc spans into one semantic-tone primitive.">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="labour" dot>Active shift</StatusPill>
            <StatusPill tone="transport">In transit</StatusPill>
            <StatusPill tone="household">Governance</StatusPill>
            <StatusPill tone="success">Completed</StatusPill>
            <StatusPill tone="warning">Due soon</StatusPill>
            <StatusPill tone="danger">Cancelled</StatusPill>
            <StatusPill tone="neutral">Idle</StatusPill>
          </div>
        </StyleSection>

        <StyleSection title="Cards & elevation" description="DESIGN.md's tonal/glass strata — no synthetic drop shadows. .fyro-vitrine for cards, .fyro-elevated for menus/sheets.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="p-6"><p className="font-body text-sm">Existing Card component (shadow-md, unchanged)</p></Card>
            <div className="fyro-vitrine rounded-card p-6"><p className="font-body text-sm">.fyro-vitrine — translucent, blurred, hairline edge</p></div>
          </div>
        </StyleSection>

        <StyleSection title="MetricCard / ProgressBar / RatingHistogram">
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <MetricCard label="REVENUE (MTD)" value="₹8,42,300" delta="+12.4%" />
            <MetricCard label="ACTIVE TRIPS" value="214" delta="-3.1%" />
            <MetricCard label="FLEET UTILISATION" value="78%" delta="+0.0%" />
          </div>
          <div className="grid sm:grid-cols-2 gap-8">
            <ProgressBar value={62} tone="labour" label="Training completion" />
            <RatingHistogram counts={{ 5: 24, 4: 6, 3: 1, 2: 0, 1: 0 }} />
          </div>
        </StyleSection>

        <StyleSection title="Avatar / AvatarStack / CountdownRing">
          <div className="flex items-center gap-8">
            <div className="flex gap-2"><Avatar name="Ravi Kumar" /><Avatar name="Lakshmi P" /><Avatar name="Suresh N" /></div>
            <AvatarStack people={[{ name: 'Ravi' }, { name: 'Lakshmi' }, { name: 'Suresh' }, { name: 'Anand' }]} max={3} />
            <CountdownRing secondsLeft={18} totalSeconds={30} />
          </div>
        </StyleSection>

        <StyleSection title="Media" description="Designed placeholder — matches final crop/aspect, prints the asset id, never a grey box. See MEDIA_MANIFEST.ts.">
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <Media id="worker.portrait.demo" kind="photo" aspect={1} treatment="circular" tint="labour" alt="Worker portrait placeholder" />
            <Media id="household.category.electrician" kind="render" aspect={1} treatment="duotone" tint="household" alt="Electrician category" />
            <Media id="landing.hero" kind="photo" aspect={1} treatment="inline" tint="transport" alt="Landing hero placeholder" />
          </div>
        </StyleSection>

        <StyleSection title="LanguagePill">
          <LanguagePill value={lang} onChange={setLang} />
          <p className="mt-3 text-sm text-ip-on-surface-variant font-body">Selected: {lang} — headings above should be switching serif script.</p>
        </StyleSection>

        <StyleSection title="Universal states" description="Every list/dashboard fetch on a redesigned page goes through useApiState, which can only ever land on ONE of these five — never a 403 disguised as empty.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border border-[color:var(--hairline)] rounded-card"><EmptyState title="No drivers available" description="We're widening the search radius." /></div>
            <div className="border border-[color:var(--hairline)] rounded-card"><ErrorState onRetry={() => toast.show('Retrying…')} /></div>
            <div className="border border-[color:var(--hairline)] rounded-card"><PermissionDeniedState /></div>
            <div className="border border-[color:var(--hairline)] rounded-card p-6 flex flex-col gap-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
          </div>
        </StyleSection>

        <StyleSection title="AgentCard" description="Unchanged guardrails (AI chip, word-not-percent confidence, evidence open by default, 'Recommended, not applied'), now with domain accents.">
          <AgentCard
            accent="labour"
            result={{
              agentName: 'demandForecast',
              summary: 'Demand in Visakhapatnam is trending up 18% this week versus the trailing 4-week average.',
              confidence: 'moderate',
              evidence: [{ label: 'Bookings this week', value: '142' }, { label: '4-week average', value: '120' }],
              mock: true,
              generatedAt: new Date().toISOString(),
            }}
          />
        </StyleSection>

        <StyleSection title="Sheets & Modals">
          <div className="flex gap-3">
            <Button onClick={() => setSheetOpen(true)}>Open BottomSheet</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Modal</Button>
          </div>
        </StyleSection>

        <StyleSection title="Admin: SidebarNav + DataTable">
          <div className="flex gap-6 border border-[color:var(--hairline)] rounded-card overflow-hidden">
            <SidebarNav items={[{ label: 'Overview', href: '#overview' }, { label: 'Dashboard', href: '#dashboard' }, { label: 'Users', href: '#users' }]} />
            <div className="flex-1 p-4">
              <DataTable
                columns={[
                  { key: 'id', header: 'ID', render: (r) => r.id },
                  { key: 'type', header: 'Type', render: (r) => r.type },
                  { key: 'amount', header: 'Amount', render: (r) => r.amount },
                ]}
                rows={[{ id: 'LDG-001', type: 'Payout', amount: '₹4,200' }, { id: 'LDG-002', type: 'Fee', amount: '₹120' }]}
                rowKey={(r) => r.id}
              />
            </div>
          </div>
        </StyleSection>

        <StyleSection title="RotaryDial" description="Phase 1.1 — the corner-anchored mode switch. It's genuinely viewport-anchored (fixed top-right), so it's rendered live on THIS page, not boxed in a demo frame — look at the actual top-right corner of your browser. All three sectors' content stays mounted; switching is a cross-fade only. Drag along the arc, tap a wedge, Tab to it and use arrow keys.">
          <p className="font-body text-sm text-ip-on-surface-variant">Active sector: <span className="font-heading text-fyro-ink capitalize">{dialMode}</span></p>
        </StyleSection>

        <StyleSection title="DataRow / ListDivider" description="Manifest lines, fare breakdowns — dense tabular content that isn't a full FlatRowList.">
          <DataRow label="Base fare" value="₹1,200" />
          <DataRow label="Distance (42 km)" value="₹630" />
          <DataRow label="Hamali (2 workers)" value="₹500" hint="Loading + unloading" />
          <ListDivider />
          <DataRow label="Total" value="₹2,330" />
        </StyleSection>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="BottomSheet">
        <p className="font-body text-sm text-ip-on-surface-variant p-4">Content goes here.</p>
      </BottomSheet>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal">
        <p className="font-body text-sm text-ip-on-surface-variant p-4">Content goes here.</p>
      </Modal>
    </div>
    </RotaryDial>
  );
}
