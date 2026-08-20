import { ReactNode } from 'react';
import { StatusChip } from './StatusChip';

interface TicketCardProps {
  ticketId: string;
  title: string;
  status: string;
  statusTone?: 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';
  updatedAt: string;
  onClick?: () => void;
  trailing?: ReactNode;
}

// Support/dispute ticket summary row — fyro_support_center, help_support,
// dispute_refund_resolution queue.
export function TicketCard({ ticketId, title, status, statusTone = 'muted', updatedAt, onClick, trailing }: TicketCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 py-ip-sm text-left ${onClick ? 'active:bg-ip-surface-container-high rounded-ip-input -mx-2 px-2 transition-colors' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-mono text-ip-on-surface-variant">#{ticketId}</p>
        <p className="text-sm font-semibold text-ip-on-surface truncate">{title}</p>
        <p className="text-xs text-ip-outline">{updatedAt}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusChip tone={statusTone}>{status}</StatusChip>
        {trailing}
      </div>
    </Wrapper>
  );
}
