'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface DialSector {
  key: string;
  label: string;
  /** Material Symbols Outlined glyph name — see components/ui/Icon.tsx. */
  glyph: string;
}

interface RotaryDialProps {
  sectors: DialSector[]; // exactly 3, per Phase 1.1's spec
  activeKey: string;
  onChange: (key: string) => void;
  /** Rendered behind the dial, dimmed+blurred while expanded. */
  children: ReactNode;
}

type Mode = 'collapsed' | 'expanded' | 'rotating';

const IDLE_COLLAPSE_MS = 3000;
// Visible arc: bottom-left quarter of a disc centered at the viewport's
// top-right corner. Screen-space angle convention here is standard
// atan2(dy,dx) with y DOWN — 90deg points straight down, 180deg points
// straight left, so the visible quarter sweeps 90deg -> 180deg exactly,
// matching "only the bottom-left quarter is visible" for a corner-anchored
// disc. The fixed indicator sits at the bisector (135deg) — the brief
// calls this "45deg" meaning 45deg in from either edge of the 90deg sweep.
const ARC_START = 90;
const ARC_END = 180;
const ARC_SPAN = ARC_END - ARC_START; // 90
const WEDGE_SPAN = ARC_SPAN / 3; // 30deg each

function sectorCenterAngle(index: number) {
  return ARC_START + WEDGE_SPAN * index + WEDGE_SPAN / 2;
}

/**
 * The corner-anchored rotary mode switch (Phase 1.1). Built from scratch —
 * SVG geometry + real pointer/keyboard gesture handling, not a generated
 * tab bar. All three sectors' `children` content is expected to already be
 * mounted by the caller (see /customer/dashboard) and cross-faded via
 * `activeKey` — this component only ever draws the dial chrome and reports
 * intent through `onChange`; it never owns data-fetching or unmounts a
 * sector's subtree itself.
 */
