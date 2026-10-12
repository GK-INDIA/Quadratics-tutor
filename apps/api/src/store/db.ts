import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type DB = Database.Database;

/**
 * Ordered migrations. Append only; never edit one that has shipped.
 * `turns` is the append-only source of truth. `concept_progress` is a
 * projection of it, keyed by student so it carries across sessions.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    state_json TEXT NOT NULL,
    -- Versions are pinned when the session starts; see DESIGN.md "Iterability".
    prompt_version TEXT NOT NULL,
    curriculum_version TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    model_config TEXT NOT NULL,
    is_simulated INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX sessions_student ON sessions(student_id, started_at);

  CREATE TABLE concept_progress (
    student_id TEXT NOT NULL REFERENCES students(id),
    concept_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct_attempts INTEGER NOT NULL DEFAULT 0,
    strategies_used TEXT NOT NULL DEFAULT '[]',
    last_misconception TEXT,
    next_review_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (student_id, concept_id)
  );

  CREATE TABLE turns (
    id TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    turn_index INTEGER NOT NULL,
    concept_id TEXT NOT NULL,
    transcript TEXT,
    stt_confidence REAL,
    evaluation_json TEXT,
    grade TEXT,
    decision_json TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    models_used TEXT NOT NULL DEFAULT '[]',
    degraded TEXT NOT NULL DEFAULT '[]',
    timings_json TEXT NOT NULL DEFAULT '{}',
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    -- End of student speech to first tutor audio, reported by the browser afterwards.
    client_first_audio_ms INTEGER,
    created_at TEXT NOT NULL,
    PRIMARY KEY (session_id, id)
  );
  CREATE INDEX turns_created ON turns(created_at);

  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    concept_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    raw TEXT NOT NULL,
    extracted_json TEXT NOT NULL,
    grade TEXT NOT NULL,
    grader TEXT NOT NULL
  );
  CREATE INDEX attempts_student ON attempts(student_id, concept_id);

  CREATE TABLE misconceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    concept_id TEXT NOT NULL,
    type TEXT NOT NULL,
    evidence TEXT NOT NULL
  );

  CREATE TABLE whiteboard_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    action_json TEXT NOT NULL
  );
  CREATE INDEX whiteboard_session ON whiteboard_events(session_id, id);

  CREATE TABLE llm_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    model TEXT,
    request_json TEXT NOT NULL,
    response_text TEXT,
    error TEXT,
    latency_ms INTEGER NOT NULL,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  `,
];

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]!);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}
