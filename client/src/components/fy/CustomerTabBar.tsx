'use client';

import { useTranslations } from 'next-intl';
import { BottomTabBar } from './Navigation';

/**
 * The signed-in customer's bottom bar, in one place so all six customer
 * screens carry an identical shell.
 *
 * The design set has two customer bars. `household_home` and
 * `customer_profile_1` show an 80px bar with Services / Transit / Passbook /
 * Union; `hamali_labour_standard` and `goods_transport` show a 64px bar with
 * Household / Hamali / Transit / Passbook / Profile.
 *
 * This ships the five-tab one, because every tab in it has a real
 * destination. In the four-tab version "Union" would have nowhere to go: the
 * governance router is gated to mutha_leader/mutha_member and the ledger
 * router to admin, so a customer has no cooperative-governance surface at
 * all. Pointing a permanent tab at a 403 would be worse than following the
 * variant the two booking screens use.
 */
export function CustomerTabBar() {
  const t = useTranslations('customerNav');
  return (
    <BottomTabBar
      size="compact"
      items={[
        { href: '/customer/dashboard', label: t('household'), glyph: 'home_repair_service' },
        { href: '/customer/book/labour', label: t('hamali'), glyph: 'engineering' },
        { href: '/customer/book/transport', label: t('transit'), glyph: 'local_shipping' },
        { href: '/customer/history', label: t('passbook'), glyph: 'account_balance_wallet' },
        { href: '/customer/profile', label: t('profile'), glyph: 'person' },
      ]}
    />
  );
}
