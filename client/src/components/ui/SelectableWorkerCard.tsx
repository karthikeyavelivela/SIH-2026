import { Avatar } from './Avatar';

interface SelectableWorkerCardProps {
  name: string;
  photoUrl?: string;
  ratingAvg?: number;
  subtitle?: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

// Avatar + name + rating + checkbox — assign-crew-members-to-job,
// assign-Hamali-to-cargo-load flows (mutha leader, warehouse hub).
export function SelectableWorkerCard({ name, photoUrl, ratingAvg, subtitle, selected, disabled, onToggle }: SelectableWorkerCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      className={`w-full flex items-center gap-4 p-4 rounded-control text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        selected ? 'bg-fy-brown-soft/20' : 'hover:bg-fy-field'
      }`}
    >
      <Avatar name={name} photoUrl={photoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fy-ink truncate">{name}</p>
        <p className="text-xs text-fy-ink-soft truncate">
          {subtitle}
          {ratingAvg !== undefined && (subtitle ? ' · ' : '')}
          {ratingAvg !== undefined && `★ ${ratingAvg.toFixed(1)}`}
        </p>
      </div>
      <span
        className={`w-5 h-5 rounded-control flex-shrink-0 border-2 flex items-center justify-center ${
          selected ? 'bg-fy-brown border-fy-brown text-fy-on-brown' : 'border-fy-muted/40'
        }`}
        aria-hidden="true"
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}
