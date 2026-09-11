'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StarIcon } from '@/components/ui/icons';

interface RatingModalProps {
  bookingId: string;
  open: boolean;
  onDone: () => void;
  accent?: 'primary' | 'secondary';
  title?: string;
  /**
   * Show the "rate later" escape. Off by default: the prompt that appears
   * right after a job finishes should still be the straightforward ask. It is
   * turned on where the rating is standing between someone and their next
   * booking, which is where a hard wall does real harm.
   */
  allowDefer?: boolean;
}

// Spec: rating is mandatory before the rater's next booking/job — the
// server enforces that (see ratingGate.service.ts), this modal is the
// proactive prompt so the rater hits it here first instead of discovering
// the gate via a rejected next action.
export function RatingModal({
  bookingId,
  open,
  onDone,
  accent = 'primary',
  title,
  allowDefer = false,
}: RatingModalProps) {
  const t = useTranslations('worker.ratingModal');
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deferring, setDeferring] = useState(false);

  /* "Rate later" does not mark the job rated — it stays in the pending list
     and can be rated any time. It only stops this one booking holding the
     rating gate for a day, so nobody is walled out of booking by admin. */
  async function defer() {
    setDeferring(true);
    setError(null);
    try {
      await api.post(`/api/ratings/${bookingId}/defer`);
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setDeferring(false);
    }
  }

  async function submit() {
    if (score === 0) {
      setError(t('errorPickStar'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/ratings', { bookingId, score, comment: comment.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  const starColor = accent === 'primary' ? 'text-fy-brown' : 'text-fy-green';

  return (
    <Modal open={open} onClose={() => {}} title={title ?? t('defaultTitle')}>
      <p className="text-sm text-fy-muted mb-5">{t('feedbackHint')}</p>
      <div className="flex items-center justify-center gap-2 mb-5" role="radiogroup" aria-label={t('starRatingAria')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={t('starAria', { n, plural: n === 1 ? '' : 's' })}
            onClick={() => setScore(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 transition-transform duration-fast hover:scale-110"
          >
            <StarIcon
              className={`w-8 h-8 ${(hovered || score) >= n ? starColor : 'text-border-strong'}`}
              fill={(hovered || score) >= n ? 'currentColor' : 'none'}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('commentPlaceholder')}
        aria-label={t('commentAria')}
        rows={3}
        className="w-full px-4 py-2.5 rounded-control border border-fy-hairline bg-fy-bone text-sm placeholder:text-fy-muted/70 focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20 transition-colors duration-fast mb-4"
      />
      {error && (
        <div role="alert" className="mb-4 rounded-control border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-sm text-fy-on-error-bg">
          {error}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        variant={accent === 'primary' ? 'primary' : 'secondary'}
        disabled={submitting || deferring}
        onClick={submit}
      >
        {submitting ? t('submitting') : t('submitRating')}
      </Button>
      {allowDefer && (
        <button
          type="button"
          disabled={submitting || deferring}
          onClick={defer}
          className="w-full mt-3 py-2 font-mono text-[11px] uppercase tracking-widest text-fy-muted hover:text-fy-ink transition-colors disabled:opacity-50"
        >
          {deferring ? t('deferring') : t('rateLater')}
        </button>
      )}
    </Modal>
  );
}
