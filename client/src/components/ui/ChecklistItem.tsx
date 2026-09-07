type ChecklistState = 'pass' | 'warn' | 'fail' | 'pending';

interface ChecklistItemProps {
  label: string;
  state: ChecklistState;
  note?: string;
  onStateChange?: (state: ChecklistState) => void;
}

const stateStyle: Record<ChecklistState, string> = {
  pass: 'bg-fy-lime/35 text-fy-green',
  warn: 'bg-fy-peach text-fy-brown',
  fail: 'bg-fy-error-bg text-fy-on-error-bg',
  pending: 'bg-fy-well text-fy-ink-soft',
};

const stateLabel: Record<ChecklistState, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', pending: 'Pending' };
const CYCLE: ChecklistState[] = ['pending', 'pass', 'warn', 'fail'];

// Vehicle inspection checklist row (engine & fluids, tyres & brakes,
// lights & signals, documents) — each item cycles pass/warn/fail with
// notes. Read-only (no onStateChange) for cargo-verification checklists
// that are system-derived rather than inspector-entered.
export function ChecklistItem({ label, state, note, onStateChange }: ChecklistItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fy-ink">{label}</p>
        {note && <p className="text-xs text-fy-ink-soft truncate">{note}</p>}
      </div>
      <button
        type="button"
        disabled={!onStateChange}
        onClick={() => onStateChange?.(CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length])}
        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${stateStyle[state]} ${onStateChange ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {stateLabel[state]}
      </button>
    </div>
  );
}
