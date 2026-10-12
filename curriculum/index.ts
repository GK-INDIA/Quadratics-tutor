import { Concept } from '@tutor/shared';
import type { z } from 'zod';
import standardForm from './v1/01-standard-form';
import roots from './v1/02-roots';
import factorisation from './v1/03-factorisation';
import quadraticFormula from './v1/04-quadratic-formula';
import discriminant from './v1/05-discriminant';
import wordProblems from './v1/06-word-problems';

/** Bump when concept ids, item ids or mastery-relevant content change. Sessions pin the version they started on. */
export const CURRICULUM_VERSION = 'curriculum-v1';

export type ConceptInput = z.input<typeof Concept>;

const raw: ConceptInput[] = [standardForm, roots, factorisation, quadraticFormula, discriminant, wordProblems];

/** Parsed once at import; a malformed concept file fails startup, not a student's turn. */
export const CONCEPTS: Concept[] = raw.map((c) => Concept.parse(c)).sort((a, b) => a.order - b.order);

export function getConcept(id: string): Concept {
  const concept = CONCEPTS.find((c) => c.id === id);
  if (!concept) throw new Error(`Unknown concept: ${id}`);
  return concept;
}
