'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { Panel } from '@/components/fy/Surfaces';
import { Body } from '@/components/fy/Text';

/**
 * What happens when somebody forgets their password.
 *
 * There is no self-service reset, because a reset has to reach the person
 * through a channel we can verify, and FYRO has neither an SMS provider nor
 * an email provider connected. Building a form that collects a phone number
 * and then silently does nothing would be worse than this screen: it would
 * look like help.
 *
 * So the screen says what is true and points at the humans who can actually
 * do it. When an SMS provider is configured, this becomes the real flow.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations('signIn');

  return (
    <div className="min-h-screen bg-fy-bone flex items-center justify-center px-gutter py-10">
      <Panel className="w-full max-w-sm flex flex-col gap-4">
        <span className="w-11 h-11 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center">
          <Icon name="lock_reset" size={22} />
        </span>
        <h1 className="font-heading text-title text-fy-ink leading-tight">{t('forgotHeading')}</h1>
        <Body size="label">{t('forgotBody')}</Body>
        <Body size="label">{t('forgotWho')}</Body>
        <Link
          href="/login"
          className="font-body text-label font-semibold text-fy-brown hover:underline"
        >
          {t('forgotBack')}
        </Link>
      </Panel>
    </div>
  );
}
