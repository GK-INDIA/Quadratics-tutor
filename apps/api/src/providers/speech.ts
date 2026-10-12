import { createHash } from 'node:crypto';
import type { Config } from '../config';
import { ProviderError, fetchWithTimeout } from './resilience';

export interface STT {
  transcribe(audio: Buffer, format: string): Promise<{ text: string }>;
}

export interface TTS {
  /** Returns base64-encoded mp3. */
  speak(text: string): Promise<string>;
}

type SpeechConfig = Pick<Config, 'openRouterKey' | 'models' | 'ttsVoice' | 'timeouts'>;

const auth = (config: SpeechConfig) => {
  if (!config.openRouterKey) throw new ProviderError('no_key', 'OPENROUTER_API_KEY is not set', false);
  return { Authorization: `Bearer ${config.openRouterKey}`, 'Content-Type': 'application/json' };
};

export function createOpenRouterSTT(config: SpeechConfig): STT {
  return {
    async transcribe(audio, format) {
      const res = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: auth(config),
          body: JSON.stringify({
            model: config.models.stt,
            input_audio: { data: audio.toString('base64'), format },
            language: 'en',
          }),
        },
        config.timeouts.sttMs,
      );
      const json: any = await res.json().catch(() => null);
      if (typeof json?.text !== 'string') throw new ProviderError('garbage', 'Transcription response had no text');
      return { text: json.text.trim() };
    },
  };
}

export function createOpenRouterTTS(config: SpeechConfig): TTS {
  return {
    async speak(text) {
      const res = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/audio/speech',
        {
          method: 'POST',
          headers: auth(config),
          body: JSON.stringify({ model: config.models.tts, input: text, voice: config.ttsVoice, response_format: 'mp3' }),
        },
        config.timeouts.ttsMs,
      );
      const bytes = Buffer.from(await res.arrayBuffer().catch(() => {
        throw new ProviderError('timeout', 'Audio did not finish downloading in time');
      }));
      if (bytes.length < 200) throw new ProviderError('garbage', 'Speech response was too small to be audio');
      return bytes.toString('base64');
    },
  };
}

/**
 * Most of what the tutor says is authored script (teaching steps, questions,
 * hints), so the same sentences are synthesised again and again. Caching by
 * text removes TTS latency and cost for those entirely.
 */
export function cachedTTS(inner: TTS, voiceKey: string, maxEntries = 500): TTS {
  const cache = new Map<string, Promise<string>>();
  return {
    speak(text) {
      const key = createHash('sha1').update(voiceKey).update(text).digest('hex');
      const hit = cache.get(key);
      if (hit) {
        cache.delete(key); // re-insert to mark as recently used
        cache.set(key, hit);
        return hit;
      }
      const pending = inner.speak(text);
      cache.set(key, pending);
      pending.catch(() => cache.delete(key));
      if (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
      return pending;
    },
  };
}
