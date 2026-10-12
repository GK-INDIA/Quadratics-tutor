/**
 * Two ways to hear the student, behind one interface:
 *  - recorder: capture audio, convert to 16 kHz mono WAV, transcribe on the server
 *  - recogniser: the browser's own SpeechRecognition (Chrome, Edge, Safari)
 */
export interface Listener {
  start(): Promise<void>;
  /** Resolves with what was heard. `audio` is base64 WAV when the server should transcribe it. */
  stop(): Promise<{ text?: string; audio?: string; confidence?: number }>;
  cancel(): void;
}

const SAMPLE_RATE = 16_000;

function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Whatever container the browser records in (webm, mp4), decode it and resample to what the STT endpoint accepts. */
async function toWav(blob: Blob): Promise<string> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return toBase64(encodeWav(rendered.getChannelData(0)));
  } finally {
    void context.close();
  }
}

export function createRecorder(): Listener {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  const release = () => stream?.getTracks().forEach((t) => t.stop());
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.start();
    },
    stop() {
      return new Promise((resolve, reject) => {
        if (!recorder) return reject(new Error('not recording'));
        recorder.onstop = async () => {
          release();
          try {
            resolve({ audio: await toWav(new Blob(chunks, { type: recorder!.mimeType })) });
          } catch (err) {
            reject(err);
          }
        };
        recorder.stop();
      });
    },
    cancel() {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

const RecognitionCtor = (): (new () => Recognition) | undefined =>
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export const browserRecognitionAvailable = () => Boolean(RecognitionCtor());

export function createRecogniser(): Listener {
  let recognition: Recognition | null = null;
  let text = '';
  let confidence: number | undefined;
  let ended: Promise<void> = Promise.resolve();
  return {
    async start() {
      const Ctor = RecognitionCtor();
      if (!Ctor) throw new Error('Speech recognition is not available in this browser');
      recognition = new Ctor();
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.continuous = true;
      text = '';
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          text += `${event.results[i][0].transcript} `;
          // Some Android builds always report 0; treat that as "unknown".
          confidence = event.results[i][0].confidence || undefined;
        }
      };
      ended = new Promise((resolve) => {
        recognition!.onend = () => resolve();
        recognition!.onerror = () => resolve();
      });
      recognition.start();
    },
    async stop() {
      recognition?.stop();
      await ended;
      return { text: text.trim(), confidence };
    },
    cancel() {
      recognition?.abort();
    },
  };
}
