interface AvatarProps {
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  accent?: 'primary' | 'secondary';
  status?: 'online' | 'offline' | 'on_job';
  className?: string;
}

const sizeClasses = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
};

const dotSize = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3.5 h-3.5',
};

const statusColor = {
  online: 'bg-emerald-500',
  on_job: 'bg-amber-500',
  offline: 'bg-text-muted/50',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Shared avatar — photo when we have one (worker/customer profilePhoto),
// initials-on-tint otherwise, with an optional live-status dot. Replaces
// the half-dozen hand-rolled "initials in a circle" divs that were
// duplicated across AssignedRow, member cards, and profile headers.
export function Avatar({ name, photoUrl, size = 'md', accent = 'primary', status, className = '' }: AvatarProps) {
  const tint = accent === 'primary' ? 'bg-primary/15 text-primary-600' : 'bg-secondary/15 text-secondary-600';
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover border border-border`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full font-heading font-bold flex items-center justify-center ${tint}`}
        >
          {initials(name)}
        </div>
      )}
      {status && (
        <span
          className={`absolute bottom-0 right-0 ${dotSize[size]} rounded-full ${statusColor[status]} border-2 border-surface-raised`}
          aria-label={status === 'on_job' ? 'On a job' : status === 'online' ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}
