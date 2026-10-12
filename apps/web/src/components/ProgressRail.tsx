import type { ConceptProgress } from '@tutor/shared';

const STYLE: Record<ConceptProgress['status'], { dot: string; label: string }> = {
  not_started: { dot: 'bg-stone-300', label: 'Not started' },
  in_progress: { dot: 'bg-amber-500', label: 'In progress' },
  mastered: { dot: 'bg-emerald-600', label: 'Understood' },
  needs_review: { dot: 'bg-rose-500', label: 'Revisit next time' },
};

export function ProgressRail({
  concepts,
  progress,
  currentId,
}: {
  concepts: { id: string; title: string }[];
  progress: ConceptProgress[];
  currentId: string | null;
}) {
  return (
    <ol className="space-y-2">
      {concepts.map((concept, i) => {
        const p = progress.find((x) => x.conceptId === concept.id);
        const style = STYLE[p?.status ?? 'not_started'];
        const current = concept.id === currentId;
        return (
          <li key={concept.id} className={`rounded-lg border p-2.5 ${current ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white'}`}>
            <div className="flex items-start gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">
                  {i + 1}. {concept.title}
                </p>
                <p className="text-xs text-stone-500">
                  {style.label}
                  {p && p.attempts > 0 && ` · ${p.correctAttempts}/${p.attempts} correct`}
                  {p && p.strategiesUsed.length > 1 && ` · ${p.strategiesUsed.length} explanations`}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
