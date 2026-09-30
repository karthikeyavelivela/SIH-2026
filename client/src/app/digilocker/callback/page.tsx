'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import { Panel } from '@/components/fy/Surfaces';
import { Body } from '@/components/fy/Text';

/**
 * Where DigiLocker sends the person back to. It passes the one-time `code` and
 * the `state` we issued (or an `error` if they said no); this page hands them
 * to the server, which checks the state belongs to this person, fetches the
 * document and stores it for review. The redirect is used once.
 */
function Callback() {
  const t = useTranslations('digilocker');
  const params = useSearchParams();
  const { user } = useAuth();
  const [status, setStatus] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Strict-mode safe: the redirect can only be used once, so never send it twice.
    if (started.current) return;
    started.current = true;
    const state = params.get('state');
    if (!state) {
      setStatus('failed');
      return;
    }
    api
      .post('/api/digilocker/complete', { state, code: params.get('code') ?? undefined, error: params.get('error') ?? undefined })
      .then(() => setStatus('done'))
      .catch((err) => {
        setMessage(err instanceof ApiClientError ? err.message : null);
        setStatus('failed');
      });
  }, [params]);

  return (
    <div className="min-h-screen bg-fy-bone flex items-center justify-center px-gutter py-10">
      <Panel className="w-full max-w-sm flex flex-col gap-4">
        <Body size="label">{status === 'working' ? t('working') : status === 'done' ? t('done') : message ?? t('failed')}</Body>
        {status !== 'working' && (
          <Link href={user ? roleHome(user.role, (user as { workerKind?: never }).workerKind) : '/login'} className="font-body text-label font-semibold text-fy-brown hover:underline">
            {t('back')}
          </Link>
        )}
      </Panel>
    </div>
  );
}

export default function DigiLockerCallbackPage() {
  return (
    <Suspense fallback={null}>
      <Callback />
    </Suspense>
  );
}
