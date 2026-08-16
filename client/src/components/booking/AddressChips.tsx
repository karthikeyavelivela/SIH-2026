'use client';

import { useState } from 'react';
import { SavedAddress } from '@/lib/useSavedAddresses';
import { GeoPoint } from '@/components/booking/AddressField';
import { MapPinIcon } from '@/components/ui/icons';

interface AddressChipsProps {
  saved: SavedAddress[];
  onPick: (point: GeoPoint) => void;
  /** e.g. a "Same as pickup" quick action — hamali/combo jobs often don't need a separate drop. */
  extraChip?: { label: string; onClick: () => void };
  /** Offer to save the currently-selected point under a new name. */
  currentValue: GeoPoint | null;
  onSave: (label: string, point: GeoPoint) => Promise<void>;
}

// "Address can be saved with multiple names" (Home/Work/Site) — a chip row
// under each address field, plus an inline (not window.prompt) way to save
// whatever's currently entered under a new label.
export function AddressChips({ saved, onPick, extraChip, currentValue, onSave }: AddressChipsProps) {
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const alreadySaved = currentValue && saved.some((s) => s.address === currentValue.address);

  async function confirmSave() {
    if (!currentValue || !label.trim()) return;
    setBusy(true);
    try {
      await onSave(label.trim(), currentValue);
      setSaving(false);
      setLabel('');
    } finally {
      setBusy(false);
    }
  }

  if (saved.length === 0 && !extraChip && (!currentValue || alreadySaved)) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {extraChip && (
        <button
          type="button"
          onClick={extraChip.onClick}
          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/10 text-secondary-600 hover:bg-secondary/20 transition-colors duration-fast"
        >
          {extraChip.label}
        </button>
      )}
      {saved.map((s) => (
        <button
          key={s._id}
          type="button"
          onClick={() => onPick({ lat: s.coordinates[1], lng: s.coordinates[0], address: s.address })}
          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface border border-border text-text-primary hover:bg-surface-raised transition-colors duration-fast"
        >
          <MapPinIcon className="w-3 h-3" />
          {s.label}
        </button>
      ))}
      {currentValue && !alreadySaved && !saving && (
        <button
          type="button"
          onClick={() => setSaving(true)}
          className="text-xs font-semibold text-text-muted underline"
        >
          Save this address
        </button>
      )}
      {saving && (
        <span className="inline-flex items-center gap-1.5">
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Home"
            maxLength={40}
            className="w-24 min-h-[28px] px-2 py-1 rounded-full border border-border bg-background text-xs"
          />
          <button
            type="button"
            disabled={!label.trim() || busy}
            onClick={confirmSave}
            className="text-xs font-semibold text-primary-600 disabled:opacity-40"
          >
            {busy ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => setSaving(false)} className="text-xs text-text-muted">
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}
