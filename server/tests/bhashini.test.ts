import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { ChatMessage } from '../src/models/ChatMessage';
import { signAccessToken } from '../src/services/token.service';
import { speechToText, textToSpeech, translateText, bhashiniReady, _clearBhashiniCacheForTests } from '../src/services/bhashini.service';
import { detectLanguage } from '../src/controllers/chatTranslate.controller';

/*
 * Bhashini is stood in for by a fetch that follows the published pipeline
 * shapes: a config call (userID + ulcaApiKey headers) answers with an inference
 * URL, key and serviceId; the compute call answers per task.
 */

const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;
const CONFIG = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
const INFER = 'https://dhruva.test/services/inference/pipeline';

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function standIn(handlers: { asr?: string; tts?: string; translation?: string; failCompute?: number; failConfig?: number } = {}) {
  const seen: Seen[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(String(init?.body));
    seen.push({ url: u, headers, body });
    if (u === CONFIG) {
      if (handlers.failConfig) return new Response('{}', { status: handlers.failConfig });
      const task = body.pipelineTasks[0].taskType as string;
      return new Response(
        JSON.stringify({
          pipelineInferenceAPIEndPoint: { callbackUrl: INFER, inferenceApiKey: { name: 'Authorization', value: 'inference-key-xyz' } },
          pipelineResponseConfig: [{ taskType: task, config: [{ serviceId: `svc-${task}` }] }],
        }),
        { status: 200 }
      );
    }
    if (handlers.failCompute) return new Response('{}', { status: handlers.failCompute });
    const task = body.pipelineTasks[0].taskType as string;
    const out =
      task === 'asr'
        ? { output: [{ source: handlers.asr ?? 'where is my booking' }] }
        : task === 'tts'
          ? { audio: [{ audioContent: handlers.tts ?? 'QVVESU8=' }] }
          : { output: [{ source: body.inputData.input[0].source, target: handlers.translation ?? 'translated text' }] };
    return new Response(JSON.stringify({ pipelineResponse: [out] }), { status: 200 });
  }) as unknown as typeof fetch;
  return seen;
}

function on() {
  mutableEnv.BHASHINI_ENABLED = true;
  mutableEnv.BHASHINI_USER_ID = 'user-1';
  mutableEnv.BHASHINI_API_KEY = 'ulca-key-1';
}

afterEach(() => {
  global.fetch = realFetch;
  for (const k of ['BHASHINI_ENABLED', 'BHASHINI_USER_ID', 'BHASHINI_API_KEY']) mutableEnv[k] = undefined;
  _clearBhashiniCacheForTests();
  jest.restoreAllMocks();
});

