-- Update 4: department master list, department-scoped trainers, owner of sessions and banks

CREATE TABLE departments (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  max_trainers  INTEGER NOT NULL DEFAULT 5,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX departments_name_key ON departments (lower(name));

ALTER TABLE sessions ADD COLUMN dept TEXT;                 -- NULL = plant-wide
ALTER TABLE sessions ADD COLUMN created_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE banks ADD COLUMN dept TEXT;                    -- NULL = shared by all trainers
ALTER TABLE banks ADD COLUMN created_by INTEGER REFERENCES app_users(id) ON DELETE SET NULL;

-- seed the department list from names already in use
INSERT INTO departments (name)
SELECT DISTINCT ON (lower(d)) d FROM (
  SELECT trim(dept) AS d FROM attempts WHERE coalesce(trim(dept), '') <> ''
  UNION ALL
  SELECT trim(r->>'dept') FROM sessions, jsonb_array_elements(roster) r WHERE coalesce(trim(r->>'dept'), '') <> ''
  UNION ALL
  SELECT trim(x) FROM app_users, jsonb_array_elements_text(depts) x WHERE coalesce(trim(x), '') <> ''
) s ORDER BY lower(d), d
ON CONFLICT DO NOTHING;
