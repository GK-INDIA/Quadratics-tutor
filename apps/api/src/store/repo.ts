import { randomUUID } from 'node:crypto';
import {
  type BoardOp,
  type ConceptProgress,
  type Decision,
  type Evaluation,
  type Grade,
  type Segment,
  TutorState,
} from '@tutor/shared';
import type { DB } from './db';

export interface SessionRow {
  id: string;
  studentId: string;
  status: string;
  state: TutorState;
  promptVersion: string;
  curriculumVersion: string;
  policyVersion: string;
  isSimulated: boolean;
}

export interface LlmCall {
  purpose: string;
  model: string | null;
  request: unknown;
  response: string | null;
  error: string | null;
  latencyMs: number;
  costUsd: number;
}

export interface TurnRecord {
  id: string;
  sessionId: string;
  studentId: string;
  conceptId: string;
  transcript: string | null;
  sttConfidence: number | null;
  evaluation: Evaluation | null;
  grade: Grade | null;
  decision: Decision;
  segments: Segment[];
  modelsUsed: string[];
  degraded: string[];
  timings: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  /** Present when this turn counted as an attempt at a check item. */
  attempt: { itemId: string; extracted: unknown; grade: Grade; grader: string } | null;
  misconception: string | null;
  llmCalls: LlmCall[];
}

export interface StoredTurn {
  id: string;
  turnIndex: number;
  conceptId: string;
  transcript: string | null;
  evaluation: Evaluation | null;
  grade: Grade | null;
  decision: Decision;
  segments: Segment[];
  degraded: string[];
  timings: Record<string, number>;
  createdAt: string;
}

const now = () => new Date().toISOString();