describe('the pipeline (config call then compute call)', () => {
  it('is not ready without the flag AND both credentials, and then makes no call', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(bhashiniReady()).toBe(false);
    mutableEnv.BHASHINI_ENABLED = true;
    expect(bhashiniReady()).toBe(false); // flag alone is not enough
    expect(await translateText('hi', 'en', 'te')).toEqual({ ok: false, reason: 'not_enabled' });
    mutableEnv.BHASHINI_USER_ID = 'u';
    mutableEnv.BHASHINI_API_KEY = 'k';
    mutableEnv.BHASHINI_ENABLED = undefined;
    expect(bhashiniReady()).toBe(false); // credentials alone are not enough
    expect(spy).not.toHaveBeenCalled();
  });

  it('speech to text: authenticates the config call, then sends audio to the returned URL with the returned key', async () => {
    on();
    const seen = standIn({ asr: 'నా బుకింగ్ ఎక్కడ' });
    const r = await speechToText('BASE64AUDIO', 'te');
    expect(r).toEqual({ ok: true, data: 'నా బుకింగ్ ఎక్కడ' });
    expect(seen[0].url).toBe(CONFIG);
    expect(seen[0].headers).toMatchObject({ userID: 'user-1', ulcaApiKey: 'ulca-key-1' });
    expect(seen[0].body).toMatchObject({ pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage: 'te' } } }] });
    expect(seen[1].url).toBe(INFER);
    expect(seen[1].headers.Authorization).toBe('inference-key-xyz');
    expect(seen[1].body).toMatchObject({
      pipelineTasks: [{ taskType: 'asr', config: { serviceId: 'svc-asr', audioFormat: 'wav', samplingRate: 16000, language: { sourceLanguage: 'te' } } }],
      inputData: { audio: [{ audioContent: 'BASE64AUDIO' }] },
    });
  });

  it('text to speech and translation', async () => {
    on();
    const seen = standIn({ tts: 'V0FWRA==', translation: 'नमस्ते' });
    expect(await textToSpeech('hello', 'hi')).toEqual({ ok: true, data: { audioBase64: 'V0FWRA==', format: 'wav' } });
    expect(await translateText('hello', 'en', 'hi')).toEqual({ ok: true, data: 'नमस्ते' });
    const compute = seen.filter((s) => s.url === INFER).map((s) => s.body);
    expect(compute[0]).toMatchObject({ pipelineTasks: [{ taskType: 'tts', config: { gender: 'female', serviceId: 'svc-tts' } }], inputData: { input: [{ source: 'hello' }] } });
    expect(compute[1]).toMatchObject({ pipelineTasks: [{ taskType: 'translation', config: { language: { sourceLanguage: 'en', targetLanguage: 'hi' } } }] });
  });

  it('caches the config call, and does not call out to translate a language into itself', async () => {
    on();
    const seen = standIn();
    await translateText('a', 'en', 'te');
    await translateText('b', 'en', 'te');
    expect(seen.filter((s) => s.url === CONFIG)).toHaveLength(1);
    expect(seen.filter((s) => s.url === INFER)).toHaveLength(2);
    const before = seen.length;
    expect(await translateText('same', 'te', 'te')).toEqual({ ok: true, data: 'same' });
    expect(seen.length).toBe(before);
  });

  it('turns failures into reasons instead of throwing', async () => {
    on();
    standIn({ failConfig: 401 });
    expect(await translateText('a', 'en', 'te')).toEqual({ ok: false, reason: 'config_http_401' });
    _clearBhashiniCacheForTests();
    standIn({ failCompute: 503 });
    expect(await translateText('a', 'en', 'te')).toEqual({ ok: false, reason: 'http_503' });
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    _clearBhashiniCacheForTests();
    expect(await speechToText('x', 'hi')).toEqual({ ok: false, reason: 'config_unreachable' });
    expect(await translateText('a', 'en', 'xx' as never)).toEqual({ ok: false, reason: 'unsupported_language' });
  });
});

let seq = 0;
async function person(role = 'customer') {
  seq += 1;
  const user = await User.create({ name: `P${seq}`, phone: `95550${String(seq).padStart(5, '0')}`, passwordHash: await bcrypt.hash('x', 4), role, preferredLocale: 'en' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

const AUDIO = 'A'.repeat(200);

describe('voice with TARA', () => {
  it('says so, and does nothing, when switched off', async () => {
    const { agent } = await person();
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect((await agent.get('/api/assistant/voice-status')).body).toEqual({ enabled: false, ready: false });
    const r = await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/type your question/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a spoken question goes through TARA like a typed one, and comes back as text and audio', async () => {
    on();
    standIn({ asr: 'How is the service fee split between society and welfare pool?', tts: 'U1BPS0VO' });
    const { agent, user } = await person();
    const r = await agent.post('/api/assistant/voice').send({ audioBase64: `data:audio/wav;base64,${AUDIO}`, language: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.transcript).toMatch(/service fee/);
    expect(r.body.answer.summary.length).toBeGreaterThan(0);
    expect(r.body.audio).toEqual({ audioBase64: 'U1BPS0VO', format: 'wav' });
    // It is in the person's transcript, like any typed question.
    const history = await agent.get(`/api/assistant/conversations/${r.body.conversationId}`);
    expect(history.body.conversation.messages[0].text).toMatch(/service fee/);
    void user;
  });

  it('a spoken gas emergency still gets the fixed safety answer', async () => {
    on();
    standIn({ asr: 'I smell gas in my kitchen' });
    const { agent } = await person();
    const r = await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' });
    expect(r.body.answer.guardrail).toBe('gas');
  });

  it('keeps the text answer when only the spoken reply fails', async () => {
    on();
    const real = standIn({ asr: 'How is the service fee split?' });
    const base = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (String(url) !== CONFIG && body.pipelineTasks[0].taskType === 'tts') return new Response('{}', { status: 500 });
      return base(url, init);
    }) as unknown as typeof fetch;
    const { agent } = await person();
    const r = await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' });
    expect(r.status).toBe(200);
    expect(r.body.answer.summary.length).toBeGreaterThan(0);
    expect(r.body.audio).toBeUndefined();
    expect(r.body.voiceNote).toBe('voice_reply_unavailable');
    void real;
  });

  it('asks the person to try again when nothing could be heard, or voice fails', async () => {
    on();
    standIn({ asr: '   ' });
    const { agent } = await person();
    const silent = await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' });
    expect(silent.status).toBe(422);
    expect(silent.body.error).toMatch(/could not hear/i);
    _clearBhashiniCacheForTests();
    standIn({ failConfig: 500 });
    const broken = await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' });
    expect(broken.status).toBe(422);
    expect(broken.body.error).toMatch(/type your question/i);
  });

  it('validates the request and needs sign-in', async () => {
    on();
    const { agent } = await person();
    expect((await agent.post('/api/assistant/voice').send({ audioBase64: 'short', language: 'en' })).status).toBe(400);
    expect((await agent.post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'fr' })).status).toBe(400);
    expect((await request(app).post('/api/assistant/voice').send({ audioBase64: AUDIO, language: 'en' })).status).toBe(401);
  });

  it('refuses a very long recording', async () => {
    on();
    const { agent } = await person();
    const r = await agent.post('/api/assistant/voice').send({ audioBase64: 'A'.repeat(4_100_000), language: 'en' });
    expect([413, 400]).toContain(r.status);
  });
});

