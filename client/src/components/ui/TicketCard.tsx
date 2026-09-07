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
      className={`w-full flex items-center justify-between gap-3 py-4 text-left ${onClick ? 'active:bg-fy-well rounded-control -mx-2 px-2 transition-colors' : ''}`}
    >
      <div className="min-w-0">
        <p className="text-xs font-mono text-fy-ink-soft">#{ticketId}</p>
        <p className="text-sm font-semibold text-fy-ink truncate">{title}</p>
        <p className="text-xs text-fy-muted">{updatedAt}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusChip tone={statusTone}>{status}</StatusChip>
        {trailing}
      </div>
    </Wrapper>
  );
}
