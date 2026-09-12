'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { StatusPill } from '@/components/fy/Status';

/**
 * TARA — one assistant screen, every role.
 *
 * This replaces the per-dashboard support widgets, which were the same
 * feature wearing five different names. A worker who learned to use it on
 * their dashboard now finds the same assistant, with the same name, in the
 * same place, on every screen.
 *
 * Everything consequential stays where it was. TARA can point at the
 * booking screen for a trade it recognised, and it can fetch a human, and
 * that is the entire set of things it can do — the suggestion below is a
 * link the person chooses to follow, not an action taken for them.
 */

interface Evidence {
  label: string;
  value: string;
}

interface Answer {
  summary: string;
  confidence: 'low' | 'moderate' | 'high';
  evidence: Evidence[];
  mock: boolean;
  provider?: string;
  suggestion?: { categorySlug: string; path: string; matchedTerms: string[] };
  recommendEscalation: boolean;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  evidence?: Evidence[];
  confidence?: Answer['confidence'];
  suggestion?: Answer['suggestion'];
}

interface HistoryItem {
  _id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  escalated: boolean;
}

export default function AssistantPage() {
  const t = useTranslations('tara');
  const tAgents = useTranslations('agents');
  const router = useRouter();
  const { user } = useAuth();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [escalating, setEscalating] = useState(false);
  const [escalatedId, setEscalatedId] = useState<string | null>(null);
  const [canEscalate, setCanEscalate] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get<{ conversations: HistoryItem[] }>('/api/assistant/conversations')
      .then((res) => setHistory(res.conversations))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, loading]);

  async function send() {
    const text = question.trim();
    if (!text || loading) return;
    setQuestion('');
    setError(null);
    setTurns((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await api.post<{ conversationId: string; answer: Answer }>('/api/assistant/ask', {
        question: text,
        ...(conversationId ? { conversationId } : {}),
      });
      setConversationId(res.conversationId);
      setCanEscalate(true);
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer.summary,
          evidence: res.answer.evidence,
          confidence: res.answer.confidence,
          suggestion: res.answer.suggestion,
        },
      ]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setLoading(false);
    }
  }

  async function escalate() {
    if (!conversationId) return;
    setEscalating(true);
    setError(null);
    try {
      const res = await api.post<{ complaintId: string }>(`/api/assistant/conversations/${conversationId}/escalate`, {});
      setEscalatedId(res.complaintId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('escalateError'));
    } finally {
      setEscalating(false);
    }
  }

  async function openConversation(id: string) {
    try {
      const res = await api.get<{
        conversation: { _id: string; messages: { role: 'user' | 'assistant'; text: string; evidence?: Evidence[]; confidence?: Answer['confidence'] }[]; escalatedComplaintId?: string };
      }>(`/api/assistant/conversations/${id}`);
      setConversationId(res.conversation._id);
      setTurns(res.conversation.messages.map((m) => ({ role: m.role, text: m.text, evidence: m.evidence, confidence: m.confidence })));
      setEscalatedId(res.conversation.escalatedComplaintId ?? null);
      setCanEscalate(!res.conversation.escalatedComplaintId);
    } catch {
      setError(t('error'));
    }
  }

  function startNew() {
    setConversationId(null);
    setTurns([]);
    setEscalatedId(null);
    setCanEscalate(false);
    setError(null);
  }

  const greeting = user?.name ? t('greeting', { name: user.name.split(' ')[0] }) : t('greetingNoName');

  return (
    <div className="min-h-screen bg-fy-bone pb-28">
      <TopBar title={t('name')} showBack onBack={() => router.back()} />

      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-4">
        <Panel className="flex items-start gap-3">
          <IconTile tone="peach" size="md" className="rounded-full">
            <Icon name="auto_awesome" size={20} />
          </IconTile>
          <span className="flex flex-col min-w-0">
            <EyebrowLabel tone="brown">{t('tagline')}</EyebrowLabel>
            <Body size="label">{greeting}</Body>
          </span>
        </Panel>

        <div className="flex flex-col gap-3">
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="self-end max-w-[85%]">
                <EyebrowLabel>{t('you')}</EyebrowLabel>
                <LightCard className="mt-1">
                  <Body>{turn.text}</Body>
                </LightCard>
              </div>
            ) : (
              <div key={i} className="self-start max-w-[92%] w-full">
                <div className="flex items-center gap-2">
                  <EyebrowLabel tone="brown">{t('name')}</EyebrowLabel>
                  {turn.confidence && <StatusPill tone="neutral">{tAgents(`confidence.${turn.confidence}`)}</StatusPill>}
                </div>
                <Panel className="mt-1 flex flex-col gap-3 border-l-[3px] border-l-fy-brown">
                  <Body>{turn.text}</Body>

                  {turn.evidence && turn.evidence.length > 0 && (
                    <div className="border-t border-fy-brown/10 pt-2 flex flex-col gap-1">
                      <EyebrowLabel>{tAgents('evidence')}</EyebrowLabel>
                      {turn.evidence.map((e, j) => (
                        <div key={j} className="flex justify-between gap-3 text-xs">
                          <span className="text-fy-muted">{e.label}</span>
                          <span className="font-medium text-right">{e.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {turn.suggestion && (
                    // A link, never an action. TARA recognised a trade from
                    // what the person wrote; they still book it themselves.
                    <div className="border-t border-fy-brown/10 pt-2.5 flex flex-col gap-2">
                      <Body size="label">
                        {t('suggestionTitle', { category: turn.suggestion.categorySlug.replace(/_/g, ' ') })}
                      </Body>
                      <span className="font-mono text-[10px] text-fy-muted">
                        {t('suggestionMatched', { terms: turn.suggestion.matchedTerms.slice(0, 4).join(', ') })}
                      </span>
                      <Link href={turn.suggestion.path}>
                        <Button variant="ghost" size="md" glyph="arrow_forward" className="w-full">
                          {t('suggestionCta')}
                        </Button>
                      </Link>
                    </div>
                  )}
                </Panel>
              </div>
            )
          )}
          {loading && <Body size="label">{t('sending')}</Body>}
          <div ref={endRef} />
        </div>

        {error && (
          <LightCard>
            <Body size="label">{error}</Body>
          </LightCard>
        )}

        {escalatedId ? (
          <LightCard className="flex items-start gap-2.5">
            <Icon name="support_agent" size={18} className="text-fy-green shrink-0 mt-px" />
            <Body size="label">{t('escalated', { id: escalatedId.slice(-6).toUpperCase() })}</Body>
          </LightCard>
        ) : (
          canEscalate && (
            <Button variant="ghost" size="md" glyph="support_agent" disabled={escalating} onClick={escalate}>
              {escalating ? t('escalating') : t('escalate')}
            </Button>
          )
        )}

        <p className="font-body text-eyebrow text-fy-muted">{t('cannotAct')}</p>

        {turns.length > 0 && (
          <Button variant="ghost" size="md" glyph="add" onClick={startNew}>
            {t('newConversation')}
          </Button>
        )}

        {history.length > 0 && (
          <Section title={<SectionHeading>{t('history')}</SectionHeading>}>
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <button key={h._id} type="button" onClick={() => openConversation(h._id)} className="text-left">
                  <LightCard className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <Body size="label" className="truncate">
                        {h.title}
                      </Body>
                      <span className="font-mono text-[10px] text-fy-muted">
                        {new Date(h.updatedAt).toLocaleDateString()} · {h.messageCount}
                      </span>
                    </span>
                    {h.escalated && <StatusPill tone="lime">{t('escalate')}</StatusPill>}
                  </LightCard>
                </button>
              ))}
            </div>
          </Section>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-fy-bone border-t border-fy-brown/12 px-gutter py-3">
        <div className="max-w-2xl mx-auto flex gap-2 items-center">
          <Field
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            placeholder={t('placeholder')}
            className="flex-1"
          />
          <Button glyph="send" disabled={loading || !question.trim()} onClick={() => void send()}>
            {t('send')}
          </Button>
        </div>
      </div>
    </div>
  );
}
