import type { Evaluation, Grade } from '@tutor/shared';

export interface TurnDebug {
  evaluation: Evaluation | null;
  grade: Grade | null;
  degraded: string[];
  timings: Record<string, number>;
  firstAudioMs: number | null;
}

const FAULTS = [
  { id: 'llm_timeout', label: 'LLM times out' },
  { id: 'llm_garbage', label: 'LLM returns garbage' },
  { id: 'llm_down', label: 'LLM provider down' },
  { id: 'stt_down', label: 'Speech-to-text down' },
  { id: 'tts_down', label: 'Text-to-speech down' },
];

/** Shows what happened inside the last turn, and lets a reviewer break providers on purpose. */
export function DebugDrawer({
  debug,
  faults,
  onFaults,
  faultInjection,
}: {
  debug: TurnDebug | null;
  faults: string[];
  onFaults: (next: string[]) => void;
  faultInjection: boolean;
}) {
  const toggle = (id: string) => onFaults(faults.includes(id) ? faults.filter((f) => f !== id) : [...faults, id]);
  return (
    <details className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-500">Under the hood</summary>

      {faultInjection && (
        <fieldset className="mt-3">
          <legend className="font-medium">Break something</legend>
          <p className="text-xs text-stone-500">Applies to your requests only. The lesson should carry on.</p>
          {FAULTS.map((f) => (
            <label key={f.id} className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={faults.includes(f.id)} onChange={() => toggle(f.id)} />
              {f.label}
            </label>
          ))}
        </fieldset>
      )}

      {debug && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="font-medium">Last turn</p>
            <dl className="grid grid-cols-2 gap-x-3 text-xs text-stone-600">
              {debug.firstAudioMs !== null && (
                <>
                  <dt>You stopped → tutor audio</dt>
                  <dd className="text-right tabular-nums">{debug.firstAudioMs} ms</dd>
                </>
              )}
              {Object.entries(debug.timings).map(([name, ms]) => (
                <div key={name} className="contents">
                  <dt>{name.replace(/_ms$/, '').replace(/_/g, ' ')}</dt>
                  <dd className="text-right tabular-nums">{ms} ms</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className={debug.degraded.length ? 'text-rose-700' : 'text-emerald-700'}>
            {debug.degraded.length ? `Fell back: ${debug.degraded.join(', ')}` : 'No fallbacks used'}
          </p>
          {debug.evaluation && (
            <pre className="overflow-auto rounded bg-stone-50 p-2 text-xs">
              {JSON.stringify({ ...debug.evaluation, grade: debug.grade }, null, 1)}
            </pre>
          )}
        </div>
      )}
    </details>
  );
}
