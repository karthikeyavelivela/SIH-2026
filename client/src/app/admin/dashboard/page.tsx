'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { SupportAgentWidget, DemandForecastWidget } from '@/components/worker/AgentWidgets';
import {
  UsersIcon,
  LayersIcon,
  AlertIcon,
  WalletIcon,
  ChevronRightIcon,
  ShieldIcon,
  CompassIcon,
  BoxIcon,
  BellIcon,
  ClockIcon,
} from '@/components/ui/icons';

/* Built against client/public/design/admin_overview.html.

   Section order there: the scope header ("Previewing as: Super Admin") ->
   a four-tile metric strata -> a 2/3 live map beside a 1/3 incident queue
   -> the institutional ledger pulse bar. The sidebar is the console shell
   in admin/layout.tsx, which already matches.

   Largest elements: the four KPI numerals. Dark surface: the pulse bar.

   Deviations, all because the data does not exist:
   - "4 SLA Breaches", "Median response: 11m", "88% Assigned", "T-4.2s
     telemetry cycle" and "14/14 mandi corridors online" have no source.
     Nothing measures complaint response time, assignment ratio or corridor
     uptime, so none of those lines is reproduced.
   - The live freight map with per-pod pins and the glass detail drawer
     ("Corridor Speed", "Ping Driver") would need live per-booking
     positions and a driver-ping channel at admin scope. Neither exists.
     The incident queue beside it is real and is what this screen leads
     with instead.
   - The ledger pulse bar's WebSocket indicator and cryptographic security
     badge are decorative. The bar carries the real settled totals instead.

   Everything shown comes from GET /api/admin/stats. */

interface AdminStats {
  activeBookings: number;
  gmv: number;
  openComplaints: number;
  totalCompletedBookings: number;
  workersOnline: number;
  vehiclesOnline: number;
  openDisputes: number;
}

