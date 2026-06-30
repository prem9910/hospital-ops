const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'workdesk.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    is_main INTEGER DEFAULT 0,
    permissions TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    head_role TEXT,
    contact TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    designation TEXT,
    email TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    frequency TEXT DEFAULT 'DAILY',
    priority TEXT DEFAULT 'medium',
    notes TEXT,
    scheduled_date TEXT,
    assigned_to TEXT,
    created_by INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    completion_note TEXT,
    delay_reason TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(id),
    priority TEXT DEFAULT 'medium',
    description TEXT,
    reported_by TEXT,
    status TEXT DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT,
    resolution_remarks TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS delegations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    title TEXT NOT NULL,
    delegated_to TEXT,
    priority TEXT DEFAULT 'medium',
    expected_date TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    completion_note TEXT,
    delay_reason TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS handovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER REFERENCES staff(id),
    pending_work TEXT,
    supervisor TEXT,
    reason TEXT,
    approved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    emoji TEXT DEFAULT '🔗',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT,
    template_task TEXT,
    template_reminder TEXT,
    public_key TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed main admin if not exists
const existing = db.prepare('SELECT id FROM admins WHERE is_main = 1').get();
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO admins (username, password, is_main, permissions) VALUES (?, ?, 1, ?)`)
    .run('admin', hash, JSON.stringify({ all: true }));
}

// Seed sample departments
const deptCount = db.prepare('SELECT COUNT(*) as c FROM departments').get();
if (deptCount.c === 0) {
  const depts = ['General Ward', 'ICU', 'OPD', 'Pharmacy', 'Radiology', 'Laboratory', 'Administration'];
  const ins = db.prepare('INSERT INTO departments (name, head_role) VALUES (?, ?)');
  depts.forEach(d => ins.run(d, 'Head of ' + d));
}

module.exports = db;
