import type { BoardOp, ConceptProgress, Decision, TurnEvent } from '@tutor/shared';

export type Voice = 'server' | 'browser';

export interface AppConfig {
  serverVoice: boolean;
  faultInjection: boolean;
  concepts: { id: string; title: string }[];
}

export interface Resumed {
  sessionId: string;
  studentId: string;
  status: string;
  board: BoardOp[];
  progress: ConceptProgress[];
  lastDecision: Decision | null;
  lastSaid: string[];
}

/** Per-browser settings that every request carries. */
export const settings = {
  get passcode() {
    return localStorage.getItem('passcode') ?? '';
  },
  set passcode(value: string) {
    localStorage.setItem('passcode', value);
  },
  /** Fault spec from the debug drawer, e.g. "llm_timeout:1". */
  faults: '',
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const headers = () => ({
  'Content-Type': 'application/json',
  'x-passcode': settings.passcode,
  ...(settings.faults ? { 'x-faults': settings.faults } : {}),
});

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: headers() });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  config: () => json<AppConfig>('/api/config'),

  start: (body: { name: string; studentId?: string; voice: Voice }) =>
    json<{ sessionId: string; studentId: string; studentName: string; events: TurnEvent[] }>('/api/session', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resume: (sessionId: string) => json<Resumed>(`/api/session/${sessionId}`),

  /** Reads the turn's event stream line by line. Aborting the signal is how the student interrupts. */
  async turn(
    body: { sessionId: string; turnId: string; transcript: string; sttConfidence?: number; voice: Voice },
    onEvent: (event: TurnEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch('/api/turn', { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onEvent(JSON.parse(line) as TurnEvent);
      }
    }
  },

  stt: (audio: string) => json<{ text: string }>('/api/stt', { method: 'POST', body: JSON.stringify({ audio, format: 'wav' }) }),

  reportLatency: (sessionId: string, turnId: string, ms: number) =>
    json(`/api/session/${sessionId}/turn/${turnId}/latency`, { method: 'POST', body: JSON.stringify({ ms }) }).catch(() => undefined),

  adminMetrics: () => json<Record<string, any>>('/api/admin/metrics'),
  adminSessions: () => json<any[]>('/api/admin/sessions'),
  adminSession: (id: string) => json<{ session: any; turns: any[] }>(`/api/admin/sessions/${id}`),
};
