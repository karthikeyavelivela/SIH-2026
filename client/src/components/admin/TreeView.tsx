import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface ManagerNode {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

export function TreeView({ adminName, managers }: { adminName: string; managers: ManagerNode[] }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Card className="border-2 border-primary/40">
        <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Admin (root)</p>
        <p className="font-heading font-semibold">{adminName}</p>
      </Card>
      <div className="pl-8 border-l-2 border-black/10 ml-4 flex flex-col gap-3 w-full">
        {managers.length === 0 && <p className="text-sm text-text-muted">No managers yet.</p>}
        {managers.map((m) => (
          <Card key={m._id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="font-medium">{m.name}</p>
              <span className="text-xs text-text-muted">{m.phone}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.permissions.length === 0 && <Badge tone="muted">No permissions granted</Badge>}
              {m.permissions.map((p) => (
                <Badge key={p} tone="secondary">
                  {p}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
