interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}

// The +/- worker-count / hamali-count control (booking form) and the
// tonnage-adjacent quantity fields — distinct from StatusStepper.tsx,
// which is a step-PROGRESS indicator, not a numeric input.
export function NumberStepper({ value, onChange, min = 0, max = 999, label, className = '' }: NumberStepperProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {label && <span className="font-body text-body-default text-ip-on-surface-variant">{label}</span>}
      <div className="inline-flex items-center rounded-control border border-fyro-ink/15 overflow-hidden">
        <button
          type="button"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label="Decrease"
          className="w-10 h-10 flex items-center justify-center text-fyro-ink hover:bg-fyro-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className="w-10 text-center font-heading tabular-nums text-body-strong text-fyro-ink">{value}</span>
        <button
          type="button"
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label="Increase"
          className="w-10 h-10 flex items-center justify-center text-fyro-ink hover:bg-fyro-ink/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
}
