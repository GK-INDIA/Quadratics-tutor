import type { Decision } from '@tutor/shared';

const ACTION_LABEL: Record<string, string> = {
  teach: 'Teaching a new topic',
  next_check: 'Asking a second check',
  probe: 'Asking for your reasoning',
  move_on: 'Moving on',
  reteach: 'Explaining it another way',
  scaffold: 'Breaking it into smaller steps',
  needs_review: 'Parking this topic for next time',
  hint: 'Giving a hint',
  confirm: 'Checking what I heard',
  repeat: 'Repeating',
  explain_why: 'Explaining my last decision',
  redirect: 'Back to the question',
  reprompt: 'Asking again',
  finish: 'Finished',
};

/** The tutor's last decision in its own words. The text comes from the decision record, not from the model. */
export function WhyPanel({ decision }: { decision: Decision | null }) {
  if (!decision) return null;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Why the tutor did that</h2>
      <p className="mt-1 font-medium">{ACTION_LABEL[decision.action] ?? decision.action}</p>
      <p className="mt-1 text-stone-700">{decision.reason}</p>
      {decision.counterfactual && <p className="mt-1 text-stone-500">{decision.counterfactual}</p>}
    </section>
  );
}
