'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const REQUIRED = [
  ['identity_verification', 'identityLabel', 'identityBody'],
  ['matching_location', 'matchingLabel', 'matchingBody'],
  ['payments', 'paymentsLabel', 'paymentsBody'],
  ['welfare_administration', 'welfareLabel', 'welfareBody'],
] as const;

/**
 * The consent step on every signup form. The four needed purposes are shown
 * with what each means, behind one agreement; analytics is a separate,
 * optional, unticked box. `payload` is what goes in the signup request.
 */
export function useSignupConsent() {
  const [agreed, setAgreed] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  return {
    valid: agreed,
    payload: {
      consent: {
        purposes: {
          identity_verification: agreed,
          matching_location: agreed,
          payments: agreed,
          welfare_administration: agreed,
          analytics,
        },
      },
    },
    field: <SignupConsentField agreed={agreed} onAgreed={setAgreed} analytics={analytics} onAnalytics={setAnalytics} />,
  };
}

function SignupConsentField(props: {
  agreed: boolean;
  onAgreed: (v: boolean) => void;
  analytics: boolean;
  onAnalytics: (v: boolean) => void;
}) {
  const t = useTranslations('consent');
  return (
    <fieldset className="flex flex-col gap-2.5 rounded-control border border-fy-muted/20 bg-fy-bone p-3">
      <legend className="px-1 font-body text-label font-semibold text-fy-ink">{t('signupTitle')}</legend>
      <ul className="flex flex-col gap-2">
        {REQUIRED.map(([key, label, body]) => (
          <li key={key} className="text-xs text-fy-ink-soft">
            <span className="font-semibold text-fy-ink">{t(label)}</span> <span className="uppercase tracking-wide">· {t('needed')}</span>
            <br />
            {t(body)}
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-xs text-fy-ink">
        <input type="checkbox" checked={props.agreed} onChange={(e) => props.onAgreed(e.target.checked)} className="mt-0.5" />
        {t('agree')}
      </label>
      <p className="text-xs text-fy-ink-soft">
        <span className="font-semibold text-fy-ink">{t('analyticsLabel')}</span> <span className="uppercase tracking-wide">· {t('optional')}</span>
        <br />
        {t('analyticsBody')}
      </p>
      <label className="flex items-start gap-2 text-xs text-fy-ink">
        <input type="checkbox" checked={props.analytics} onChange={(e) => props.onAnalytics(e.target.checked)} className="mt-0.5" />
        {t('analyticsOptIn')}
      </label>
      <Link href="/privacy" target="_blank" className="text-xs font-semibold text-fy-brown hover:underline">
        {t('readNotice')}
      </Link>
    </fieldset>
  );
}
