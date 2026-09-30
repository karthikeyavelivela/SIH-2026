/**
 * Records a short spoken question and returns it as 16 kHz mono WAV in base64,
 * which is what speech recognition wants. The browser only offers compressed
 * formats from MediaRecorder, so the recording is decoded and re-encoded here.
 *
 * The microphone is opened only when start() is called, which the UI does from
 * a tap, never on page load.
 */
const TARGET_RATE = 16000;

export class MicDenied extends Error {}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return buffer;
}

function toBase64(buf: ArrayBuffer): string {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface Recorder {
  /** Stops recording and resolves with the WAV as base64. */
  stop(): Promise<string>;
  /** Stops and throws the recording away. */
  cancel(): void;
}

export async function startRecording(): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new MicDenied('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new MicDenied('denied');
  }
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    cancel() {
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
    stop() {
      return new Promise<string>((resolve, reject) => {
        rec.onstop = async () => {
          release();
          try {
            const raw = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
            const ctx = new AudioContext();
            const decoded = await ctx.decodeAudioData(raw);
            void ctx.close();
            const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * TARGET_RATE)), TARGET_RATE);
            const src = off.createBufferSource();
            src.buffer = decoded;
            src.connect(off.destination);
            src.start();
            const rendered = await off.startRendering();
            resolve(toBase64(encodeWav(rendered.getChannelData(0), TARGET_RATE)));
          } catch (e) {
            reject(e);
          }
        };
        if (rec.state !== 'inactive') rec.stop();
      });
    },
  };
}
