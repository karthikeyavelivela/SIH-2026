import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface ManagerNode {
  _id: string;
  name: string;
  phone: string;
  permissions: string[];
}

interface TreeViewProps {
  adminName: string;
  managers: ManagerNode[];
  // Presentational component stays free of API calls (data fetching/mutation
  // stays in the page) — the page passes this handler to open its own edit
  // flow, this component just renders the trigger.
  onEditManager?: (manager: ManagerNode) => void;
}

export function TreeView({ adminName, managers, onEditManager }: TreeViewProps) {
  return (
    <div className="flex flex-col items-start gap-4" role="tree" aria-label="Admin organization tree">
      <Card className="border-2 border-primary/40" role="treeitem" aria-level={1}>
        <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Admin (root)</p>
        <p className="font-heading font-semibold">{adminName}</p>
      </Card>
      <div
        className="pl-8 border-l-2 border-black/10 ml-4 flex flex-col gap-3 w-full"
        role="group"
        aria-label="Managers"
      >
        {managers.length === 0 && <p className="text-sm text-text-muted">No managers yet.</p>}
        {managers.map((m) => (
          <Card key={m._id} className="flex flex-col gap-2" role="treeitem" aria-level={2}>
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
            {onEditManager && (
              <div>
                <Button variant="ghost" onClick={() => onEditManager(m)} aria-label={`Edit permissions for ${m.name}`}>
                  Edit permissions
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
