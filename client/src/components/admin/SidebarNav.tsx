'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Grays out + strips the link (still visible, per RBAC rule: hidden not disabled — pass an ungranted item's condition upstream and omit it instead). */
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  className?: string;
}

// Vertical nav for dense admin/ops/fleet-owner/warehouse-hub desk surfaces
// (operations_manager_hub, partner_fleet_dashboard, warehouse_hub_dashboard).
// Per RBAC rule in the build spec: ungranted sections must be omitted from
// `items` by the caller — this component never renders a disabled item.
export function SidebarNav({ items, className = '' }: SidebarNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Section navigation" className={`flex flex-col gap-1 ${className}`}>
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-ip-input text-sm font-semibold transition-colors ${
              active
                ? 'bg-ip-primary-container/20 text-ip-primary'
                : 'text-ip-on-surface-variant hover:bg-ip-surface-container'
            }`}
          >
            {item.icon && <span aria-hidden="true">{item.icon}</span>}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