const LINK_META = [
  { href: '/admin/kyc-queue', key: 'kycQueue', icon: ShieldIcon, perm: 'verify_kyc' },
  { href: '/admin/disputes', key: 'disputes', icon: AlertIcon, perm: 'admin' },
  { href: '/admin/fraud-alerts', key: 'fraudAlerts', icon: ShieldIcon, perm: 'admin' },
  { href: '/admin/payouts', key: 'payouts', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/ledger', key: 'ledger', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/surge-zones', key: 'surgeZones', icon: CompassIcon, perm: 'edit_fare_rules' },
  { href: '/admin/analytics', key: 'analytics', icon: LayersIcon, perm: 'view_analytics' },
  { href: '/admin/ops-hub', key: 'opsHub', icon: BellIcon, perm: 'view_analytics' },
  { href: '/admin/reports', key: 'reports', icon: BoxIcon, perm: 'admin' },
  { href: '/admin/users', key: 'users', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/managers', key: 'managers', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/fares', key: 'fares', icon: LayersIcon, perm: 'edit_fare_rules' },
  { href: '/admin/complaints', key: 'complaints', icon: AlertIcon, perm: 'resolve_complaints' },
  { href: '/admin/incentives', key: 'incentives', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/regions', key: 'regions', icon: CompassIcon, perm: 'admin' },
  { href: '/admin/audit-log', key: 'auditLog', icon: ClockIcon, perm: 'admin' },
] as const;

/** One tile of the metric strata. */
function Strata({
  eyebrow,
  label,
  value,
  note,
  glyph,
  tone = 'ink',
}: {
  eyebrow: string;
  label: string;
  value: string | number;
  note: string;
  glyph: string;
  tone?: 'ink' | 'green' | 'brown' | 'error';
}) {
  const valueTone = {
    ink: 'text-fy-ink',
    green: 'text-fy-green',
    brown: 'text-fy-brown',
    error: 'text-fy-error',
  }[tone];
  return (
    <div className="fy-surface-card flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-fy-muted truncate">{eyebrow}</p>
          <p className="font-body text-label font-semibold text-fy-ink-soft mt-0.5 truncate">{label}</p>
        </div>
        <Icon name={glyph} size={20} className="text-fy-brown shrink-0" />
      </div>
      <p className={`font-heading text-metric leading-none ${valueTone}`}>{value}</p>
      <p className="font-body text-eyebrow text-fy-muted">{note}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations('adminDashboard');
  const tLinks = useTranslations('adminDashboard.links');
  const { user } = useAuth();
  const { data: stats } = usePolling(() => api.get<AdminStats>('/api/admin/stats'), 30000);

  const isAdmin = user?.role === 'admin';
  const permissions = useMemo(() => user?.permissions ?? [], [user]);

  const links = LINK_META.map((l) => ({
    ...l,
    label: tLinks(`${l.key}.label`),
    hint: tLinks(`${l.key}.hint`),
  })).filter((l) => (l.perm === 'admin' ? isAdmin : isAdmin || permissions.includes(l.perm)));

  /* The incident queue. Each row is a real open count with a route that
     actually resolves it — never a fabricated incident. */
  const incidents = [
    {
      key: 'disputes',
      href: '/admin/disputes',
      count: stats?.openDisputes ?? 0,
      tone: 'error' as const,
      glyph: 'gavel',
      gated: isAdmin,
    },
    {
      key: 'complaints',
      href: '/admin/complaints',
      count: stats?.openComplaints ?? 0,
      tone: 'brown' as const,
      glyph: 'report',
      gated: isAdmin || permissions.includes('resolve_complaints'),
    },
    {
      key: 'kyc',
      href: '/admin/kyc-queue',
      count: null,
      tone: 'slate' as const,
      glyph: 'badge',
      gated: isAdmin || permissions.includes('verify_kyc'),
    },
  ].filter((i) => i.gated);

  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  return (
    <div className="animate-[fadeUp_400ms_ease-out] flex flex-col gap-8">
      {/* Scope header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
          <h1 className="font-heading text-heading font-extrabold mb-1">
            {t('welcome', { name: user?.name?.split(' ')[0] ?? '' })}
          </h1>
          <p className="text-sm text-fy-ink-soft">{t('subtitle')}</p>
        </div>
        <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-fy-well shrink-0">
          <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-fy-ink-soft">
            {t('scopeChip', { role: isAdmin ? t('roleSuperAdmin') : t('roleManager') })}
          </span>
        </span>
      </div>

      {/* Metric strata */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Strata
          eyebrow={t('strata.demandEyebrow')}
          label={t('activeBookings')}
          value={stats?.activeBookings ?? '—'}
          note={t('strata.activeNote', { completed: stats?.totalCompletedBookings ?? 0 })}
          glyph="local_shipping"
        />
        <Strata
          eyebrow={t('strata.clearanceEyebrow')}
          label={t('gmv')}
          value={stats ? money(stats.gmv) : '—'}
          note={t('strata.gmvNote')}
          glyph="account_balance_wallet"
          tone="green"
        />
        <Strata
          eyebrow={t('strata.trustEyebrow')}
          label={t('openGrievances')}
          value={stats ? stats.openComplaints + stats.openDisputes : '—'}
          note={t('strata.grievanceNote', {
            complaints: stats?.openComplaints ?? 0,
            disputes: stats?.openDisputes ?? 0,
          })}
          glyph="report"
          tone={stats && stats.openComplaints + stats.openDisputes > 0 ? 'error' : 'ink'}
        />
        <Strata
          eyebrow={t('strata.labourEyebrow')}
          label={t('workersOnline')}
          value={stats?.workersOnline ?? '—'}
          note={t('strata.workersNote', { vehicles: stats?.vehiclesOnline ?? 0 })}
          glyph="groups"
          tone="brown"
        />
      </div>

      {/* Incident queue */}
      {incidents.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-heading text-title font-bold flex items-center gap-2">
              <Icon name="notification_important" size={20} className="text-fy-brown" />
              {t('incidentQueue')}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">{t('needsReview')}</span>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {incidents.map((i) => (
              <Link key={i.key} href={i.href} className="min-w-0">
                <div className="fy-surface-card flex items-center justify-between gap-3 h-full hover:bg-fy-well transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        i.tone === 'error'
                          ? 'bg-fy-error-bg text-fy-error'
                          : i.tone === 'brown'
                            ? 'bg-fy-brown-soft/20 text-fy-brown'
                            : 'bg-fy-slate-pale text-fy-slate'
                      }`}
                    >
                      <Icon name={i.glyph} size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{t(`incident.${i.key}.label`)}</p>
                      <p className="text-xs text-fy-ink-soft truncate">
                        {i.count === null ? t(`incident.${i.key}.hint`) : t('openCount', { count: i.count })}
                      </p>
                    </div>
                  </div>
                  {i.count !== null && i.count > 0 && (
                    <span className="font-heading text-title font-bold text-fy-error shrink-0">{i.count}</span>
                  )}
                  <ChevronRightIcon className="w-4 h-4 text-fy-muted shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Ledger pulse bar */}
      <div className="bg-fy-brown text-fy-on-brown rounded-card p-5 shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Icon name="account_balance" size={22} className="text-fy-lime shrink-0" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-fy-bone/70">{t('pulseEyebrow')}</p>
            <p className="font-heading text-title text-fy-bone truncate">
              {stats ? money(stats.gmv) : '—'} · {t('pulseJobs', { count: stats?.totalCompletedBookings ?? 0 })}
            </p>
          </div>
        </div>
        <Link
          href="/admin/ledger"
          className="px-4 h-10 inline-flex items-center gap-2 rounded-full bg-fy-bone/15 hover:bg-fy-bone/25 font-mono text-[11px] uppercase tracking-wider font-semibold transition-colors shrink-0"
        >
          {t('openLedger')}
          <Icon name="arrow_outward" size={15} className="text-fy-lime" />
        </Link>
      </div>

      {/* Console sections */}
      <div>
        <h2 className="font-heading text-title font-bold mb-4">{t('consoleSections')}</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="min-w-0">
              <div className="fy-surface-card flex items-center justify-between gap-3 h-full hover:bg-fy-well transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-fy-brown-soft/20 text-fy-brown flex items-center justify-center shrink-0">
                    <l.icon className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{l.label}</p>
                    <p className="text-xs text-fy-ink-soft truncate">{l.hint}</p>
                  </div>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-fy-muted shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-lg">
        <DemandForecastWidget region={user?.region} accent="primary" />
        <SupportAgentWidget accent="primary" />
      </div>
    </div>
  );
}
