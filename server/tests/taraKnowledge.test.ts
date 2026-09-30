import './setup';
import path from 'path';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { KnowledgeChunk } from '../src/models/KnowledgeChunk';
import { askTara } from '../src/agents/tara';
import { detectHazard } from '../src/agents/tara/knowledge';
import { chunkMarkdown, buildKnowledge, retrieve, lexicalScore, CHUNK_CHARS } from '../src/services/knowledge.service';
import { cosine } from '../src/services/embeddings.service';

const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

afterEach(() => {
  global.fetch = realFetch;
  mutableEnv.GROQ_API_KEY = undefined;
  mutableEnv.GEMINI_API_KEY = undefined;
  mutableEnv.AI_PROVIDER = 'auto';
});

async function customer() {
  const u = await User.create({ name: 'Asha', phone: '9500000001', passwordHash: await bcrypt.hash('x', 4), role: 'customer', region: 'Guntur' });
  return u._id.toString();
}

describe('chunking', () => {
  it('splits by heading, keeps the heading as the citation, and flags unconfirmed facts', () => {
    const md = '# Title\n\nintro line\n\n## First\n\nalpha beta\n\n## Second\n\ngamma [[TO BE CONFIRMED: x]]\n';
    const c = chunkMarkdown('doc', md);
    expect(c.map((x) => x.heading)).toEqual(['Title', 'First', 'Second']);
    expect(c[2].hasPlaceholder).toBe(true);
    expect(c[1].hasPlaceholder).toBe(false);
  });

  it('packs long sections into pieces of about 500 tokens without splitting a paragraph', () => {
    const para = 'word '.repeat(150).trim(); // ~750 chars
    const md = `## Long\n\n${[para, para, para, para, para].join('\n\n')}\n`;
    const c = chunkMarkdown('doc', md);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((x) => x.text.length <= CHUNK_CHARS + para.length)).toBe(true);
    expect(c.every((x) => x.heading === 'Long')).toBe(true);
  });

  it('the real knowledge files all chunk, and the unconfirmed facts are marked', () => {
    const r = buildKnowledge(KNOWLEDGE_DIR);
    return r.then(async (res) => {
      expect(res.total).toBeGreaterThan(20);
      const placeholders = await KnowledgeChunk.find({ hasPlaceholder: true }).lean();
      const sources = placeholders.map((p) => p.source);
      expect(sources).toEqual(expect.arrayContaining(['booking-and-cancellation', 'bye-laws', 'helplines', 'welfare-pool', 'fee-split']));
    });
  });
});

describe('retrieval', () => {
  beforeEach(async () => {
    await buildKnowledge(KNOWLEDGE_DIR);
  });

  it('finds the fee-split passage for a fee question (no embeddings: lexical)', async () => {
    const hits = await retrieve('how is the service fee split between society and welfare pool', 3);
    expect(hits[0].source).toBe('fee-split');
    expect(hits[0].method).toBe('lexical');
  });

  it('finds the guarantee passage', async () => {
    const hits = await retrieve('what is the workmanship guarantee and how many days', 3);
    expect(hits[0].source).toBe('guarantee');
  });

  it('scores an unrelated question low', async () => {
    const hits = await retrieve('what is the weather on mars tomorrow', 3);
    expect(hits[0].score).toBeLessThan(0.2);
  });

  it('rebuilding is idempotent and drops passages that no longer exist', async () => {
    const before = await KnowledgeChunk.countDocuments();
    const again = await buildKnowledge(KNOWLEDGE_DIR);
    expect(again.added).toBe(0);
    expect(await KnowledgeChunk.countDocuments()).toBe(before);
    await KnowledgeChunk.create({ source: 'gone', heading: 'Old', text: 'stale', contentHash: 'deadbeef', hasPlaceholder: false });
    const cleaned = await buildKnowledge(KNOWLEDGE_DIR);
    expect(cleaned.removed).toBe(1);
  });

  it('uses embeddings when a key is set and ranks by cosine', async () => {
    mutableEnv.GEMINI_API_KEY = 'k';
    // A fake embedder: a 2-d vector that points "fee" questions and fee passages the same way.
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const text = JSON.parse(String(init?.body)).content.parts[0].text as string;
      const v = /fee|split|society|welfare/i.test(text) ? [1, 0] : [0, 1];
      return new Response(JSON.stringify({ embedding: { values: v } }), { status: 200 });
    }) as unknown as typeof fetch;
    await KnowledgeChunk.deleteMany({});
    const built = await buildKnowledge(KNOWLEDGE_DIR);
    expect(built.embedded).toBeGreaterThan(0);
    const hits = await retrieve('how is the fee split?', 2);
    expect(hits[0].method).toBe('vector');
    expect(hits[0].score).toBeCloseTo(1, 5);
  });

  it('lexical and cosine helpers behave', () => {
    expect(lexicalScore('service fee split', 'the service fee is split five ways', 'Fees')).toBeGreaterThan(0.5);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1, 5);
  });
});

