-- Phase 2: certificates, scheduled / retention tests, user roles (trainer, HOD)

ALTER TABLE sessions ADD COLUMN source_session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN open_at TIMESTAMPTZ;           -- opens automatically at this time
ALTER TABLE sessions ADD COLUMN close_at TIMESTAMPTZ;          -- closes automatically at this time
ALTER TABLE sessions ADD COLUMN issue_certificates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE sessions ADD COLUMN cert_valid_months INTEGER NOT NULL DEFAULT 0;   -- 0 = no expiry

ALTER TABLE attempts ADD COLUMN cert_code TEXT UNIQUE;
ALTER TABLE attempts ADD COLUMN scan_flags JSONB;              -- rows the photo reader was unsure about

-- certificates for people who already passed
UPDATE attempts SET cert_code = upper(substr(md5(random()::text || id::text), 1, 10))
WHERE passed = true AND submitted_at IS NOT NULL AND cert_code IS NULL;

CREATE TABLE app_users (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,                      -- trainer | hod
  depts          JSONB NOT NULL DEFAULT '[]',        -- departments an HOD can see
  key_hash       TEXT NOT NULL UNIQUE,
  key_hint       TEXT,
  active         BOOLEAN NOT NULL DEFAULT true,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
