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
    <div>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative block disabled:opacity-60"
        aria-label="Change profile photo"
      >
        <Avatar name={name} photoUrl={photoUrl} accent={accent} size="lg" />
        <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface-raised border border-border shadow-sm flex items-center justify-center">
          <CameraIcon className="w-3.5 h-3.5 text-text-muted" />
        </span>
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
