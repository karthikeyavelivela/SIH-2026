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
      <p className="text-sm font-medium mb-2">Permissions</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {PERMISSION_OPTIONS.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => togglePermission(p)}
            aria-pressed={permissions.includes(p)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              permissions.includes(p) ? 'bg-secondary text-white border-secondary' : 'border-black/10'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-3">
        <input
          placeholder="Region name (e.g. Visakhapatnam)"
          aria-label="Region name"
          value={regionInput}
          onChange={(e) => setRegionInput(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl border border-black/10 bg-background text-sm"
        />
        <Button type="button" variant="ghost" onClick={addRegion}>
          Add region scope
        </Button>
      </div>
      {permissions.length > 0 && (
        <div>
          <p className="text-xs text-text-muted mb-1">Selected:</p>
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
