'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomTabBar } from './Navigation';
import { ModeSheet } from './ModeSheet';
import { useCustomerMode, MODE_CHROME, MODE_HOME } from '@/lib/customerMode';

/**
 * The signed-in customer's bottom bar, in one place so every customer
 * screen carries an identical shell.
 *
 * Four destinations and a raised centre button. The centre button is the
 * mode switch — Household / Hamali / Transit — which used to be a rotary
 * dial pinned to the top-right corner of the viewport. That control never
 * rendered correctly: its geometry required the disc's centre to sit
 * exactly on the viewport corner, so three quarters of it were off-screen
 * and its drag gesture was somewhere a thumb does not reach.
 *
 * The three mode destinations are gone from the tab row as a result. They
 * were never peers of Passbook and Profile anyway: switching mode swaps the
 * entire screen, while the other tabs navigate within one. Putting a full
 * context swap behind a tab that looked like any other tab is what made the
 * modes feel like filters.
 *
 * The tab labels here are mode-neutral on purpose — see the leak audit in
 * customerMode.ts. "Passbook" and "Profile" mean the same thing in all
 * three worlds; nothing in this bar names a category or a trade.
 */
export function CustomerTabBar() {
  const t = useTranslations('customerNav');
  const { mode, setMode } = useCustomerMode();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomTabBar
        size="compact"
        centre={{
          label: t('switchMode'),
          // The button wears the current mode's own glyph, so the bar says
          // which world you are in without a label.
          glyph: MODE_CHROME[mode].glyph,
          onPress: () => setSheetOpen(true),
        }}
        items={[
          // Home follows the mode. In Transit, "Home" is the transit
          // home — not the household dashboard wearing a transit label.
          { href: MODE_HOME[mode], label: t('home'), glyph: 'home' },
          { href: '/customer/history', label: t('bookings'), glyph: 'receipt_long' },
          { href: '/customer/notifications', label: t('notifications'), glyph: 'notifications' },
          { href: '/customer/profile', label: t('profile'), glyph: 'person' },
        ]}
      />
      <ModeSheet open={sheetOpen} active={mode} onPick={setMode} onClose={() => setSheetOpen(false)} />
    </>
  );
}
