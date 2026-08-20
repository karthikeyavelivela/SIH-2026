'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MuthaResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { QRCodeDisplay } from '@/components/ui/QRCodeDisplay';
import { CameraIcon, CheckIcon } from '@/components/ui/icons';

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/30 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/60 transition-colors duration-fast focus:border-ip-secondary focus:ring-2 focus:ring-ip-secondary/20';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Stitch's `create_mutha_group` screen maps to a group-SETTINGS screen
// here, not a second-group-creation flow — a mutha_leader account only
// ever has the one group it was created with at signup (signupHamali,
// joinType: 'leader'; getMyMutha and every matching-service lookup assume
// findOne({ leaderId })). This edits that existing group's name/region/
// photo and surfaces the same invite-code/QR sharing block the Stitch
// design specs, scoped to the group the leader already has.
export default function MuthaGroupSettingsPage() {
  const { data, reload } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setName(data.mutha.name);
      setRegion(data.mutha.region ?? '');
      setSeeded(true);
    }
  }, [data, seeded]);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = await readAsDataUrl(file);
    setPhotoPreview(url);
  }

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch('/api/mutha/me', {
        name,
        region,
        ...(photoPreview ? { imageBase64: photoPreview } : {}),
      });
      setPhotoPreview(null);
      await reload();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save your group settings.');
    } finally {
      setPending(false);
    }
  }

  async function copyCode() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.mutha.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be denied by browser permissions — the code is
      // already visible on screen to copy by hand, so this fails silently.
    }
  }

  const photoUrl = photoPreview ?? data?.mutha.photo;

  return (
    <div className="max-w-lg mx-auto pb-8">
      <BackHeader title="Group settings" fallbackHref="/mutha/dashboard" />

      <div className="px-5 pt-5">
        <p className="text-sm text-ip-on-surface-variant mb-6">Update your Mutha group's name, region, and photo.</p>

        <div className="ip-card mb-6">
          <div className="flex flex-col items-center mb-5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="relative w-20 h-20 rounded-full bg-ip-surface-container-high flex items-center justify-center overflow-hidden mb-2"
              aria-label="Change group photo"
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <CameraIcon className="w-6 h-6 text-ip-on-surface-variant" />
              )}
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant">Group photo</p>
          </div>

          <label className="block mb-4">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Mutha name
            </span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Red Lions"
              maxLength={80}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Operating region
            </span>
            <input
              className={inputClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g. Visakhapatnam"
              maxLength={80}
            />
          </label>
        </div>

        <h2 className="font-heading text-lg font-bold mb-1">Invite members</h2>
        <p className="text-sm text-ip-on-surface-variant mb-3">
          New members sign up as a Hamali, choose "Join a group", and enter this code.
        </p>

        <div className="ip-card mb-6 flex flex-col items-center">
          {data && <QRCodeDisplay value={data.mutha.inviteCode} className="mb-4" />}
          <div className="flex items-center gap-2 w-full">
            <p className="flex-1 text-center font-heading text-lg font-bold tracking-[0.2em] text-ip-secondary">
              {data?.mutha.inviteCode ?? '········'}
            </p>
            <button
              type="button"
              onClick={copyCode}
              className="flex-shrink-0 w-9 h-9 rounded-full bg-ip-surface-container-high flex items-center justify-center text-ip-on-surface-variant"
              aria-label="Copy invite code"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-ip-secondary" /> : <span className="text-xs font-bold">⧉</span>}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-4 py-3 text-sm text-ip-on-error-container">
            {error}
          </div>
        )}
        {saved && !error && (
          <div role="status" className="mb-4 rounded-ip-input border border-ip-secondary/30 bg-ip-secondary-container/20 px-4 py-3 text-sm text-ip-secondary">
            Saved.
          </div>
        )}

        <Button variant="secondary" size="lg" className="w-full" disabled={pending || !name.trim()} onClick={save}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
