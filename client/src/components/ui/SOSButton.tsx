'use client';

import { useRef, useState } from 'react';

interface SOSButtonProps {
  onTrigger: () => void;
  holdMs?: number;
  size?: number;
}

// Press-and-hold SOS — per spec, exactly 3 seconds by default, so it can't
// fire from an accidental tap. A visible ring fills over the hold duration
// so the person can see the trigger coming and let go if it's a mistake.
export function SOSButton({ onTrigger, holdMs = 3000, size = 140 }: SOSButtonProps) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number>();
  const start = useRef<number>(0);
  const firing = useRef(false);

  function tick(now: number) {
    const elapsed = now - start.current;
    const pct = Math.min(1, elapsed / holdMs);
    setProgress(pct);
    if (pct >= 1) {
      if (!firing.current) {
        firing.current = true;
        onTrigger();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }

  function beginHold() {
    firing.current = false;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    if (raf.current) cancelAnimationFrame(raf.current);
    setProgress(0);
  }

  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      type="button"
      onPointerDown={beginHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      aria-label="Press and hold 3 seconds for emergency SOS"
      className="relative inline-flex items-center justify-center select-none touch-none"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--ip-error-container)" strokeWidth={5} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--ip-error)"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="w-[76%] h-[76%] rounded-full bg-ip-error text-ip-on-error flex flex-col items-center justify-center font-heading font-extrabold">
        <span className="text-lg">SOS</span>
        <span className="text-[10px] font-normal opacity-90">Hold 3s</span>
      </div>
    </button>
  );
}