export function createRepo(db: DB) {
  const toSession = (r: any): SessionRow => ({
    id: r.id,
    studentId: r.student_id,
    status: r.status,
    state: TutorState.parse(JSON.parse(r.state_json)),
    promptVersion: r.prompt_version,
    curriculumVersion: r.curriculum_version,
    policyVersion: r.policy_version,
    isSimulated: r.is_simulated === 1,
  });

  const toTurn = (r: any): StoredTurn => ({
    id: r.id,
    turnIndex: r.turn_index,
    conceptId: r.concept_id,
    transcript: r.transcript,
    evaluation: r.evaluation_json ? JSON.parse(r.evaluation_json) : null,
    grade: r.grade,
    decision: JSON.parse(r.decision_json),
    segments: JSON.parse(r.segments_json),
    degraded: JSON.parse(r.degraded),
    timings: JSON.parse(r.timings_json),
    createdAt: r.created_at,
  });

  const repo = {
    db,

    upsertStudent(id: string | undefined, name: string): { id: string; name: string } {
      const existing = id ? (db.prepare('SELECT id, name FROM students WHERE id = ?').get(id) as any) : undefined;
      if (existing) return existing;
      const student = { id: `stu_${randomUUID()}`, name };
      db.prepare('INSERT INTO students (id, name, created_at) VALUES (?, ?, ?)').run(student.id, name, now());
      return student;
    },

    createSession(input: {
      studentId: string;
      state: TutorState;
      promptVersion: string;
      curriculumVersion: string;
      policyVersion: string;
      modelConfig: unknown;
      isSimulated: boolean;
    }): string {
      const id = `ses_${randomUUID()}`;
      db.prepare(
        `INSERT INTO sessions (id, student_id, started_at, state_json, prompt_version, curriculum_version, policy_version, model_config, is_simulated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.studentId,
        now(),
        JSON.stringify(input.state),
        input.promptVersion,
        input.curriculumVersion,
        input.policyVersion,
        JSON.stringify(input.modelConfig),
        input.isSimulated ? 1 : 0,
      );
      return id;
    },

    getSession(id: string): SessionRow | null {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
      return row ? toSession(row) : null;
    },

    getProgress(studentId: string, conceptIds: string[]): ConceptProgress[] {
      const rows = db.prepare('SELECT * FROM concept_progress WHERE student_id = ?').all(studentId) as any[];
      return conceptIds.map((conceptId) => {
        const r = rows.find((x) => x.concept_id === conceptId);
        return {
          conceptId,
          status: r?.status ?? 'not_started',
          attempts: r?.attempts ?? 0,
          correctAttempts: r?.correct_attempts ?? 0,
          strategiesUsed: r ? JSON.parse(r.strategies_used) : [],
          lastMisconception: r?.last_misconception ?? null,
        };
      });
    },

    getTurn(sessionId: string, turnId: string): StoredTurn | null {
      const row = db.prepare('SELECT * FROM turns WHERE session_id = ? AND id = ?').get(sessionId, turnId);
      return row ? toTurn(row) : null;
    },

    listTurns(sessionId: string): StoredTurn[] {
      return (db.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index').all(sessionId) as any[]).map(toTurn);
    },

    lastTurn(sessionId: string): StoredTurn | null {
      const row = db.prepare('SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index DESC LIMIT 1').get(sessionId);
      return row ? toTurn(row) : null;
    },

    /** Board ops since the last clear, for redrawing the board after a refresh. */
    currentBoard(sessionId: string): BoardOp[] {
      const ops = (
        db.prepare('SELECT action_json FROM whiteboard_events WHERE session_id = ? ORDER BY id').all(sessionId) as any[]
      ).map((r) => JSON.parse(r.action_json) as BoardOp);
      const lastClear = ops.map((o) => o.op).lastIndexOf('clear');
      return lastClear === -1 ? ops : ops.slice(lastClear);
    },

    /**
     * Writes everything a turn produced in one transaction, so a turn that
     * failed half-way leaves no trace in the student's progress.
     */
    commitTurn(turn: TurnRecord, nextState: TutorState, progress: ConceptProgress[], sessionDone: boolean): void {
      db.transaction(() => {
        const index = (
          db.prepare('SELECT COALESCE(MAX(turn_index), -1) + 1 AS n FROM turns WHERE session_id = ?').get(turn.sessionId) as any
        ).n as number;
        const at = now();
        db.prepare(
          `INSERT INTO turns (id, session_id, turn_index, concept_id, transcript, stt_confidence, evaluation_json, grade,
             decision_json, segments_json, models_used, degraded, timings_json, tokens_in, tokens_out, cost_usd, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          turn.id,
          turn.sessionId,
          index,
          turn.conceptId,
          turn.transcript,
          turn.sttConfidence,
          turn.evaluation ? JSON.stringify(turn.evaluation) : null,
          turn.grade,
          JSON.stringify(turn.decision),
          JSON.stringify(turn.segments),
          JSON.stringify(turn.modelsUsed),
          JSON.stringify(turn.degraded),
          JSON.stringify(turn.timings),
          turn.tokensIn,
          turn.tokensOut,
          turn.costUsd,
          at,
        );

        if (turn.attempt) {
          db.prepare(
            `INSERT INTO attempts (session_id, turn_id, student_id, concept_id, item_id, raw, extracted_json, grade, grader)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            turn.sessionId,
            turn.id,
            turn.studentId,
            turn.conceptId,
            turn.attempt.itemId,
            turn.transcript ?? '',
            JSON.stringify(turn.attempt.extracted),
            turn.attempt.grade,
            turn.attempt.grader,
          );
        }
        if (turn.misconception) {
          db.prepare(
            'INSERT INTO misconceptions (session_id, turn_id, student_id, concept_id, type, evidence) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(turn.sessionId, turn.id, turn.studentId, turn.conceptId, turn.misconception, turn.transcript ?? '');
        }

        const insertOp = db.prepare('INSERT INTO whiteboard_events (session_id, turn_id, seq, action_json) VALUES (?, ?, ?, ?)');
        let seq = 0;
        for (const segment of turn.segments) for (const op of segment.board) insertOp.run(turn.sessionId, turn.id, seq++, JSON.stringify(op));

        const insertCall = db.prepare(
          `INSERT INTO llm_calls (session_id, turn_id, purpose, model, request_json, response_text, error, latency_ms, cost_usd, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const c of turn.llmCalls) {
          insertCall.run(turn.sessionId, turn.id, c.purpose, c.model, JSON.stringify(c.request), c.response, c.error, c.latencyMs, c.costUsd, at);
        }

        const upsert = db.prepare(
          `INSERT INTO concept_progress (student_id, concept_id, status, attempts, correct_attempts, strategies_used, last_misconception, next_review_at, updated_at)
           VALUES (@studentId, @conceptId, @status, @attempts, @correctAttempts, @strategiesUsed, @lastMisconception, @nextReviewAt, @at)
           ON CONFLICT(student_id, concept_id) DO UPDATE SET
             status = excluded.status, attempts = excluded.attempts, correct_attempts = excluded.correct_attempts,
             strategies_used = excluded.strategies_used, last_misconception = excluded.last_misconception,
             next_review_at = excluded.next_review_at, updated_at = excluded.updated_at`,
        );
        for (const p of progress) {
          if (p.status === 'not_started') continue;
          upsert.run({
            studentId: turn.studentId,
            conceptId: p.conceptId,
            status: p.status,
            attempts: p.attempts,
            correctAttempts: p.correctAttempts,
            strategiesUsed: JSON.stringify(p.strategiesUsed),
            lastMisconception: p.lastMisconception,
            nextReviewAt: p.status === 'needs_review' ? at : null,
            at,
          });
        }

        db.prepare('UPDATE sessions SET state_json = ?, status = ?, ended_at = ? WHERE id = ?').run(
          JSON.stringify(nextState),
          sessionDone ? 'completed' : 'active',
          sessionDone ? at : null,
          turn.sessionId,
        );
      })();
    },

    recordClientLatency(sessionId: string, turnId: string, ms: number): void {
      db.prepare('UPDATE turns SET client_first_audio_ms = ? WHERE session_id = ? AND id = ?').run(Math.round(ms), sessionId, turnId);
    },

    /** Spend since midnight UTC, including TTS/STT calls that are logged against a turn. */
    spendToday(): number {
      const since = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
      return (db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS s FROM turns WHERE created_at >= ?').get(since) as any).s as number;
    },
  };
  return repo;
}

export type Repo = ReturnType<typeof createRepo>;
