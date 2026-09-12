import './setup';

/**
 * Job 2's contract, tested where it actually matters: the agent layer must
 * be swappable between vendors WITHOUT loosening any of the Phase 4
 * guardrails. So these tests assert both halves — that the chain picks and
 * fails over correctly, and that every path still returns the same
 * confidence/evidence-bearing shape with an honest `mock` flag.
 *
 * `fetch` is stubbed rather than mocked per-SDK: Gemini and Groq are both
 * plain REST, which is one of the reasons they are called that way.
 */

const ENV_KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'AI_PROVIDER'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;

function reloadEnv(vars: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  jest.resetModules();
}

const MOCK = () => ({
  summary: 'Rule-based summary from real data.',
  confidence: 'moderate' as const,
  evidence: [{ label: 'Source', value: 'ledger' }],
});

const INPUT = {
  agentName: 'test_agent',
  systemPrompt: 'You are a test.',
  userPrompt: 'Analyse.',
  context: { rows: 3 },
};

function geminiText(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => '',
  } as unknown as Response;
}

const geminiOk = (payload: unknown) => geminiText(JSON.stringify(payload));

function groqOk(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    text: async () => '',
  } as unknown as Response;
}

function httpFail(status: number) {
  return { ok: false, status, json: async () => ({}), text: async () => 'upstream said no' } as unknown as Response;
}

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.resetModules();
});

describe('AI provider chain', () => {
  it('runs the rule-based path, labelled mock, when no provider key is set', async () => {
    reloadEnv({});
    const { callAgent } = await import('../src/agents/client');
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(String(url));
      return httpFail(500);
    }) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(res.mock).toBe(true);
    expect(res.provider).toBeUndefined();
    expect(calls).toHaveLength(0); // never reaches out with no key
    expect(res.evidence.length).toBeGreaterThan(0);
    expect(['low', 'moderate', 'high']).toContain(res.confidence);
  });

  it('forces the rule-based path when AI_PROVIDER=mock even with keys present', async () => {
    reloadEnv({ AI_PROVIDER: 'mock', GEMINI_API_KEY: 'k' });
    const { callAgent } = await import('../src/agents/client');
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(res.mock).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('prefers Gemini and reports which provider and model answered', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k2' });
    const { callAgent } = await import('../src/agents/client');
    const hosts: string[] = [];
    global.fetch = (async (url: string) => {
      hosts.push(new URL(String(url)).host);
      return geminiOk({ summary: 'Live answer.', confidence: 'high', evidence: [{ label: 'Rows', value: '3' }] });
    }) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(hosts).toEqual(['generativelanguage.googleapis.com']);
    expect(res.mock).toBe(false);
    expect(res.provider).toBe('gemini');
    expect(res.model).toContain('gemini');
    expect(res.summary).toBe('Live answer.');
  });

  it('falls over to Groq when Gemini rate-limits, and says so', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k2' });
    const { callAgent } = await import('../src/agents/client');
    const hosts: string[] = [];
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = (async (url: string) => {
      const host = new URL(String(url)).host;
      hosts.push(host);
      if (host.includes('googleapis')) return httpFail(429);
      return groqOk({ summary: 'Groq answer.', confidence: 'moderate', evidence: [{ label: 'Rows', value: '3' }] });
    }) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(hosts).toHaveLength(2);
    expect(res.provider).toBe('groq');
    expect(res.mock).toBe(false);
  });

  it('pins the chain to one provider when AI_PROVIDER names it', async () => {
    reloadEnv({ AI_PROVIDER: 'groq', GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k2' });
    const { callAgent } = await import('../src/agents/client');
    const hosts: string[] = [];
    global.fetch = (async (url: string) => {
      hosts.push(new URL(String(url)).host);
      return groqOk({ summary: 'Pinned.', confidence: 'low', evidence: [] });
    }) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(hosts).toEqual(['api.groq.com']);
    expect(res.provider).toBe('groq');
  });

  it('degrades to the rule-based result with a visible note when every provider fails', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k2' });
    const { callAgent } = await import('../src/agents/client');
    global.fetch = (async () => httpFail(503)) as unknown as typeof fetch;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callAgent(INPUT, MOCK);

    expect(res.mock).toBe(true);
    expect(res.summary).toBe('Rule-based summary from real data.');
    expect(res.evidence.map((e) => e.label)).toContain('Note');
  });

  it('never passes through unstructured model output as a result', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k' });
    const { callAgent } = await import('../src/agents/client');
    global.fetch = (async () => geminiText('Sure! Here is my advice: ship it.')) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(res.summary).not.toContain('ship it');
    expect(res.confidence).toBe('low');
    expect(res.evidence).toEqual([]);
  });

  it('tolerates a model that fences its JSON', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k' });
    const { callAgent } = await import('../src/agents/client');
    const fenced =
      '```json\n{"summary":"Fenced.","confidence":"high","evidence":[{"label":"A","value":"B"}]}\n```';
    global.fetch = (async () => geminiText(fenced)) as unknown as typeof fetch;

    const res = await callAgent(INPUT, MOCK);

    expect(res.summary).toBe('Fenced.');
    expect(res.confidence).toBe('high');
  });

  it('keeps a mock-forced chain out of a vision call', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k' });
    const withKey = await import('../src/agents/providers');
    expect(withKey.providerChain(true).map((p) => p.name)).toEqual(['gemini']);
    expect(withKey.anyProviderConfigured(true)).toBe(true);

    reloadEnv({ AI_PROVIDER: 'mock', GEMINI_API_KEY: 'k' });
    const forced = await import('../src/agents/providers');
    expect(forced.providerChain(true)).toEqual([]);
    expect(forced.anyProviderConfigured(true)).toBe(false);
  });

  it('sends the locale instruction to whichever provider answers', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k' });
    const { callAgent } = await import('../src/agents/client');
    let sentSystem = '';
    global.fetch = (async (_url: string, init: RequestInit) => {
      sentSystem = JSON.parse(String(init.body)).system_instruction.parts[0].text;
      return geminiOk({ summary: 'ok', confidence: 'low', evidence: [] });
    }) as unknown as typeof fetch;

    await callAgent({ ...INPUT, locale: 'te' }, MOCK);

    expect(sentSystem).toContain('Telugu');
  });

  it('asks for native JSON output, so the parser is a backstop and not the plan', async () => {
    reloadEnv({ GEMINI_API_KEY: 'k' });
    const { callAgent } = await import('../src/agents/client');
    let body: Record<string, never> = {} as Record<string, never>;
    global.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return geminiOk({ summary: 'ok', confidence: 'low', evidence: [] });
    }) as unknown as typeof fetch;

    await callAgent(INPUT, MOCK);

    expect((body as unknown as { generationConfig: { responseMimeType: string } }).generationConfig.responseMimeType).toBe(
      'application/json'
    );
  });
});
