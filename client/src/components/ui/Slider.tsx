import { InputHTMLAttributes } from 'react';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  valueLabel?: string;
}

// The bulk-labour tonnage slider (fyro_hamali_labour_bulk) and any other
// continuous-range input. Track fills in accent-labour up to the thumb.
export function Slider({ value, valueLabel, className = '', ...props }: SliderProps) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const pct = Math.min(100, Math.max(0, ((Number(value) - min) / (max - min)) * 100));
  return (
    <div className={className}>
      {valueLabel && <div className="font-heading text-data-metric tabular-nums text-fyro-ink mb-2">{valueLabel}</div>}
      <input
        type="range"
        value={value}
        className="w-full h-2 rounded-chip appearance-none cursor-pointer accent-[color:var(--accent-labour)]"
        style={{ background: `linear-gradient(to right, var(--accent-labour) ${pct}%, var(--ip-surface-container-highest) ${pct}%)` }}
        {...props}
      />
    </div>
  );
}
