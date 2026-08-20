interface ThresholdMeterProps {
  currentValue: number;
  thresholdValue: number;
  unit?: string;
  /** e.g. "If you earn below ₹8,000 this month, ₹2,000 is paid automatically — no claim needed." */
  explainer: string;
  triggered?: boolean;
}

// Parametric-insurance trigger, shown as a plain-language threshold bar —
// per the spec: "no claims process... show the trigger visually as a
// threshold meter in plain language." Bar fills from 0 to thresholdValue's
// position; currentValue's marker shows where the person actually is.
export function ThresholdMeter({ currentValue, thresholdValue, unit = '₹', explainer, triggered = false }: ThresholdMeterProps) {
  const scaleMax = Math.max(currentValue, thresholdValue) * 1.4 || 1;
  const currentPct = Math.min(100, (currentValue / scaleMax) * 100);
  const thresholdPct = Math.min(100, (thresholdValue / scaleMax) * 100);

  return (
    <div className="ip-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-ip-body-sm font-semibold uppercase tracking-wide text-ip-on-surface-variant">Parametric trigger</p>
        {triggered && <span className="text-xs font-bold text-emerald-700">Triggered — payout sent</span>}
      </div>
      <div className="relative h-3 rounded-ip-pill bg-ip-surface-container-high mb-2 mt-4">
        <div
          className={`absolute inset-y-0 left-0 rounded-ip-pill ${triggered ? 'bg-emerald-500' : 'bg-ip-primary'}`}
          style={{ width: `${currentPct}%` }}
        />
        <div
          className="absolute -top-4 flex flex-col items-center -translate-x-1/2"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        >
          <span className="text-[10px] font-bold text-ip-on-surface-variant">threshold</span>
          <span className="w-0.5 h-3 bg-ip-on-surface-variant" />
        </div>
      </div>
      <div className="flex justify-between text-xs text-ip-on-surface-variant mb-3">
        <span>
          You: {unit}
          {currentValue.toLocaleString('en-IN')}
        </span>
        <span>
          Threshold: {unit}
          {thresholdValue.toLocaleString('en-IN')}
        </span>
      </div>
      <p className="text-sm text-ip-on-surface">{explainer}</p>
    </div>
  );
}
