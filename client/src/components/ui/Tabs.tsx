'use client';

interface Tab {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

// The primitive behind every "split this dense page into tabs" note in the
// redesign (governance, track, profile, admin drill-ins). Underline
// indicator on the active tab in the fy-slate slate, per admin/
// console screens' tertiary color; product-facing pages restyle via
// className if a different accent reads better.
export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div role="tablist" className={`flex items-center gap-1 border-b border-[color:var(--fy-hairline)] overflow-x-auto [&::-webkit-scrollbar]:hidden ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`relative px-4 py-3 font-body text-label whitespace-nowrap transition-colors ${
              isActive ? 'text-fy-ink font-semibold' : 'text-fy-ink-soft hover:text-fy-ink'
            }`}
          >
            {tab.label}
            {isActive && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-fy-ink rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}
