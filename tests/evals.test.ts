import { getConcept } from '@tutor/curriculum';
import { describe, expect, it } from 'vitest';
import { loadScenarios } from '../evals/lib';

/** A scenario that refers to something that no longer exists would fail for the wrong reason. */
describe('eval scenarios', () => {
  const scenarios = loadScenarios();

  it('have unique ids and say what they catch', () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
  });

  it.each(scenarios)('$id refers only to things in the curriculum', (scenario) => {
    const concept = getConcept(scenario.concept);
    const items = [...concept.items, ...concept.scaffold.items].map((i) => i.id);
    const strategies = [...concept.strategies, concept.scaffold.strategy].map((s) => s.id);
    for (const id of [scenario.given?.itemId, ...(scenario.given?.usedItemIds ?? [])]) if (id) expect(items).toContain(id);
    for (const id of scenario.given?.strategiesUsed ?? []) expect(strategies).toContain(id);
    for (const turn of scenario.turns) {
      for (const id of turn.expect.strategy_in ?? []) expect(strategies).toContain(id);
      for (const id of turn.expect.misconception ?? []) expect(Object.keys(concept.misconceptions)).toContain(id);
      for (const pattern of [...(turn.expect.says ?? []), ...(turn.expect.says_not ?? [])]) expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});
