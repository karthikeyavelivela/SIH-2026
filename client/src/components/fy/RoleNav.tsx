'use client';

import { useTranslations } from 'next-intl';
import { BottomTabBar, type TabItem } from './Navigation';

/**
 * Each role's bottom bar, read straight out of its own design file so the
 * item set, order and glyphs match rather than being invented per page:
 *
 *   worker_dashboard_online   Home / Jobs / Earnings / Training / Profile
 *   society_dashboard         Home / Jobs / Members / Governance / Profile
 *   fleet_owner_dashboard     Home / Vehicles / Maintenance / Profile  (80px)
 *   warehouse_hub_dashboard   Home / Docks / Profile
 *
 * admin_overview and the federation dashboards carry a drawer rather than a
 * bottom bar, so they have no entry here.
 */

function useNav() {
  return useTranslations('roleNav');
}

/** Driver and hamali share one shell; only the route prefix differs. */
export function WorkerTabBar({ base }: { base: '/driver' | '/hamali' }) {
  const t = useNav();
  const items: TabItem[] = [
    { href: `${base}/dashboard`, label: t('home'), glyph: 'home' },
    { href: `${base}/requests`, label: t('jobs'), glyph: 'fact_check' },
    { href: `${base}/earnings`, label: t('earnings'), glyph: 'account_balance_wallet' },
    { href: `${base}/training`, label: t('training'), glyph: 'school' },
    { href: `${base}/profile`, label: t('profile'), glyph: 'badge' },
  ];
  return <BottomTabBar size="compact" items={items} />;
}

/** The society (mutha) leader shell. */
export function SocietyTabBar() {
  const t = useNav();
  const items: TabItem[] = [
    { href: '/mutha/dashboard', label: t('home'), glyph: 'dashboard' },
    { href: '/mutha/active-jobs', label: t('jobs'), glyph: 'assignment' },
    { href: '/mutha/members', label: t('members'), glyph: 'group' },
    { href: '/mutha/governance', label: t('governance'), glyph: 'how_to_vote' },
    { href: '/mutha/profile', label: t('profile'), glyph: 'shield_person' },
  ];
  return <BottomTabBar size="compact" items={items} />;
}

/** A society member sees their own job and ledger, not the society's. */
export function SocietyMemberTabBar() {
  const t = useNav();
  const items: TabItem[] = [
    { href: '/mutha-member/job', label: t('job'), glyph: 'assignment' },
    { href: '/mutha-member/earnings', label: t('earnings'), glyph: 'account_balance_wallet' },
    { href: '/mutha-member/governance', label: t('governance'), glyph: 'how_to_vote' },
    { href: '/mutha-member/profile', label: t('profile'), glyph: 'badge' },
  ];
  return <BottomTabBar size="compact" items={items} />;
}

/** Four tabs at 80px — the only role whose design keeps the taller bar. */
export function FleetOwnerTabBar() {
  const t = useNav();
  const items: TabItem[] = [
    { href: '/fleet-owner/dashboard', label: t('home'), glyph: 'dashboard' },
    { href: '/fleet-owner/vehicles', label: t('vehicles'), glyph: 'local_shipping' },
    { href: '/fleet-owner/maintenance', label: t('maintenance'), glyph: 'build' },
    { href: '/fleet-owner/profile', label: t('profile'), glyph: 'badge' },
  ];
  return <BottomTabBar items={items} />;
}

export function WarehouseHubTabBar() {
  const t = useNav();
  const items: TabItem[] = [
    { href: '/warehouse-hub/dashboard', label: t('home'), glyph: 'warehouse' },
    { href: '/warehouse-hub/docks', label: t('docks'), glyph: 'dock' },
    { href: '/warehouse-hub/profile', label: t('profile'), glyph: 'badge' },
  ];
  return <BottomTabBar size="compact" items={items} />;
}