export function RotaryDial({ sectors, activeKey, onChange, children }: RotaryDialProps) {
  const [mode, setMode] = useState<Mode>('collapsed');
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);

  const activeIndex = Math.max(0, sectors.findIndex((s) => s.key === activeKey));

  const scheduleCollapse = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!draggingRef.current) setMode('collapsed');
    }, IDLE_COLLAPSE_MS);
  }, []);

  const expand = useCallback(() => {
    setMode((m) => (m === 'rotating' ? m : 'expanded'));
    scheduleCollapse();
  }, [scheduleCollapse]);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  // The disc's own bounding box is always centered exactly on the
  // viewport's top-right corner by construction (see radius/style math
  // below) — so its geometric center IS the pivot, regardless of current
  // radius (expanded or collapsed).
  function angleFromPointer(clientX: number, clientY: number): number {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return sectorCenterAngle(activeIndex);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return Math.min(ARC_END, Math.max(ARC_START, deg));
  }

  function nearestSectorIndex(angle: number) {
    const clamped = Math.min(ARC_END - 0.01, Math.max(ARC_START, angle));
    return Math.min(sectors.length - 1, Math.floor((clamped - ARC_START) / WEDGE_SPAN));
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setMode('rotating');
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragAngle(angleFromPointer(e.clientX, e.clientY));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setDragAngle(angleFromPointer(e.clientX, e.clientY));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const finalAngle = angleFromPointer(e.clientX, e.clientY);
    const idx = nearestSectorIndex(finalAngle);
    setDragAngle(null);
    onChange(sectors[idx].key);
    expand();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(sectors[Math.max(0, activeIndex - 1)].key);
      expand();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(sectors[Math.min(sectors.length - 1, activeIndex + 1)].key);
      expand();
    }
  };

  const isExpanded = mode !== 'collapsed';
  // Radius ~45vw on mobile (capped for desktop) when expanded. Collapsed
  // mode doesn't scale this box down to a peeking circle any more — the
  // real Stitch screens (fyro_household_home etc) show a flat pill trigger
  // fixed below the header instead, not a corner sliver; see the pill
  // below. The disc itself only exists in the DOM while expanded/rotating.
  const R = 'min(45vw, 320px)';
  const discStyle: React.CSSProperties = {
    top: `calc(-1 * ${R})`,
    right: `calc(-1 * ${R})`,
    width: `calc(2 * ${R})`,
    height: `calc(2 * ${R})`,
  };
  const activeSector = sectors[activeIndex];

  return (
    <div className="relative">
      {/* Page content — dims + blurs while the dial is expanded/rotating,
          per the brief. Never unmounted: this is the cross-fade target
          for all three sector subtrees, owned by the caller. */}
      <div
        className={`transition-[filter,opacity] duration-base ease-out-expo ${
          isExpanded ? 'blur-[2px] opacity-70 pointer-events-none' : ''
        }`}
      >
        {children}
      </div>

      {/* Backdrop tap-to-collapse target, expanded mode only. */}
      {isExpanded && (
        <button
          type="button"
          aria-label="Collapse mode dial"
          className="fixed inset-0 z-30 cursor-default"
          onClick={() => setMode('collapsed')}
        />
      )}

      {/* Collapsed trigger — a flat pill fixed below the header, matching
          every real Stitch page screen's "Quick Rotary Dial Sliver"
          exactly (rounded-l-full, accent rule, active sector's glyph +
          label). Tapping it grows the full disc in from the corner. */}
      {!isExpanded && (
        <button
          type="button"
          aria-label={`Expand mode dial — currently ${activeSector?.label}`}
          onClick={expand}
          className="fixed top-16 right-0 z-40 flex items-center gap-1.5 pl-4 pr-2.5 py-2 bg-ip-primary-container/90 backdrop-blur-md rounded-l-full shadow-md text-ip-on-primary transition-transform active:scale-95"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-accent-labour rounded-r-full" aria-hidden="true" />
          <Icon name={activeSector?.glyph ?? 'tune'} size={18} className="text-accent-labour" />
          <span className="font-label-caps text-label-caps tracking-widest text-ip-on-primary-container uppercase">
            {activeSector?.label}
          </span>
        </button>
      )}

      <div
        hidden={!isExpanded}
        ref={dialRef}
        role="group"
        aria-label="Switch service mode"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="fixed z-40 rounded-full pointer-events-auto cursor-grab active:cursor-grabbing transition-[width,height,top,right] duration-slow ease-spring shadow-xl"
        style={{
          ...discStyle,
          // Box center = viewport corner by construction (see discStyle
          // above) — so the gradient/ring/indicator all radiate from the
          // box's true 50%/50% center, and the 3/4 of the circle that
          // falls above y=0 or right of x=100vw is simply off-viewport,
          // which is what makes only the bottom-left quarter visible; no
          // manual clipping needed.
          background: 'radial-gradient(circle at 50% 50%, var(--fyro-brown) 0%, #311c0e 65%, var(--fyro-ink) 100%)',
        }}
      >
          {/* Tactile milled-ring markings */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" viewBox="0 0 256 256" aria-hidden="true">
            <circle cx="128" cy="128" r="120" fill="none" stroke="var(--fyro-bone)" strokeOpacity="0.3" strokeWidth="0.75" strokeDasharray="2 6" />
            <circle cx="128" cy="128" r="95" fill="none" stroke="var(--fyro-bone)" strokeOpacity="0.25" strokeWidth="1.25" />
          </svg>

          {/* Fixed indicator notch — bisector of the visible quarter (135deg, i.e. 45deg in from either edge of the 90-180 sweep). */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 256 256" aria-hidden="true">
            <line x1="128" y1="128" x2="71" y2="185" stroke="var(--fyro-bone)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="71" cy="185" r="5" fill="var(--accent-labour)" />
          </svg>

          {/* Sector buttons */}
          {sectors.map((sector, i) => {
            const angle = i === activeIndex && dragAngle != null ? dragAngle : sectorCenterAngle(i);
            const rad = (angle * Math.PI) / 180;
            const iconRadiusPct = 34; // % of the disc box radius, inset from the rim
            const cxPct = 50 + iconRadiusPct * Math.cos(rad);
            const cyPct = 50 + iconRadiusPct * Math.sin(rad);
            const isActive = sector.key === activeKey;
            // Local tilt relative to the arc's own center — keeps icons
            // legible (max +-30deg) while still visually "following the
            // tangent" as the brief asks, per the geometry note above.
            const tilt = sectorCenterAngle(i) - (ARC_START + ARC_SPAN / 2);

            return (
              <button
                key={sector.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={sector.label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => { onChange(sector.key); expand(); }}
                onKeyDown={handleKeyDown}
                onFocus={expand}
                style={{ left: `${cxPct}%`, top: `${cyPct}%`, transform: `translate(-50%, -50%) rotate(${tilt}deg)` }}
                className={`absolute w-12 h-12 rounded-full flex items-center justify-center transition-all duration-base ${
                  isActive ? 'bg-accent-labour text-fyro-ink scale-110' : 'text-fyro-bone/70 hover:text-fyro-bone hover:scale-105'
                }`}
              >
                <Icon name={sector.glyph} size={22} />
              </button>
            );
          })}
      </div>
    </div>
  );
}
