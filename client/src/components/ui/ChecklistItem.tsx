type ChecklistState = 'pass' | 'warn' | 'fail' | 'pending';

interface ChecklistItemProps {
  label: string;
  state: ChecklistState;
  note?: string;
  onStateChange?: (state: ChecklistState) => void;
}

const stateStyle: Record<ChecklistState, string> = {
  pass: 'bg-emerald-500/15 text-emerald-800',
  warn: 'bg-amber-500/15 text-amber-800',
  fail: 'bg-ip-error-container text-ip-on-error-container',
  pending: 'bg-ip-surface-container-high text-ip-on-surface-variant',
};

const stateLabel: Record<ChecklistState, string> = { pass: 'Pass', warn: 'Warn', fail: 'Fail', pending: 'Pending' };
const CYCLE: ChecklistState[] = ['pending', 'pass', 'warn', 'fail'];

// Vehicle inspection checklist row (engine & fluids, tyres & brakes,
// lights & signals, documents) — each item cycles pass/warn/fail with
// notes. Read-only (no onStateChange) for cargo-verification checklists
// that are system-derived rather than inspector-entered.
export function ChecklistItem({ label, state, note, onStateChange }: ChecklistItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-ip-sm">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ip-on-surface">{label}</p>
        {note && <p className="text-xs text-ip-on-surface-variant truncate">{note}</p>}
      </div>
      <button
        type="button"
        disabled={!onStateChange}
        onClick={() => onStateChange?.(CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length])}
        className={`flex-shrink-0 px-3 py-1 rounded-ip-pill text-xs font-semibold ${stateStyle[state]} ${onStateChange ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {stateLabel[state]}
      </button>
    </div>
  );
}
