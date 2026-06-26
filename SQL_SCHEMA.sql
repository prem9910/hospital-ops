-- ============================================================
-- Hospital Operations Management System — Complete SQL Schema
-- Supabase (PostgreSQL) — Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── DEPARTMENTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  head      TEXT DEFAULT '',
  contact   TEXT DEFAULT '',
  email     TEXT DEFAULT '',
  floor     TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── EMPLOYEES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  username    TEXT DEFAULT '',
  dept        TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  password    TEXT DEFAULT '',
  contact     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── ADMINS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT '',
  username   TEXT NOT NULL UNIQUE,
  email      TEXT DEFAULT '',
  password   TEXT DEFAULT '',
  role       TEXT DEFAULT '',
  dept       TEXT DEFAULT '',
  perms      JSONB DEFAULT '[]',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TASKS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  dept               TEXT DEFAULT '',
  freq               TEXT DEFAULT 'daily',
  assigned_to        JSONB DEFAULT '[]',
  assignee_emails    JSONB DEFAULT '[]',
  time               TEXT DEFAULT '',
  sched_date         TEXT DEFAULT '',
  priority           TEXT DEFAULT 'medium',
  notes              TEXT DEFAULT '',
  last_done          TEXT DEFAULT '',
  status             TEXT DEFAULT 'pending',
  done_by            TEXT DEFAULT '',
  done_time          TEXT DEFAULT '',
  done_remark        TEXT DEFAULT '',
  delay_reason       TEXT DEFAULT '',
  is_delayed         BOOLEAN DEFAULT false,
  created            TEXT DEFAULT '',
  created_by         TEXT DEFAULT '',
  activity_log       JSONB DEFAULT '[]',
  completion_history JSONB DEFAULT '[]',
  parent_task_id     TEXT DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_dept ON tasks(dept);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ─── ISSUES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  dept           TEXT DEFAULT '',
  priority       TEXT DEFAULT 'medium',
  reporter       TEXT DEFAULT '',
  assigned       TEXT DEFAULT '',
  description    TEXT DEFAULT '',
  status         TEXT DEFAULT 'open',
  date           TEXT DEFAULT '',
  resolve_remark TEXT DEFAULT '',
  resolve_by     TEXT DEFAULT '',
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);

-- ─── HANDOVERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handovers (
  id          TEXT PRIMARY KEY,
  name        TEXT DEFAULT '',
  designation TEXT DEFAULT '',
  dept        TEXT DEFAULT '',
  date        TEXT DEFAULT '',
  handover_to TEXT DEFAULT '',
  tasks       TEXT DEFAULT '',
  pending     TEXT DEFAULT '',
  supervisor  TEXT DEFAULT '',
  status      TEXT DEFAULT 'pending',
  created_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── DELEGATIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delegations (
  id           TEXT PRIMARY KEY,
  task_name    TEXT DEFAULT '',
  dept         TEXT DEFAULT '',
  priority     TEXT DEFAULT 'medium',
  doer_id      TEXT DEFAULT '',
  doer_name    TEXT DEFAULT '',
  delegated_by TEXT DEFAULT '',
  exp_date     TEXT DEFAULT '',
  exp_time     TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',
  created_date TEXT DEFAULT '',
  actual_date  TEXT DEFAULT '',
  actual_time  TEXT DEFAULT '',
  done_remark  TEXT DEFAULT '',
  delay_reason TEXT DEFAULT '',
  is_delayed   BOOLEAN DEFAULT false,
  extensions   JSONB DEFAULT '[]',
  activity_log JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delegations_doer ON delegations(doer_name);
CREATE INDEX IF NOT EXISTS idx_delegations_status ON delegations(status);

-- ─── ACTIVITY LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id        TEXT PRIMARY KEY,
  by_user   TEXT DEFAULT '',
  role      TEXT DEFAULT '',
  action    TEXT DEFAULT '',
  details   TEXT DEFAULT '',
  at_str    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actlog_created ON activity_log(created_at DESC);

-- ─── TRASH ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trash (
  id             TEXT PRIMARY KEY,
  type           TEXT DEFAULT '',
  data           JSONB DEFAULT '{}',
  deleted_by     TEXT DEFAULT '',
  deleted_at     TIMESTAMPTZ DEFAULT now(),
  auto_delete_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── USER LINKS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_links (
  id       TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  name     TEXT DEFAULT '',
  url      TEXT DEFAULT '',
  emoji    TEXT DEFAULT '🔗',
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_links_username ON user_links(username);

-- ─── NOTICES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id         TEXT PRIMARY KEY,
  to_emp_id  TEXT DEFAULT '',
  to_name    TEXT DEFAULT '',
  from_name  TEXT DEFAULT '',
  subject    TEXT DEFAULT '',
  message    TEXT DEFAULT '',
  type       TEXT DEFAULT 'general',
  is_read    BOOLEAN DEFAULT false,
  sent_at    TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MIGRATIONS — Run these if tables already exist (adds missing columns)
-- ============================================================
ALTER TABLE departments ADD COLUMN IF NOT EXISTS head TEXT DEFAULT '';
ALTER TABLE employees   ADD COLUMN IF NOT EXISTS is_incharge BOOLEAN DEFAULT false;
ALTER TABLE employees   ADD COLUMN IF NOT EXISTS perms JSONB DEFAULT '[]';

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Using service_role key from frontend — RLS is enforced at DB level
-- For production, switch to anon key + RLS policies below
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trash ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_links ENABLE ROW LEVEL SECURITY;

-- Since we use service_role key, allow all for now
-- (service_role bypasses RLS by default)
-- For anon key: replace with specific authenticated user policies

CREATE POLICY "service_role_all_departments" ON departments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_employees" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_admins" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_issues" ON issues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_handovers" ON handovers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_delegations" ON delegations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_actlog" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_trash" ON trash FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_links" ON user_links FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_notices" ON notices FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- REALTIME (Enable for live subscriptions)
-- ============================================================
-- Run in Supabase Dashboard → Database → Replication → Add table to realtime:
-- tasks, issues, departments, employees, delegations, admins

-- ============================================================
-- SAMPLE: Enable realtime via SQL
-- ============================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE tasks, issues, departments, employees, delegations, admins, notices;
COMMIT;