describe('TARA answers from the knowledge base', () => {
  beforeEach(async () => {
    await buildKnowledge(KNOWLEDGE_DIR);
  });

  it('answers a policy question with a citation, and says it came from the guides', async () => {
    const id = await customer();
    const a = await askTara(id, 'customer', 'How is the service fee split between society and welfare pool?', 'en');
    expect(a.citations.map((c) => c.source)).toContain('fee-split');
    expect(a.evidence.some((e) => e.label === 'Source' && e.value.includes('fee-split'))).toBe(true);
    expect(a.knowledge).toMatchObject({ method: 'lexical' });
    expect(a.summary).toMatch(/5%/);
  });

  it('says what has not been confirmed instead of guessing it', async () => {
    const id = await customer();
    const a = await askTara(id, 'customer', 'What is the cancellation fee and refund timeline?', 'en');
    expect(a.summary).toMatch(/not confirmed/i);
    expect(a.confidence).toBe('low');
    expect(a.recommendEscalation).toBe(true);
    expect(a.summary).not.toMatch(/₹|\d+%/);
  });

  it('replies "I don\'t know — escalate?" to a question it cannot answer, with no citation', async () => {
    const id = await customer();
    const a = await askTara(id, 'customer', 'Who won the cricket match yesterday?', 'en');
    expect(a.summary).toMatch(/I don’t know — escalate\?/);
    expect(a.confidence).toBe('low');
    expect(a.recommendEscalation).toBe(true);
    expect(a.citations).toEqual([]);
  });

  it('answers the escalate line in Telugu and Hindi too', async () => {
    const id = await customer();
    const te = await askTara(id, 'customer', 'Who won the cricket match yesterday?', 'te');
    const hi = await askTara(id, 'customer', 'Who won the cricket match yesterday?', 'hi');
    expect(te.summary).toMatch(/నాకు తెలియదు/);
    expect(hi.summary).toMatch(/मुझे नहीं पता/);
  });

  it('with a model configured, hands the model the passages and the citation rule, and passes its answer through', async () => {
    mutableEnv.GROQ_API_KEY = 'k';
    let sent = '';
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      sent = String(init?.body);
      const reply = { summary: 'The customer pays rate plus 10%.', confidence: 'high', evidence: [{ label: 'Source', value: '[fee-split › What a customer pays]' }] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const id = await customer();
    const a = await askTara(id, 'customer', 'What does the customer pay on top of the worker rate as a service fee?', 'en');
    expect(a.provider).toBe('groq');
    expect(sent).toContain('KNOWLEDGE');
    expect(sent).toContain('fee-split');
    expect(sent).toContain('escalate?');
    expect(a.citations.map((c) => c.source)).toContain('fee-split');
  });
});

describe('TARA safety guardrail runs first', () => {
  it('recognises gas, electrical and structural danger in three languages', () => {
    expect(detectHazard('I smell gas in my kitchen')).toBe('gas');
    expect(detectHazard('there is a gas leak from the cylinder')).toBe('gas');
    expect(detectHazard('వంటగదిలో గ్యాస్ వాసన వస్తోంది')).toBe('gas');
    expect(detectHazard('रसोई में गैस की बदबू आ रही है')).toBe('gas');
    expect(detectHazard('the socket is sparking and there is a burning smell')).toBe('electrical');
    expect(detectHazard('there is a crack in the wall near the beam')).toBe('structural');
  });

  it('does not treat ordinary questions as emergencies', () => {
    expect(detectHazard('how much does a gas stove repair cost')).toBeNull();
    expect(detectHazard('my fan is not working')).toBeNull();
    expect(detectHazard('how is the service fee split')).toBeNull();
  });

  it('answers a gas smell with safety steps and a professional, and never calls a model', async () => {
    mutableEnv.GROQ_API_KEY = 'k';
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const id = await customer();
    const a = await askTara(id, 'customer', 'I smell gas in my kitchen', 'en');
    expect(spy).not.toHaveBeenCalled();
    expect(a.guardrail).toBe('gas');
    expect(a.summary).toMatch(/do not switch anything on or off/i);
    expect(a.summary).toMatch(/112/);
    expect(a.summary).toMatch(/cannot give do-it-yourself advice/i);
    expect(a.suggestion?.categorySlug).toBe('technician');
    expect(a.mock).toBe(true);
    expect(a.recommendEscalation).toBe(false);
  });

  it('gives the same guardrail in Telugu and Hindi', async () => {
    const id = await customer();
    const te = await askTara(id, 'customer', 'వంటగదిలో గ్యాస్ వాసన వస్తోంది', 'te');
    const hi = await askTara(id, 'customer', 'रसोई में गैस की बदबू आ रही है', 'hi');
    expect(te.guardrail).toBe('gas');
    expect(hi.guardrail).toBe('gas');
    expect(te.summary).toMatch(/112/);
    expect(hi.summary).toMatch(/112/);
  });

  it('routes an electrical danger to an electrician with no do-it-yourself steps', async () => {
    const id = await customer();
    const a = await askTara(id, 'customer', 'the switchboard is sparking', 'en');
    expect(a.guardrail).toBe('electrical');
    expect(a.suggestion?.categorySlug).toBe('electrician');
    expect(a.summary).not.toMatch(/you can (fix|replace|rewire)/i);
  });
});

describe('health reports the active provider', () => {
  it('names groq when a Groq key is set, rules when none is', async () => {
    const request = (await import('supertest')).default;
    const { app } = await import('../src/app');
    mutableEnv.GROQ_API_KEY = 'k';
    expect((await request(app).get('/api/health')).body.activeProvider).toBe('groq');
    mutableEnv.GROQ_API_KEY = undefined;
    expect((await request(app).get('/api/health')).body.activeProvider).toBe('rules');
    void Types;
  });
});
