'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const PERMISSION_OPTIONS = ['verify_kyc', 'resolve_complaints', 'edit_fare_rules', 'view_analytics'];

interface PermissionPickerProps {
  permissions: string[];
  onChange: (permissions: string[]) => void;
}

// Shared by the manager-create form and the edit-existing-manager panel.
// Renders the 4 fixed permission toggles, a region-scope add field, AND
// (unlike the original create-form-only version) every currently selected
// permission as a removable chip — including manage_region:<name> entries,
// which previously vanished from view the instant they were added with no
// way to review or undo them before submit.
export function PermissionPicker({ permissions, onChange }: PermissionPickerProps) {
  const [regionInput, setRegionInput] = useState('');

  function togglePermission(p: string) {
    onChange(permissions.includes(p) ? permissions.filter((x) => x !== p) : [...permissions, p]);
  }

  function addRegion() {
    const name = regionInput.trim();
    if (!name) return;
    const value = `manage_region:${name}`;
    if (!permissions.includes(value)) onChange([...permissions, value]);
    setRegionInput('');
  }

  function removePermission(p: string) {
    onChange(permissions.filter((x) => x !== p));
  }

  return (
    <div>
      <p className="text-sm font-semibold mb-3">Permissions</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {PERMISSION_OPTIONS.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => togglePermission(p)}
            aria-pressed={permissions.includes(p)}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all duration-fast ${
              permissions.includes(p)
                ? 'bg-secondary-600 text-white border-secondary-600 shadow-sm'
                : 'border-border-strong text-text-muted hover:border-secondary-600/50 hover:text-text-primary'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <input
          placeholder="Region name (e.g. Visakhapatnam)"
          aria-label="Region name"
          value={regionInput}
          onChange={(e) => setRegionInput(e.target.value)}
          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-md border border-border bg-background text-sm transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
        />
        <Button type="button" variant="ghost" onClick={addRegion}>
          Add region scope
        </Button>
      </div>
      {permissions.length > 0 && (
        <div className="rounded-md border border-border bg-surface/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Selected</p>
          <div className="flex flex-wrap gap-2">
            {permissions.map((p) => (
              <Badge key={p} tone="secondary" className="inline-flex items-center gap-1.5">
                {p}
                <button
                  type="button"
                  onClick={() => removePermission(p)}
                  aria-label={`Remove ${p}`}
                  className="hover:opacity-70"
                >
                  ✕
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
