import { useEffect, useState } from 'react';
import { api } from './api';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ms = (n: number | null) => (n === null ? '–' : `${n} ms`);

function Metrics({ title, m }: { title: string; m: any }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt>Turns</dt>
        <dd>{m.turns}</dd>
        <dt>Turns with a fallback</dt>
        <dd>{pct(m.degradedRate)}</dd>
        <dt>Server first response, p50 / p95</dt>
        <dd>
          {ms(m.firstResponseMs.p50)} / {ms(m.firstResponseMs.p95)}
        </dd>
        <dt>Student stopped → audio, p50 / p95</dt>
        <dd>
          {ms(m.clientFirstAudioMs.p50)} / {ms(m.clientFirstAudioMs.p95)} ({m.clientFirstAudioMs.samples} samples)
        </dd>
        <dt>Spend today</dt>
        <dd>${m.spendTodayUsd.toFixed(4)}</dd>
      </dl>
      <h3 className="mt-3 text-sm font-medium">Re-teach rate by concept</h3>
      <ul className="text-sm text-stone-700">
        {Object.entries(m.reteachRateByConcept as Record<string, number>).map(([id, rate]) => (
          <li key={id}>
            {id}: {pct(rate)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Read-only view for whoever is looking after the tutor: headline numbers and turn-by-turn replays. */
export function Admin() {
  const [metrics, setMetrics] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [open, setOpen] = useState<{ session: any; turns: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.adminMetrics(), api.adminSessions()])
      .then(([m, s]) => {
        setMetrics(m);
        setSessions(s);
      })
      .catch(() => setError('Could not load. Open the tutor first and enter the passcode.'));
  }, []);

  if (error) return <p className="p-6 text-rose-700">{error}</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Tutor health</h1>
      {metrics && (
        <div className="grid gap-4 md:grid-cols-2">
          <Metrics title="Real sessions" m={metrics.real} />
          <Metrics title="Simulated sessions" m={metrics.simulated} />
        </div>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Sessions</h2>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {sessions.map((s) => (
            <li key={s.id}>
              <button className="flex w-full justify-between py-1.5 text-left hover:bg-stone-50" onClick={() => void api.adminSession(s.id).then(setOpen)}>
                <span>
                  {s.student} {s.isSimulated ? '(simulated)' : ''} · {s.turns} turns · {s.status}
                </span>
                <span className="text-stone-500">
                  {new Date(s.startedAt).toLocaleString()} · {s.promptVersion}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">Replay</h2>
          <ol className="mt-2 space-y-3 text-sm">
            {open.turns.map((t) => (
              <li key={t.id} className="border-l-2 border-stone-200 pl-3">
                {t.transcript !== null && <p className="text-stone-600">Student: “{t.transcript}”</p>}
                <p className="font-medium">
                  {t.decision.action} <span className="font-normal text-stone-500">({t.decision.reasonCode}{t.grade ? `, graded ${t.grade}` : ''})</span>
                </p>
                <p className="text-stone-700">{t.decision.reason}</p>
                <p className="mt-1 text-stone-500">Tutor: {t.segments.map((s: any) => s.say).join(' ')}</p>
                {t.degraded.length > 0 && <p className="text-rose-700">Fell back: {t.degraded.join(', ')}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
