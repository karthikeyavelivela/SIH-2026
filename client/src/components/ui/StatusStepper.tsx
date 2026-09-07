interface Step {
  label: string;
  description?: string;
}

interface StatusStepperProps {
  steps: Step[];
  activeIndex: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

// Numbered step progress — "How FYRO works", trip status timeline,
// onboarding flows. Filled circle up to activeIndex, connecting line
// tracks progress.
export function StatusStepper({ steps, activeIndex, orientation = 'vertical', className = '' }: StatusStepperProps) {
  if (orientation === 'horizontal') {
    return (
      <div className={`flex items-center ${className}`}>
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i <= activeIndex ? 'bg-fy-brown' : 'bg-fy-hairline'}`}
              aria-current={i === activeIndex ? 'step' : undefined}
            />
            {i < steps.length - 1 && (
              <span className={`h-0.5 flex-1 ${i < activeIndex ? 'bg-fy-brown' : 'bg-fy-hairline'}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <ol className={`flex flex-col ${className}`}>
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-4">
          <div className="flex flex-col items-center">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-heading font-bold flex-shrink-0 ${
                i <= activeIndex ? 'bg-fy-brown text-fy-on-brown' : 'bg-fy-well text-fy-ink-soft'
              }`}
              aria-current={i === activeIndex ? 'step' : undefined}
            >
              {i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className={`w-0.5 flex-1 min-h-[24px] ${i < activeIndex ? 'bg-fy-brown' : 'bg-fy-hairline'}`} />
            )}
          </div>
          <div className="pb-6">
            <p className="font-heading font-bold text-sm text-fy-ink">{s.label}</p>
            {s.description && <p className="text-label text-fy-ink-soft">{s.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
