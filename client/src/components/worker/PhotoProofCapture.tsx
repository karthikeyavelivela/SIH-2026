'use client';

import { useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface PhotoProofCaptureProps {
  bookingId: string;
  stage: 'pickup' | 'delivery';
  existingUrl?: string;
  onUploaded: (url: string) => void;
  accent?: 'primary' | 'secondary';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Inline camera-capture step in the accept/start/complete status-button
// flow, not a separate menu item — "should feel like a natural part of
// finishing the step" per PRODUCT.md's real-world feature spec. Blocks the
// next status transition until a photo exists for this stage, same
// dispute-reduction value as Ola/Porter's pickup/delivery proof.
export function PhotoProofCapture({ bookingId, stage, existingUrl, onUploaded, accent = 'primary' }: PhotoProofCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file if retaken
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const imageBase64 = await readAsDataUrl(file);
      const res = await api.post<{ booking: { proofPhotos: { pickup?: string; delivery?: string } } }>(
        `/api/requests/${bookingId}/proof-photo`,
        { stage, imageBase64 }
      );
      onUploaded(res.booking.proofPhotos[stage] ?? '');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not upload photo — try again.');
    } finally {
      setUploading(false);
    }
  }

  const label = stage === 'pickup' ? 'Take pickup photo' : 'Take delivery photo';
  const tone = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';

  return (
    <div className="mb-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      {existingUrl ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-3">
          <img src={existingUrl} alt={`${stage} proof`} className="w-14 h-14 rounded-md object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{stage === 'pickup' ? 'Pickup' : 'Delivery'} photo captured</p>
            <button type="button" onClick={() => inputRef.current?.click()} className={`text-xs font-semibold ${tone}`}>
              Retake
            </button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : label}
        </Button>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
