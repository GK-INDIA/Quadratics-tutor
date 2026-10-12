import type { ConceptProgress, Decision, Segment, TurnEvent } from '@tutor/shared';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type AppConfig, api, settings } from './api';
import { type Listener, browserRecognitionAvailable, createRecogniser, createRecorder } from './audio/listen';
import { Speaker } from './audio/player';
import { type BoardState, EMPTY_BOARD, applyOps } from './board';
import { DebugDrawer, type TurnDebug } from './components/DebugDrawer';
import { ProgressRail } from './components/ProgressRail';
import { WhyPanel } from './components/WhyPanel';
import { Whiteboard } from './components/Whiteboard';

type Status = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';
interface Line {
  who: 'tutor' | 'you';
  text: string;
}
interface Saved {
  studentId?: string;
  name?: string;
  sessionId?: string;
}

const loadSaved = (): Saved => JSON.parse(localStorage.getItem('tutor') ?? '{}');
const save = (patch: Saved) => localStorage.setItem('tutor', JSON.stringify({ ...loadSaved(), ...patch }));

/** Shown if the tutor has said nothing this long after the student finished. */
const SLOW_TURN_MS = 1500;

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Your turn. Tap the microphone and answer, or type below.',
  listening: 'Listening… tap again when you have finished.',
  transcribing: 'Working out what you said…',
  thinking: 'Thinking…',
  speaking: 'The tutor is speaking. Tap the microphone to interrupt.',
};

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [name, setName] = useState(loadSaved().name ?? '');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [progress, setProgress] = useState<ConceptProgress[]>([]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [typed, setTyped] = useState('');
  const [debug, setDebug] = useState<TurnDebug | null>(null);
  const [faults, setFaults] = useState<string[]>([]);
  const [failed, setFailed] = useState<{ turnId: string; transcript: string } | null>(null);
  /** Set once server transcription has failed, so later turns use the browser's recogniser. */
  const [useBrowserStt, setUseBrowserStt] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const listener = useRef<Listener | null>(null);
  /** The turn whose first audio has not started yet, for the latency measurement. */
  const pending = useRef<{ turnId: string; since: number } | null>(null);
  const streamOpen = useRef(false);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;

  const speaker = useMemo(
    () =>
      new Speaker(
        (segment: Segment) => {
          setSlow(false);
          setStatus('speaking');
          setBoard((b) => applyOps(b, segment.board));
          setLines((l) => [...l, { who: 'tutor', text: segment.say }]);
          const turn = pending.current;
          if (turn && sessionRef.current) {
            const ms = Math.round(performance.now() - turn.since);
            pending.current = null;
            setDebug((d) => (d ? { ...d, firstAudioMs: ms } : { evaluation: null, grade: null, degraded: [], timings: {}, firstAudioMs: ms }));
            void api.reportLatency(sessionRef.current, turn.turnId, ms);
          }
        },
        () => !streamOpen.current && setStatus('idle'),
      ),
    [],
  );

  useEffect(() => {
    settings.faults = faults.map((f) => `${f}:1`).join(',');
  }, [faults]);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.config());
      setNeedsPasscode(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedsPasscode(true);
      else setNotice('Could not reach the tutor. Check your connection and reload.');
    }
  }, []);
  useEffect(() => void loadConfig(), [loadConfig]);

  const voice = config?.serverVoice ? 'server' : 'browser';

  const onEvent = useCallback(
    (event: TurnEvent) => {
      if (event.type === 'decision') {
        setDecision(event.decision);
        setDebug({ evaluation: event.evaluation, grade: event.grade, degraded: [], timings: {}, firstAudioMs: null });
      } else if (event.type === 'segment') {
        speaker.enqueue({ segment: event.segment, audio: event.audio });
      } else if (event.type === 'done') {
        setProgress(event.progress);
        setDebug((d) => d && { ...d, degraded: event.degraded, timings: event.timings });
      } else {
        setNotice(event.message);
      }
    },
    [speaker],
  );

  const start = async (resume: boolean) => {
    setNotice(null);
    const saved = loadSaved();
    try {
      if (resume && saved.sessionId) {
        const r = await api.resume(saved.sessionId);
        setSessionId(r.sessionId);
        setBoard(applyOps(EMPTY_BOARD, r.board));
        setProgress(r.progress);
        setDecision(r.lastDecision);
        const last = r.lastSaid.at(-1);
        if (last) speaker.enqueue({ segment: { say: `Welcome back. ${last}`, board: [] } });
        return;
      }
      const s = await api.start({ name: name.trim() || 'Student', studentId: saved.studentId, voice });
      save({ studentId: s.studentId, name: s.studentName, sessionId: s.sessionId });
      setSessionId(s.sessionId);
      setBoard(EMPTY_BOARD);
      setLines([]);
      s.events.forEach(onEvent);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        save({ sessionId: undefined });
        setNotice('That lesson could not be found. Start a new one.');
      } else setNotice('Could not start the lesson. Please try again.');
    }
  };

  const sendTurn = useCallback(
    async (transcript: string, confidence?: number, retryId?: string) => {
      if (!sessionRef.current) return;
      const turnId = retryId ?? crypto.randomUUID();
      setFailed(null);
      setNotice(null);
      if (transcript) setLines((l) => (retryId ? l : [...l, { who: 'you', text: transcript }]));
      setStatus('thinking');
      pending.current ??= { turnId, since: performance.now() };
      pending.current.turnId = turnId;
      const slowTimer = setTimeout(() => setSlow(true), SLOW_TURN_MS);
      abort.current = new AbortController();
      streamOpen.current = true;
      try {
        await api.turn({ sessionId: sessionRef.current, turnId, transcript, sttConfidence: confidence, voice }, onEvent, abort.current.signal);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Re-sending the same turn id is safe: the server replays it if it already ran.
          setFailed({ turnId, transcript });
          setNotice('The connection dropped before the tutor could answer.');
        }
      } finally {
        clearTimeout(slowTimer);
        setSlow(false);
        streamOpen.current = false;
        if (!speaker.busy) setStatus('idle');
      }
    },
    [onEvent, speaker, voice],
  );

  const interrupt = () => {
    abort.current?.abort();
    speaker.stop();
  };

  const onMic = async () => {
    if (status === 'listening') {
      const since = performance.now();
      setStatus('transcribing');
      try {
        const heard = await listener.current!.stop();
        let text = heard.text ?? '';
        if (heard.audio) text = (await api.stt(heard.audio)).text;
        pending.current = { turnId: '', since };
        await sendTurn(text, heard.confidence);
      } catch {
        setStatus('idle');
        if (voice === 'server' && !useBrowserStt && browserRecognitionAvailable()) {
          setUseBrowserStt(true);
          setNotice('I could not transcribe that. I have switched to your browser’s speech recognition; please say it again.');
        } else setNotice('I could not hear that. Please try again, or type your answer below.');
      }
      return;
    }
    if (status === 'transcribing') return;
    interrupt();
    try {
      listener.current = voice === 'server' && !useBrowserStt ? createRecorder() : createRecogniser();
      await listener.current.start();
      setNotice(null);
      setStatus('listening');
    } catch {
      setStatus('idle');
      setNotice('The microphone is not available. You can type your answer below instead.');
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = typed.trim();
    if (!text || status === 'listening' || status === 'transcribing') return;
    interrupt();
    setTyped('');
    pending.current = { turnId: '', since: performance.now() };
    void sendTurn(text);
  };

  if (needsPasscode) {
    return (
      <Centered>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            settings.passcode = new FormData(e.currentTarget).get('passcode') as string;
            void loadConfig();
          }}
        >
          <h1 className="text-xl font-semibold">Quadratics Tutor</h1>
          <label className="block text-sm">
            Passcode
            <input name="passcode" type="password" autoFocus className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" />
          </label>
          <button className="w-full rounded-md bg-stone-900 px-4 py-2 font-medium text-white">Continue</button>
        </form>
      </Centered>
    );
  }

  if (!sessionId) {
    const saved = loadSaved();
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Quadratics Tutor</h1>
        <p className="mt-1 text-sm text-stone-600">
          A voice tutor for Class 10 quadratic equations. It explains, asks you a question, and decides what to do next based on your answer.
        </p>
        <label className="mt-4 block text-sm">
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2" />
        </label>
        <button disabled={!config} onClick={() => void start(false)} className="mt-3 w-full rounded-md bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-50">
          {saved.studentId ? 'Start a new lesson' : 'Start the lesson'}
        </button>
        {saved.sessionId && (
          <button disabled={!config} onClick={() => void start(true)} className="mt-2 w-full rounded-md border border-stone-300 px-4 py-2 font-medium disabled:opacity-50">
            Continue where I left off
          </button>
        )}
        {config && !config.serverVoice && (
          <p className="mt-3 text-xs text-stone-500">Running without an API key: the tutor uses its scripted explanations and your browser’s voice.</p>
        )}
        {notice && <p className="mt-3 text-sm text-rose-700">{notice}</p>}
      </Centered>
    );
  }

  const listening = status === 'listening';
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <main className="flex min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1">
          <Whiteboard board={board} />
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <p className="min-h-12 text-stone-800" aria-live="polite">
            {lines.filter((l) => l.who === 'tutor').at(-1)?.text ?? ''}
          </p>
          {lines.at(-1)?.who === 'you' && <p className="mt-1 text-sm text-stone-500">You said: “{lines.at(-1)!.text}”</p>}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void onMic()}
            aria-pressed={listening}
            aria-label={listening ? 'Stop and send' : 'Speak'}
            className={`h-14 w-14 shrink-0 rounded-full text-2xl text-white shadow ${listening ? 'animate-pulse bg-rose-600' : 'bg-stone-900'}`}
          >
            {listening ? '■' : '🎤'}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-stone-600">{slow ? 'Got it, let me think…' : STATUS_TEXT[status]}</p>
            <form onSubmit={onSubmit} className="mt-1 flex gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Or type your answer"
                maxLength={500}
                className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              />
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium">Send</button>
            </form>
          </div>
        </div>

        {notice && (
          <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-800">
            {notice}{' '}
            {failed && (
              <button className="font-medium underline" onClick={() => void sendTurn(failed.transcript, undefined, failed.turnId)}>
                Try again
              </button>
            )}
          </p>
        )}
      </main>

      <aside className="space-y-3">
        <ProgressRail concepts={config?.concepts ?? []} progress={progress} currentId={decision?.nextConceptId ?? decision?.conceptId ?? null} />
        <WhyPanel decision={decision} />
        <DebugDrawer debug={debug} faults={faults} onFaults={setFaults} faultInjection={config?.faultInjection ?? false} />
        <a href="#admin" target="_blank" rel="noreferrer" className="block text-xs text-stone-500 underline">
          Session replays and metrics
        </a>
      </aside>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">{children}</div>
    </div>
  );
}
