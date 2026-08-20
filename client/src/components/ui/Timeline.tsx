import { ReactNode } from 'react';

interface TimelineEvent {
  id: string;
  label: string;
  timestamp: string;
  icon?: ReactNode;
  tone?: 'default' | 'primary' | 'danger';
}

interface TimelineProps {
  events: TimelineEvent[];
  className?: string;
}

const dotTone = { default: 'bg-ip-outline', primary: 'bg-ip-primary', danger: 'bg-ip-error' } as const;

// Vertical event log — audit trail entries, gate feed, dispute
// communication log. Newest-first is the caller's responsibility (pass
// events pre-sorted).
export function Timeline({ events, className = '' }: TimelineProps) {
  return (
    <ol className={className}>
      {events.map((e, i) => (
        <li key={e.id} className="flex gap-ip-sm">
          <div className="flex flex-col items-center">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${dotTone[e.tone ?? 'default']}`} />
            {i < events.length - 1 && <span className="w-px flex-1 min-h-[20px] bg-ip-outline/20" />}
          </div>
          <div className="pb-ip-sm min-w-0 flex-1">
            <p className="text-sm text-ip-on-surface flex items-center gap-1.5">
              {e.icon}
              {e.label}
            </p>
            <p className="text-xs text-ip-on-surface-variant">{e.timestamp}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
