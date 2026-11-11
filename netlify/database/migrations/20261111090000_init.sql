-- Training Effectiveness & Assessment System: initial schema

CREATE TABLE banks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  topic       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id           SERIAL PRIMARY KEY,
  bank_id      INTEGER NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  qtype        TEXT NOT NULL DEFAULT 'single',      -- single | multi | tf
  text         TEXT NOT NULL,
  options      JSONB NOT NULL,                      -- ["option 1", "option 2", ...]
  answer       JSONB NOT NULL,                      -- [0] or [0, 2]  (0-based option indexes)
  explanation  TEXT,
  topic        TEXT,
  difficulty   TEXT,                                -- easy | medium | hard
  source_ref   TEXT,                                -- e.g. "SOP-12.pdf, p.4"
  origin       TEXT NOT NULL DEFAULT 'manual',      -- ai-generated | extracted | excel | manual
  status       TEXT NOT NULL DEFAULT 'draft',       -- draft | approved
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX questions_bank_idx ON questions(bank_id);

CREATE TABLE sessions (
  id              SERIAL PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  trainer         TEXT,
  venue           TEXT,
  training_date   DATE,
  stype           TEXT NOT NULL DEFAULT 'standalone', -- pre | post | standalone
  pre_session_id  INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  time_limit_min  INTEGER NOT NULL DEFAULT 0,
  pass_mark       INTEGER NOT NULL DEFAULT 60,
  shuffle         BOOLEAN NOT NULL DEFAULT true,
  show_answers    BOOLEAN NOT NULL DEFAULT true,
  negative_mark   NUMERIC NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',      -- draft | open | closed
  questions       JSONB NOT NULL DEFAULT '[]',        -- snapshot of questions at creation
  roster          JSONB NOT NULL DEFAULT '[]',        -- [{empId, name, dept}]
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attempts (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  emp_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  dept          TEXT,
  token         TEXT NOT NULL,
  layout        JSONB NOT NULL DEFAULT '[]',          -- per-person question/option order
  answers       JSONB NOT NULL DEFAULT '{}',          -- {"<qIndex>": [optIndex, ...]}
  tab_switches  INTEGER NOT NULL DEFAULT 0,
  mode          TEXT NOT NULL DEFAULT 'online',       -- online | paper
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  score         NUMERIC,
  max_score     NUMERIC,
  percent       NUMERIC,
  passed        BOOLEAN,
  UNIQUE (session_id, emp_id)
);
CREATE INDEX attempts_session_idx ON attempts(session_id);
