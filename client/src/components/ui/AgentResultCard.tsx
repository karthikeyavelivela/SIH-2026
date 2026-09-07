'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
type AgentAccent = 'primary' | 'secondary' | 'household' | 'labour' | 'transport';

const ACCENT_BORDER: Record<AgentAccent, string> = {
  primary: 'border-l-ip-primary',
  secondary: 'border-l-ip-secondary',
  household: 'border-l-accent-household',
  labour: 'border-l-accent-labour',
  transport: 'border-l-accent-transport',
};
const ACCENT_CHIP: Record<AgentAccent, string> = {
  primary: 'bg-ip-primary text-white',
  secondary: 'bg-ip-secondary text-white',
  household: 'bg-accent-household text-white',
  labour: 'bg-accent-labour text-fyro-ink',
  transport: 'bg-accent-transport text-white',
};

export function AgentResultCard({ result, accent = 'primary' }: { result: AgentResult; accent?: AgentAccent }) {
  const t = useTranslations('agents');
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const borderColor = ACCENT_BORDER[accent];
  const chipColor = ACCENT_CHIP[accent];

  return (
    <div className={`ip-card border-l-[3px] ${borderColor}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${chipColor}`}>
          {t('aiChip')}
        </span>
        {result.mock && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ip-on-surface-variant px-1.5 py-0.5 rounded border border-ip-outline/30">
            {t('demoMode')}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-ip-on-surface-variant mr-1">{t(`confidence.${result.confidence}`)}</span>
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
            {t('evidence')} ({result.evidence.length})
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
        {t('recommendedNotApplied')}
      </p>
    </div>
  );
}

// v3 alias — DESIGN_MAP.md's component list calls this AgentCard. Same
// component, same guardrails; new pages should import this name.
export const AgentCard = AgentResultCard;
