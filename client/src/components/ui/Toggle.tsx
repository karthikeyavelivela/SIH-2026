interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

// "Machined feel" per the brief — a solid, deliberate track/knob with a
// firm color change on check (fy-lime lime, since this is the exact
// control the worker online/offline toggle uses), not a soft iOS-style
// pastel switch.
export function Toggle({ checked, onChange, label, disabled = false, className = '' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-7 w-12 rounded-full transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-fy-lime' : 'bg-fy-edge'
      } ${className}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-fy-bone shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
