'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { StatusPill } from '@/components/fy/Status';

/**
 * Feedback, on every role's settings screen.
 *
 * The "a service you don't offer yet" option is the one that earns this its
 * place. Someone who comes looking for pest control and finds nothing simply
 * leaves, and the product learns nothing from it. Naming the thing they
 * wanted turns that silence into a counted list an admin can sort by.
 *
 * Submissions show their own status afterwards. Feedback that disappears into
 * a void is feedback people stop sending.
 */

const CATEGORIES = ['feature_request', 'bug', 'pricing', 'worker_quality', 'service_request', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

interface Row {
  _id: string;
  category: Category;
  message: string;
  requestedService?: string;
  status: 'new' | 'reviewing' | 'planned' | 'closed';
  adminNote?: string;
  createdAt: string;
}

export function FeedbackSection() {
  const t = useTranslations('feedback');
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>('feature_request');
  const [message, setMessage] = useState('');
  const [service, setService] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ feedback: Row[] }>('/api/feedback/mine')
      .then((res) => setRows(res.feedback))
      .catch(() => {});
  }, [sent]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/feedback', {
        category,
        message: message.trim(),
        ...(category === 'service_request' ? { requestedService: service.trim() } : {}),
      });
      setSent(true);
      setMessage('');
      setService('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    message.trim().length >= 5 && (category !== 'service_request' || service.trim().length > 0);

  return (
    <Section title={<SectionHeading>{t('title')}</SectionHeading>}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
          <LightCard className="flex items-center gap-3 hover:bg-fy-well transition-colors">
            <span className="w-10 h-10 rounded-full bg-fy-brown/10 text-fy-brown flex items-center justify-center shrink-0">
              <Icon name="feedback" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-body text-body font-semibold text-fy-ink">{t('title')}</span>
              <span className="block font-body text-label text-fy-muted">{t('hint')}</span>
            </span>
            <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
          </LightCard>
        </button>
      ) : (
        <Panel className="flex flex-col gap-3">
          <EyebrowLabel>{t('category')}</EyebrowLabel>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`min-h-[36px] px-3 rounded-control border font-body text-label ${
                  category === c ? 'border-fy-brown bg-fy-brown/8 text-fy-ink' : 'border-fy-brown/15 text-fy-muted'
                }`}
              >
                {t(`categories.${c}` as never)}
              </button>
            ))}
          </div>

          {category === 'service_request' && (
            <label className="flex flex-col gap-1">
              <EyebrowLabel>{t('serviceName')}</EyebrowLabel>
              <Field value={service} onChange={(e) => setService(e.target.value)} placeholder={t('servicePlaceholder')} />
              <span className="font-mono text-[10px] text-fy-muted">{t('serviceHint')}</span>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('message')}</EyebrowLabel>
            <Field value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('messagePlaceholder')} />
          </label>

          {error && <Body size="label">{error}</Body>}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="light" size="md" onClick={() => setOpen(false)}>
              {t('status.closed')}
            </Button>
            <Button size="md" glyph="send" disabled={busy || !canSubmit} onClick={submit}>
              {busy ? t('submitting') : t('submit')}
            </Button>
          </div>
        </Panel>
      )}

      {sent && (
        <LightCard className="flex items-center gap-2.5 mt-2">
          <Icon name="check_circle" size={18} className="text-fy-green" />
          <Body size="label">{t('sent')}</Body>
        </LightCard>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          <EyebrowLabel>{t('mine')}</EyebrowLabel>
          {rows.map((r) => (
            <LightCard key={r._id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <Body size="label" className="truncate">
                  {r.requestedService ? `${r.requestedService} — ${r.message}` : r.message}
                </Body>
                <span className="font-mono text-[10px] text-fy-muted">
                  {t(`categories.${r.category}` as never)} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
                {r.adminNote && <Body size="label">{r.adminNote}</Body>}
              </span>
              <StatusPill tone={r.status === 'planned' ? 'lime' : r.status === 'closed' ? 'neutral' : 'outline'}>
                {t(`status.${r.status}` as never)}
              </StatusPill>
            </LightCard>
          ))}
        </div>
      )}
    </Section>
  );
}
