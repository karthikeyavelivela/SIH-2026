import { Avatar } from './Avatar';

interface StackedPerson {
  name: string;
  photoUrl?: string;
}

interface AvatarStackProps {
  people: StackedPerson[];
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

// Overlapping avatars with a "+N" overflow tile — Mutha crew rosters,
// warehouse hub on-site Hamali groups, fleet driver lists.
export function AvatarStack({ people, max = 4, size = 'sm', className = '' }: AvatarStackProps) {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  const dims = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm';

  return (
    <div className={`flex items-center ${className}`}>
      {visible.map((p, i) => (
        <div key={`${p.name}-${i}`} className="rounded-full ring-2 ring-ip-surface" style={{ marginLeft: i === 0 ? 0 : '-0.6rem' }}>
          <Avatar name={p.name} photoUrl={p.photoUrl} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`${dims} -ml-2.5 rounded-full ring-2 ring-ip-surface bg-ip-surface-container-high text-ip-on-surface-variant font-heading font-bold flex items-center justify-center`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
