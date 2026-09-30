import { env } from '../config/env';

/**
 * Bhashini (MeitY's language platform) through its ULCA pipeline: speech to
 * text, text to speech, and translation between Telugu, Hindi and English.
 *
 * The pipeline is two calls. A CONFIG call says which service to use for a
 * task and language and hands back an inference URL and key; a COMPUTE call
 * to that URL does the work. Config answers are cached for a while.
 *
 * Off unless BHASHINI_ENABLED=true and both credentials are set. Every
 * function returns a result object and never throws, so a caller (TARA's
 * voice reply, chat translation) can fall back to plain text with a clear
 * reason instead of failing.
 *
 * Request shapes follow Bhashini's published pipeline API (the
 * getModelsPipeline config call and the inference pipeline compute call).
 * They have NOT been run against the live service from this codebase (that
 * needs credentials), so first use in production should be checked; the
 * tests use a stand-in that follows the same shapes.
 */
export type BhashiniLang = 'en' | 'te' | 'hi';
export const BHASHINI_LANGS: BhashiniLang[] = ['en', 'te', 'hi'];
export const BHASHINI_TIMEOUT_MS = 20_000;
const DEFAULT_CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
// Bhashini's published MeitY pipeline id; overridable.
const DEFAULT_PIPELINE_ID = '64392f96daac500b55c543cd';
const CONFIG_TTL_MS = 6 * 3600_000;

export type BhashiniResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function bhashiniReady(): boolean {
  return env.BHASHINI_ENABLED === true && Boolean(env.BHASHINI_USER_ID && env.BHASHINI_API_KEY);
}

export function bhashiniStatus(): { enabled: boolean; ready: boolean } {
  return { enabled: env.BHASHINI_ENABLED === true, ready: bhashiniReady() };
}

type TaskType = 'asr' | 'tts' | 'translation';

interface PipelineConfig {
  callbackUrl: string;
  keyName: string;
  keyValue: string;
  serviceId: string;
  at: number;
}

const configCache = new Map<string, PipelineConfig>();

export function _clearBhashiniCacheForTests(): void {
  configCache.clear();
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<BhashiniResult<Record<string, unknown>>> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BHASHINI_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true, data: (await res.json()) as Record<string, unknown> };
  } catch (err) {
    const name = (err as Error)?.name;
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

async function getConfig(task: TaskType, source: BhashiniLang, target?: BhashiniLang): Promise<BhashiniResult<PipelineConfig>> {
  const cacheKey = `${task}:${source}:${target ?? ''}`;
  const hit = configCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return { ok: true, data: hit };

  const res = await post(
    env.BHASHINI_CONFIG_URL || DEFAULT_CONFIG_URL,
    { userID: env.BHASHINI_USER_ID as string, ulcaApiKey: env.BHASHINI_API_KEY as string },
    {
      pipelineTasks: [{ taskType: task, config: { language: { sourceLanguage: source, ...(target ? { targetLanguage: target } : {}) } } }],
      pipelineRequestConfig: { pipelineId: env.BHASHINI_PIPELINE_ID || DEFAULT_PIPELINE_ID },
    }
  );
  if (!res.ok) return { ok: false, reason: `config_${res.reason}` };

  const d = res.data as {
    pipelineInferenceAPIEndPoint?: { callbackUrl?: string; inferenceApiKey?: { name?: string; value?: string } };
    pipelineResponseConfig?: { config?: { serviceId?: string }[] }[];
  };
  const callbackUrl = d.pipelineInferenceAPIEndPoint?.callbackUrl;
  const key = d.pipelineInferenceAPIEndPoint?.inferenceApiKey;
  const serviceId = d.pipelineResponseConfig?.[0]?.config?.[0]?.serviceId;
  if (!callbackUrl || !key?.name || !key.value || !serviceId) return { ok: false, reason: 'config_unexpected_response' };

  const cfg: PipelineConfig = { callbackUrl, keyName: key.name, keyValue: key.value, serviceId, at: Date.now() };
  configCache.set(cacheKey, cfg);
  return { ok: true, data: cfg };
}

async function compute(cfg: PipelineConfig, task: Record<string, unknown>, inputData: Record<string, unknown>) {
  return post(cfg.callbackUrl, { [cfg.keyName]: cfg.keyValue }, { pipelineTasks: [task], inputData });
}

function guard(langs: BhashiniLang[]): string | null {
  if (!bhashiniReady()) return 'not_enabled';
  if (langs.some((l) => !BHASHINI_LANGS.includes(l))) return 'unsupported_language';
  return null;
}

/** Speech to text. `audioBase64` is the raw audio (not a data URL). */
export async function speechToText(audioBase64: string, language: BhashiniLang, audioFormat = 'wav', samplingRate = 16000): Promise<BhashiniResult<string>> {
  const bad = guard([language]);
  if (bad) return { ok: false, reason: bad };
  const cfg = await getConfig('asr', language);
  if (!cfg.ok) return cfg;
  const res = await compute(
    cfg.data,
    { taskType: 'asr', config: { language: { sourceLanguage: language }, serviceId: cfg.data.serviceId, audioFormat, samplingRate } },
    { audio: [{ audioContent: audioBase64 }] }
  );
  if (!res.ok) return res;
  const text = (res.data as { pipelineResponse?: { output?: { source?: string }[] }[] }).pipelineResponse?.[0]?.output?.[0]?.source;
  return text?.trim() ? { ok: true, data: text.trim() } : { ok: false, reason: 'no_speech_recognised' };
}

/** Text to speech. Returns base64 audio (wav). */
export async function textToSpeech(text: string, language: BhashiniLang, gender: 'female' | 'male' = 'female', samplingRate = 8000): Promise<BhashiniResult<{ audioBase64: string; format: string }>> {
  const bad = guard([language]);
  if (bad) return { ok: false, reason: bad };
  const cfg = await getConfig('tts', language);
  if (!cfg.ok) return cfg;
  const res = await compute(
    cfg.data,
    { taskType: 'tts', config: { language: { sourceLanguage: language }, serviceId: cfg.data.serviceId, gender, samplingRate } },
    { input: [{ source: text }] }
  );
  if (!res.ok) return res;
  const audio = (res.data as { pipelineResponse?: { audio?: { audioContent?: string }[] }[] }).pipelineResponse?.[0]?.audio?.[0]?.audioContent;
  return audio ? { ok: true, data: { audioBase64: audio, format: 'wav' } } : { ok: false, reason: 'no_audio_returned' };
}

/** Translation between en, te and hi. Same-language text is returned as it is without a call. */
export async function translateText(text: string, source: BhashiniLang, target: BhashiniLang): Promise<BhashiniResult<string>> {
  const bad = guard([source, target]);
  if (bad) return { ok: false, reason: bad };
  if (source === target) return { ok: true, data: text };
  const cfg = await getConfig('translation', source, target);
  if (!cfg.ok) return cfg;
  const res = await compute(
    cfg.data,
    { taskType: 'translation', config: { language: { sourceLanguage: source, targetLanguage: target }, serviceId: cfg.data.serviceId } },
    { input: [{ source: text }] }
  );
  if (!res.ok) return res;
  const out = (res.data as { pipelineResponse?: { output?: { target?: string }[] }[] }).pipelineResponse?.[0]?.output?.[0]?.target;
  return out?.trim() ? { ok: true, data: out.trim() } : { ok: false, reason: 'no_translation_returned' };
}
