'use client';

import { ReferralDashboard } from '@/components/worker/ReferralDashboard';

export default function HamaliReferralsPage() {
  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-xl font-bold mb-1">Invite &amp; Earn</h1>
      <p className="text-sm text-text-muted mb-6">
        Grow the FYRO network. Refer drivers and Hamali groups to earn bonuses when they complete their first verified trip.
      </p>
      <ReferralDashboard accent="secondary" />
    </div>
  );
}
