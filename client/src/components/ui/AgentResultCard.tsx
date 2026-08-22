'use client';

import { useState } from 'react';
import { ChevronRightIcon } from '@/components/ui/icons';

export interface AgentEvidenceItem {
  label: string;
  value: string;
}

export interface AgentResult {
  agentName: string;
  summary: string;
  confidence: 'low' | 'moderate' | 'high';
  evidence: AgentEvidenceItem[];
  mock: boolean;
  generatedAt: string;
}

const CONFIDENCE_LABEL: Record<AgentResult['confidence'], string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};
const CONFIDENCE_FILLED: Record<AgentResult['confidence'], number> = { low: 1, moderate: 2, high: 3 };

/**
 * Phase 4 mandatory UI guardrails, applied uniformly to every agent
 * surface in the app rather than reimplemented per screen: a 2px accent
 * left rule + small "AI" chip so a recommendation is never visually
 * confused with a human-authored one, a three-segment confidence bar
 * with a plain word (never a percentage — a fabricated-precision number
 * would overstate what a low-data or mock-mode result actually knows),
 * an evidence section that's as visually prominent as the conclusion
 * (open by default, not a collapsed afterthought), and a closing
 * "Recommended, not applied" line — the agent never acted on anything,
 * whatever human decision follows happens through the existing, separate
 * action control this card sits next to (resolveDispute, updateKycStatus,
 * etc.), never through this component.
 */
export function AgentResultCard({ result, accent = 'primary' }: { result: AgentResult; accent?: 'primary' | 'secondary' }) {
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const borderColor = accent === 'primary' ? 'border-l-ip-primary' : 'border-l-ip-secondary';
  const chipColor = accent === 'primary' ? 'bg-ip-primary text-white' : 'bg-ip-secondary text-white';

  return (
    <div className={`ip-card border-l-[3px] ${borderColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${chipColor}`}>
          AI
        </span>
        {result.mock && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ip-on-surface-variant px-1.5 py-0.5 rounded border border-ip-outline/30">
            Demo mode — no live model call
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-ip-on-surface-variant mr-1">{CONFIDENCE_LABEL[result.confidence]} confidence</span>
          {[1, 2, 3].map((seg) => (
            <span
              key={seg}
              className={`w-4 h-1.5 rounded-full ${seg <= CONFIDENCE_FILLED[result.confidence] ? chipColor.split(' ')[0] : 'bg-ip-outline/20'}`}
            />
          ))}
        </div>
      </div>

      <p className="text-sm text-ip-on-surface mb-3">{result.summary}</p>

      {result.evidence.length > 0 && (
        <div className="border-t border-ip-outline/10 pt-2.5">
          <button
            type="button"
            onClick={() => setEvidenceOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-semibold text-ip-on-surface-variant mb-2"
          >
            <ChevronRightIcon className={`w-3.5 h-3.5 transition-transform ${evidenceOpen ? 'rotate-90' : ''}`} />
            Evidence ({result.evidence.length})
          </button>
          {evidenceOpen && (
            <div className="space-y-1.5">
              {result.evidence.map((e, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-ip-on-surface-variant">{e.label}</span>
                  <span className="font-medium text-right">{e.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-ip-on-surface-variant italic mt-3 pt-2.5 border-t border-ip-outline/10">
        Recommended, not applied — a human decides.
      </p>
    </div>
  );
}
