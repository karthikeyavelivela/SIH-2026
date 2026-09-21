'use client';

import { useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { CameraIcon } from '@/components/ui/icons';

interface AvatarUploadProps {
  name: string;
  photoUrl?: string;
  accent?: 'primary' | 'secondary';
  onUploaded: () => void; // caller re-fetches auth user (see auth-context's refetch)
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Editable avatar for every role's profile header — same base64-upload
// pattern as PhotoProofCapture, reusing the new /api/auth/me/photo
// endpoint. A small camera badge overlaid on the existing Avatar, not a
// separate "change photo" menu item.
export function AvatarUpload({ name, photoUrl, accent = 'primary', onUploaded }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const imageBase64 = await readAsDataUrl(file);
      await api.patch('/api/auth/me/photo', { imageBase64 });
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update photo — try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    // `relative` so the error can be positioned OUT of the layout below.
    <div className="relative">
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative block disabled:opacity-60"
        aria-label="Change profile photo"
      >
        <Avatar name={name} photoUrl={photoUrl} accent={accent} size="lg" />
        <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-fy-card border border-fy-hairline shadow-sm flex items-center justify-center">
          <CameraIcon className="w-3.5 h-3.5 text-fy-muted" />
        </span>
      </button>
      {/* Absolutely positioned, and deliberately so.
          This component is usually dropped into a `shrink-0` box beside a
          name and a status pill, so a sentence rendered in the normal flow
          could not wrap and shoved the whole row past the screen edge —
          "Photo storage is not switched on yet…" ran clean off the right
          of the profile card. Out of flow, it can be as long as it needs
          to be without moving anything. */}
      {error && (
        <p
          role="alert"
          className="absolute left-0 top-full z-10 mt-1.5 w-max max-w-[min(72vw,300px)] rounded-control bg-fy-error-bg px-3 py-2 font-body text-label text-fy-on-error-bg shadow-card"
        >
          {error}
        </p>
      )}
    </div>
  );
}
