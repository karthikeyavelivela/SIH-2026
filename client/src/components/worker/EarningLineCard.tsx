import { EarningLine } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MapPinIcon } from '@/components/ui/icons';

// Doubles as this role's order history — every past job, not just the
// payout number, so "amount" always has real trip context next to it.
export function EarningLineCard({ line }: { line: EarningLine }) {
  return (
    <Card elevation="raised">
      <div className="flex items-start justify-between gap-3 mb-2">
        <Badge tone="success">Completed</Badge>
        <p className="font-heading font-bold whitespace-nowrap">₹{line.amount}</p>
      </div>
      <div className="space-y-1.5 mb-1.5">
        <div className="flex items-start gap-2">
          <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-muted" />
          <p className="text-xs text-text-muted truncate">{line.pickupAddress}</p>
        </div>
        <div className="flex items-start gap-2">
          <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-primary" />
          <p className="text-xs truncate">{line.dropAddress}</p>
        </div>
      </div>
      <p className="text-[11px] text-text-muted">
        {line.completedAt ? new Date(line.completedAt).toLocaleString() : ''}
      </p>
    </Card>
  );
}
