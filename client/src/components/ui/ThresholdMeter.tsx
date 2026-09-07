interface ThresholdMeterProps {
  currentValue: number;
  thresholdValue: number;
  unit?: string;
  /** e.g. "If you earn below ₹8,000 this month, ₹2,000 is paid automatically — no claim needed." */
  explainer: string;
  triggered?: boolean;
  /**
   * Present when triggered but NOT auto-paid (kill switch, a cap, or a
   * failed disbursement retry — see parametricInsurance.service.ts's
   * disburseParametricPayout). Without this, the meter's own "payout
   * sent" label was claiming money moved even on the exact runs where
   * Phase 1.4's caps/kill-switch left it pending for a human — the
   * literal thing this whole remediation exists to stop happening.
   */
  payoutFailureReason?: string;
}

// Parametric-insurance trigger, shown as a plain-language threshold bar —
// per the spec: "no claims process... show the trigger visually as a
// threshold meter in plain language." Bar fills from 0 to thresholdValue's
// position; currentValue's marker shows where the person actually is.
export function ThresholdMeter({
  currentValue,
  thresholdValue,
  unit = '₹',
  explainer,
  triggered = false,
  payoutFailureReason,
}: ThresholdMeterProps) {
  const scaleMax = Math.max(currentValue, thresholdValue) * 1.4 || 1;
  const currentPct = Math.min(100, (currentValue / scaleMax) * 100);
  const thresholdPct = Math.min(100, (thresholdValue / scaleMax) * 100);
  const autoPaid = triggered && !payoutFailureReason;

  return (
    <div className="fy-surface-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-label font-semibold uppercase tracking-wide text-fy-ink-soft">Parametric trigger</p>
        {autoPaid && <span className="text-xs font-bold text-fy-green">Triggered — payout sent</span>}
        {triggered && payoutFailureReason && (
          <span className="text-xs font-bold text-fy-brown">Triggered — pending review</span>
        )}
      </div>
      {triggered && payoutFailureReason && (
        <p className="text-xs text-fy-brown bg-fy-peach rounded-control px-3 py-2 mb-2">
          Your condition was met, but the automatic payout is on hold: {payoutFailureReason} A human will review and
          release it.
        </p>
      )}
      <div className="relative h-3 rounded-full bg-fy-well mb-2 mt-4">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${triggered ? 'bg-fy-green' : 'bg-fy-brown'}`}
          style={{ width: `${currentPct}%` }}
        />
        <div
          className="absolute -top-4 flex flex-col items-center -translate-x-1/2"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        >
          <span className="text-[10px] font-bold text-fy-ink-soft">threshold</span>
          <span className="w-0.5 h-3 bg-fy-ink-soft" />
        </div>
      </div>
      <div className="flex justify-between text-xs text-fy-ink-soft mb-3">
        <span>
          You: {unit}
          {currentValue.toLocaleString('en-IN')}
        </span>
        <span>
          Threshold: {unit}
          {thresholdValue.toLocaleString('en-IN')}
        </span>
      </div>
      <p className="text-sm text-fy-ink">{explainer}</p>
    </div>
  );
}
