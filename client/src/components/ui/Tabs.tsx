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
// indicator on the active tab in the accent-console slate, per admin/
// console screens' tertiary color; product-facing pages restyle via
// className if a different accent reads better.
export function Tabs({ tabs, active, onChange, className = '' }: TabsProps) {
  return (
    <div role="tablist" className={`flex items-center gap-1 border-b border-[color:var(--hairline)] overflow-x-auto [&::-webkit-scrollbar]:hidden ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`relative px-4 py-3 font-body text-label-ui whitespace-nowrap transition-colors ${
              isActive ? 'text-fyro-ink font-semibold' : 'text-ip-on-surface-variant hover:text-fyro-ink'
            }`}
          >
            {tab.label}
            {isActive && <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-fyro-ink rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}
