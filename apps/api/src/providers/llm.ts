import type { Config } from '../config';
import { ProviderError, fetchWithTimeout } from './resilience';

export interface ChatRequest {
  /** What the call is for; used in logs and by fault injection. */
  purpose: string;
  model: string;
  /** Tried in order by OpenRouter if the primary model or its provider fails. */
  fallbacks?: string[];
  system: string;
  user: string;
  /** JSON schema the reply must match. Routing is restricted to endpoints that support it. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  temperature?: number;
  timeoutMs: number;
  /** Streaming only: give up if nothing arrives within this window. */
  firstTokenMs?: number;
}

export interface ChatResult {
  text: string;
  /** The model that actually answered, which differs from the request when a fallback was used. */
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LLM {
  complete(req: ChatRequest): Promise<ChatResult>;
  /** Calls onText with each chunk as it arrives and resolves with the full reply. */
  stream(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResult>;
}

const URL = 'https://openrouter.ai/api/v1/chat/completions';

export function createOpenRouterLLM(config: Pick<Config, 'openRouterKey'>): LLM {
  const headers = () => {
    if (!config.openRouterKey) throw new ProviderError('no_key', 'OPENROUTER_API_KEY is not set', false);
    return { Authorization: `Bearer ${config.openRouterKey}`, 'Content-Type': 'application/json', 'X-Title': 'AI Tutor' };
  };

  const body = (req: ChatRequest, stream: boolean) => ({
    ...(req.fallbacks?.length ? { models: [req.model, ...req.fallbacks] } : { model: req.model }),
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    temperature: req.temperature ?? 0.2,
    max_tokens: req.maxTokens ?? 700,
    stream,
    usage: { include: true },
    ...(req.jsonSchema
      ? {
          response_format: { type: 'json_schema', json_schema: { ...req.jsonSchema, strict: true } },
          provider: { require_parameters: true },
        }
      : {}),
  });

  const usageOf = (json: any) => ({
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
    costUsd: json?.usage?.cost ?? 0,
  });

  return {
    async complete(req) {
      const res = await fetchWithTimeout(URL, { method: 'POST', headers: headers(), body: JSON.stringify(body(req, false)) }, req.timeoutMs);
      const json: any = await res.json().catch(() => null);
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim() === '') {
        throw new ProviderError('garbage', `Empty completion: ${JSON.stringify(json?.error ?? json).slice(0, 300)}`);
      }
      return { text, model: json.model ?? req.model, ...usageOf(json) };
    },

    async stream(req, onText) {
      const abort = new AbortController();
      const firstToken = setTimeout(() => abort.abort(), req.firstTokenMs ?? req.timeoutMs);
      let text = '';
      let model = req.model;
      let usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
      try {
        const res = await fetchWithTimeout(
          URL,
          { method: 'POST', headers: headers(), body: JSON.stringify(body(req, true)), signal: abort.signal },
          req.timeoutMs,
        );
        if (!res.body) throw new ProviderError('garbage', 'Streaming response had no body');
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith('data:')) continue; // SSE comments are keep-alives
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;
            let json: any;
            try {
              json = JSON.parse(data);
            } catch {
              continue;
            }
            if (json.error) throw new ProviderError('http', `Mid-stream error: ${JSON.stringify(json.error).slice(0, 300)}`);
            if (json.model) model = json.model;
            if (json.usage) usage = usageOf(json);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              clearTimeout(firstToken);
              text += delta;
              onText(delta);
            }
          }
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        // A body read aborted by either deadline surfaces here as a plain abort.
        throw new ProviderError('timeout', `Stream stalled: ${(err as Error).message}`);
      } finally {
        clearTimeout(firstToken);
      }
      if (text.trim() === '') throw new ProviderError('garbage', 'Stream ended with no content');
      return { text, model, ...usage };
    },
  };
}
