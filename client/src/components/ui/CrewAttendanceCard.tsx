import { Avatar } from './Avatar';
import { StatusChip } from './StatusChip';

interface CrewAttendanceCardProps {
  name: string;
  photoUrl?: string;
  status: 'on_job' | 'available' | 'offline';
  currentTask?: string;
  onClick?: () => void;
}

const statusTone = { on_job: 'primary', available: 'success', offline: 'muted' } as const;
const statusLabel = { on_job: 'On job', available: 'Available', offline: 'Offline' } as const;

// Mutha crew roster row — mutha_leader_dashboard / mutha_group_dashboard's
// "Live Members" list, split-across-sites view.
export function CrewAttendanceCard({ name, photoUrl, status, currentTask, onClick }: CrewAttendanceCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-ip-sm py-ip-xs text-left ${onClick ? 'active:bg-ip-surface-container-high rounded-ip-input -mx-2 px-2 transition-colors' : ''}`}
    >
      <Avatar name={name} photoUrl={photoUrl} size="sm" status={status === 'on_job' ? 'on_job' : status === 'available' ? 'online' : 'offline'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ip-on-surface truncate">{name}</p>
        {currentTask && <p className="text-xs text-ip-on-surface-variant truncate">{currentTask}</p>}
      </div>
      <StatusChip tone={statusTone[status]}>{statusLabel[status]}</StatusChip>
    </Wrapper>
  );
}
