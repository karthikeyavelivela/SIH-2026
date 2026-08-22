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
}

// Spec: rating is mandatory before the rater's next booking/job — the
// server enforces that (see ratingGate.service.ts), this modal is the
// proactive prompt so the rater hits it here first instead of discovering
// the gate via a rejected next action.
export function RatingModal({ bookingId, open, onDone, accent = 'primary', title }: RatingModalProps) {
  const t = useTranslations('worker.ratingModal');
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const starColor = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';

  return (
    <Modal open={open} onClose={() => {}} title={title ?? t('defaultTitle')}>
      <p className="text-sm text-text-muted mb-5">{t('feedbackHint')}</p>
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
        className="w-full px-4 py-2.5 rounded-md border border-border bg-background text-sm placeholder:text-text-muted/70 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 transition-colors duration-fast mb-4"
      />
      {error && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        variant={accent === 'primary' ? 'primary' : 'secondary'}
        disabled={submitting}
        onClick={submit}
      >
        {submitting ? t('submitting') : t('submitRating')}
      </Button>
    </Modal>
  );
}