describe('chat translation', () => {
  async function chat(text: string) {
    const customer = await person('customer');
    const worker = await person('hamali_solo');
    const stranger = await person('customer');
    const booking = await Booking.create({
      customerId: customer.user._id,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: [80, 16], address: 'a' },
      dropLocation: { type: 'Point', coordinates: [80, 16], address: 'b' },
      requiredHamaliCount: 1,
      assignedHamaliIds: [worker.user._id],
      status: 'accepted',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 100, total: 110 },
    });
    const message = await ChatMessage.create({ bookingId: booking._id, senderId: customer.user._id, senderRole: 'customer', text });
    return { customer, worker, stranger, message };
  }

  it('detects the language from the script', () => {
    expect(detectLanguage('hello there')).toBe('en');
    expect(detectLanguage('మీరు ఎప్పుడు వస్తారు')).toBe('te');
    expect(detectLanguage('आप कब आएँगे')).toBe('hi');
  });

  it('a participant can translate a message; nothing is stored and the original stays', async () => {
    on();
    const seen = standIn({ translation: 'మీరు ఎప్పుడు వస్తారు' });
    const { worker, message } = await chat('When will you arrive?');
    const r = await worker.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'te' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ text: 'మీరు ఎప్పుడు వస్తారు', source: 'en', target: 'te', translated: true });
    expect(seen.some((s) => s.body.pipelineTasks && (s.body.pipelineTasks as { config: { language: { sourceLanguage: string; targetLanguage?: string } } }[])[0].config.language.targetLanguage === 'te')).toBe(true);
    expect((await ChatMessage.findById(message._id).lean())!.text).toBe('When will you arrive?');
  });

  it('a message already in the target language is returned as it is, with no call', async () => {
    on();
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const { worker, message } = await chat('When will you arrive?');
    const r = await worker.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'en' });
    expect(r.body).toMatchObject({ translated: false, text: 'When will you arrive?' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('someone who is not in the booking gets a not-found, as if it did not exist', async () => {
    on();
    standIn();
    const { stranger, message } = await chat('Private');
    expect((await stranger.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'te' })).status).toBe(404);
    expect((await stranger.agent.post(`/api/chat/${new Types.ObjectId()}/translate`).send({ target: 'te' })).status).toBe(404);
  });

  it('is off, with a clear message, when Bhashini is not enabled; and reports status', async () => {
    const { worker, message } = await chat('Hello');
    const r = await worker.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'te' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not switched on/i);
    expect((await worker.agent.get('/api/chat/translate-status')).body).toEqual({ enabled: false, ready: false });
  });

  it('says so when translation fails, and validates the target', async () => {
    on();
    standIn({ failCompute: 500 });
    const { worker, message } = await chat('Hello');
    expect((await worker.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'te' })).status).toBe(502);
    expect((await worker.agent.post(`/api/chat/${message._id}/translate`).send({ target: 'fr' })).status).toBe(400);
  });
});
