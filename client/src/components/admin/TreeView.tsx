import { useTranslations } from 'next-intl';
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
  const t = useTranslations('treeView');
  return (
    <div className="flex flex-col items-start gap-4 w-full min-w-0" role="tree" aria-label="Admin organization tree">
      <Card
        elevation="raised"
        className="border-2 border-primary-600/30 bg-gradient-to-br from-primary/5 to-transparent"
        role="treeitem"
        aria-level={1}
      >
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary-600 mb-1.5">{t('adminRoot')}</p>
        <p className="font-heading font-semibold text-lg">{adminName}</p>
      </Card>
      <div
        className="pl-8 border-l-2 border-border-strong ml-4 flex flex-col gap-3 w-full"
        role="group"
        aria-label="Managers"
      >
        {managers.length === 0 && (
          <p className="text-sm text-text-muted py-4">{t('noManagersYet')}</p>
        )}
        {managers.map((m) => (
          <Card
            key={m._id}
            elevation="raised"
            className="flex flex-col gap-3 transition-shadow duration-base hover:shadow-lg"
            role="treeitem"
            aria-level={2}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-heading font-semibold">{m.name}</p>
              <span className="text-xs text-text-muted whitespace-nowrap">{m.phone}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.permissions.length === 0 && <Badge tone="muted">{t('noPermissions')}</Badge>}
              {m.permissions.map((p) => (
                <Badge key={p} tone="secondary">
                  {p}
                </Badge>
              ))}
            </div>
            {onEditManager && (
              <div className="pt-2 border-t border-border">
                <Button variant="ghost" onClick={() => onEditManager(m)} aria-label={t('editPermissionsAria', { name: m.name })}>
                  {t('editPermissions')}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
