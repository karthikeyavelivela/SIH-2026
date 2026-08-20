'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusChip } from '@/components/ui/StatusChip';
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
import { Skeleton } from '@/components/ui/Skeleton';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { SidebarNav } from '@/components/admin/SidebarNav';
import { DataTable } from '@/components/admin/DataTable';

const COLOR_TOKENS: { name: string; varName: string }[] = [
  { name: 'surface', varName: '--ip-surface' },
  { name: 'surface-dim', varName: '--ip-surface-dim' },
  { name: 'container-lowest', varName: '--ip-surface-container-lowest' },
  { name: 'container-low', varName: '--ip-surface-container-low' },
  { name: 'container', varName: '--ip-surface-container' },
  { name: 'container-high', varName: '--ip-surface-container-high' },
  { name: 'container-highest', varName: '--ip-surface-container-highest' },
  { name: 'on-surface', varName: '--ip-on-surface' },
  { name: 'on-surface-variant', varName: '--ip-on-surface-variant' },
  { name: 'outline', varName: '--ip-outline' },
  { name: 'outline-variant', varName: '--ip-outline-variant' },
  { name: 'primary', varName: '--ip-primary' },
  { name: 'primary-container', varName: '--ip-primary-container' },
  { name: 'secondary', varName: '--ip-secondary' },
  { name: 'secondary-container', varName: '--ip-secondary-container' },
  { name: 'error', varName: '--ip-error' },
  { name: 'error-container', varName: '--ip-error-container' },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="font-heading font-bold text-ip-display-md text-ip-on-surface mb-1">{title}</h2>
      {description && <p className="text-ip-on-surface-variant mb-6 max-w-2xl">{description}</p>}
      <div className={description ? '' : 'mt-6'}>{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [lang, setLang] = useState<LanguageCode>('en');
  const [seconds, setSeconds] = useState(18);

  return (
    <div className="min-h-screen bg-ip-surface text-ip-on-surface pb-32">
      <TopBar title="FYRO Styleguide" showBack={false} right={<Badge tone="secondary">Phase 0</Badge>} />

      <div className="max-w-5xl mx-auto px-ip-edge pt-10">
        <p className="text-ip-on-surface-variant mb-12 max-w-2xl">
          Living reference for <code>DESIGN_INVENTORY.md</code> — the merged design system: existing FYRO tokens
          (warm-beige, shadow-elevated, already shipping) plus the new &quot;Ink on Warm Paper&quot; tokens from the
          Stitch import (tonal, flat, <code>ip-*</code> prefixed) used by all 85 new screens. Compare this page
          against the Stitch <code>screen.png</code> files while building.
        </p>

        <Section title="Color — Ink on Warm Paper" description="New ip-* tokens. Swatch + CSS variable name + hex.">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {COLOR_TOKENS.map((t) => (
              <div key={t.varName} className="rounded-ip-card overflow-hidden border border-ip-outline/10">
                <div className="h-20" style={{ background: `var(${t.varName})` }} />
                <div className="p-3 bg-ip-surface-container-lowest">
                  <p className="text-xs font-semibold">{t.name}</p>
                  <p className="text-xs text-ip-outline font-mono">{t.varName}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-4">
            <p className="font-heading font-extrabold text-ip-display-lg">Display Large — Syne 800</p>
            <p className="font-heading font-bold text-ip-display-md">Display Medium — Syne 700</p>
            <p className="font-heading font-bold text-ip-headline-sm">Headline Small — Syne 700</p>
            <p className="font-body text-ip-body-lg">Body Large — Outfit 400, for long-form reading text.</p>
            <p className="font-body text-ip-body-md">Body Medium — Outfit 400, default UI text.</p>
            <p className="font-body text-ip-body-sm text-ip-on-surface-variant">Body Small — Outfit 400, captions/metadata.</p>
            <p className="font-heading font-semibold text-ip-data-mono tabular-nums">₹1,24,500.00 — Data / numbers, Syne 600</p>
            <p className="font-body text-xs font-semibold uppercase tracking-widest text-ip-on-surface-variant">Label Bold — Outfit 600, all-caps</p>
          </div>
        </Section>

        <Section title="Elevation — tonal, not shadow" description="New screens use color-layer depth. Press state = darker container + 1px near-black border, never a shadow.">
          <div className="flex flex-wrap gap-4">
            <div className="ip-card w-56">
              <p className="text-sm text-ip-on-surface-variant">surface-container</p>
              <p className="font-heading font-bold text-lg mt-1">Default card</p>
            </div>
            <div className="ip-card ip-card--pressed w-56">
              <p className="text-sm text-ip-on-surface-variant">surface-container-high</p>
              <p className="font-heading font-bold text-lg mt-1">Pressed state</p>
            </div>
          </div>
        </Section>

        <Section title="Buttons & Badges" description="Existing components — unchanged, still used by all shipped screens.">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">Primary</Badge>
            <Badge tone="secondary">Secondary</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="muted">Muted</Badge>
          </div>
        </Section>

        <Section title="StatusChip" description="New — low-saturation container bg, high-saturation on-container text. Prefer over Badge on new industrial screens.">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="primary" dot>In Transit</StatusChip>
            <StatusChip tone="secondary" dot>On Site</StatusChip>
            <StatusChip tone="success" dot>Completed</StatusChip>
            <StatusChip tone="warning" dot>Due Soon</StatusChip>
            <StatusChip tone="danger" dot>Fault</StatusChip>
            <StatusChip tone="muted">Idle</StatusChip>
          </div>
        </Section>

        <Section title="Cards">
          <div className="flex flex-wrap gap-4">
            <Card elevation="raised" className="w-56"><p className="text-sm">Existing Card (shadow-md)</p></Card>
            <div className="ip-card w-56"><p className="text-sm">New .ip-card (tonal)</p></div>
          </div>
        </Section>

        <Section title="MetricCard">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard label="Revenue (MTD)" value="₹8,42,300" delta="+12.4%" deltaTone="positive" />
            <MetricCard label="Active Trips" value="214" delta="-3.1%" deltaTone="negative" />
            <MetricCard label="Fleet Utilisation" value="78%" delta="+0.0%" deltaTone="neutral" />
          </div>
        </Section>

        <Section title="Avatar / AvatarStack">
          <div className="flex items-center gap-8">
            <div className="flex gap-3">
              <Avatar name="Ravi Kumar" size="sm" status="online" />
              <Avatar name="Lakshmi P" size="md" accent="secondary" status="on_job" />
              <Avatar name="Suresh N" size="lg" status="offline" />
            </div>
            <AvatarStack people={[{ name: 'Ravi' }, { name: 'Lakshmi' }, { name: 'Suresh' }, { name: 'Anitha' }, { name: 'Kiran' }]} />
          </div>
        </Section>

        <Section title="DataRow / ListDivider" description="Manifest lines, ledger rows, fare breakdowns.">
          <div className="ip-card max-w-md">
            <DataRow label="Base fare" value="₹1,200" />
            <ListDivider />
            <DataRow label="Distance (42 km)" value="₹630" />
            <ListDivider />
            <DataRow label="Hamali (2 workers)" value="₹500" hint="Loading + unloading" />
            <ListDivider />
            <DataRow label="Total" value="₹2,330" />
          </div>
        </Section>

        <Section title="CountdownRing" description="Driven by real seconds-left — never decorative.">
          <div className="flex items-center gap-6">
            <CountdownRing secondsLeft={seconds} totalSeconds={30} accent="primary" />
            <CountdownRing secondsLeft={22} totalSeconds={30} accent="secondary" />
            <Button variant="ghost" onClick={() => setSeconds((s) => (s > 0 ? s - 1 : 30))}>Tick -1s</Button>
          </div>
        </Section>

        <Section title="LanguagePill">
          <LanguagePill value={lang} onChange={setLang} />
          <p className="text-sm text-ip-outline mt-2">Selected: {lang}</p>
        </Section>

        <Section title="EmptyState / Skeleton">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="ip-card">
              <EmptyState title="No drivers available" description="We're widening the search radius — this can take up to a minute." />
            </div>
            <div className="ip-card">
              <Skeleton lines={4} className="h-4" />
            </div>
          </div>
        </Section>

        <Section title="Sheets & Modals">
          <div className="flex gap-3">
            <Button onClick={() => setSheetOpen(true)}>Open BottomSheet</Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Modal</Button>
          </div>
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter loads">
            <p className="text-sm text-ip-on-surface-variant">Bottom-sheet content goes here — filters, bid entry, quick actions.</p>
          </BottomSheet>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm action" footer={<Button onClick={() => setModalOpen(false)}>Close</Button>}>
            <p className="text-sm text-text-muted">Existing centered Modal — unchanged, still used for confirm/cancel dialogs.</p>
          </Modal>
        </Section>

        <Section title="Admin: SidebarNav + DataTable">
          <div className="grid md:grid-cols-[200px_1fr] gap-6">
            <SidebarNav
              items={[
                { href: '/styleguide', label: 'Overview' },
                { href: '/admin/dashboard', label: 'Dashboard' },
                { href: '/admin/users', label: 'Users' },
              ]}
            />
            <DataTable
              columns={[
                { key: 'id', header: 'ID', render: (r: { id: string; type: string; amount: string }) => r.id },
                { key: 'type', header: 'Type', render: (r) => <StatusChip tone="secondary">{r.type}</StatusChip> },
                { key: 'amount', header: 'Amount', render: (r) => <span className="font-heading font-semibold">{r.amount}</span> },
              ]}
              rows={[
                { id: 'LDG-001', type: 'Payout', amount: '₹4,200' },
                { id: 'LDG-002', type: 'Fee', amount: '₹120' },
              ]}
              rowKey={(r) => r.id}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
