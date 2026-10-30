import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "resumeiq.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  experience_level TEXT NOT NULL DEFAULT 'Student / Fresher (0 years)',
  target_job_titles_json TEXT NOT NULL DEFAULT '[]',
  ats_standard TEXT NOT NULL DEFAULT 'US / Global ATS Standard',
  target_industry TEXT NOT NULL DEFAULT 'Software & SaaS',
  technical_skills_json TEXT NOT NULL DEFAULT '[]',
  job_seeking_status TEXT NOT NULL DEFAULT 'Active',
  ai_job_match_alerts INTEGER NOT NULL DEFAULT 0,
  weekly_ats_tips INTEGER NOT NULL DEFAULT 0,
  auto_tailor_bullets INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  last_active_at TEXT,
  auth_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  resume_name TEXT NOT NULL,
  job_title TEXT DEFAULT 'Target Role',
  score INTEGER NOT NULL,
  analysis_mode TEXT NOT NULL DEFAULT 'legacy',
  job_match_score INTEGER,
  ats_readability_score INTEGER,
  result_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stored_resumes (
  user_id INTEGER PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('job_match','weekly_ats_tips','bullet_point_suggestions')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  analysis_id INTEGER,
  dedupe_key TEXT NOT NULL,
  action_data_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(analysis_id) REFERENCES analyses(id) ON DELETE SET NULL,
  UNIQUE(user_id,dedupe_key)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS password_reset_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL CHECK(event_type IN ('request','complete')),
  identifier_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const userColumns = db.pragma("table_info(users)");
const profileColumns = [
  ["phone", "TEXT NOT NULL DEFAULT ''"],
  ["location", "TEXT NOT NULL DEFAULT ''"],
  ["experience_level", "TEXT NOT NULL DEFAULT 'Student / Fresher (0 years)'"],
  ["target_job_titles_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["ats_standard", "TEXT NOT NULL DEFAULT 'US / Global ATS Standard'"],
  ["target_industry", "TEXT NOT NULL DEFAULT 'Software & SaaS'"],
  ["technical_skills_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["job_seeking_status", "TEXT NOT NULL DEFAULT 'Active'"],
  ["ai_job_match_alerts", "INTEGER NOT NULL DEFAULT 0"],
  ["weekly_ats_tips", "INTEGER NOT NULL DEFAULT 0"],
  ["auto_tailor_bullets", "INTEGER NOT NULL DEFAULT 0"],
  ["role", "TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'))"],
  ["last_active_at", "TEXT"],
  ["auth_version", "INTEGER NOT NULL DEFAULT 0"],
];
for (const [name, definition] of profileColumns) {
  if (!userColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
}

const analysisColumns = db.pragma("table_info(analyses)");
if (!analysisColumns.some((column) => column.name === "user_id")) {
  db.exec("ALTER TABLE analyses ADD COLUMN user_id INTEGER");
}
for (const [name, definition] of [
  ["analysis_mode", "TEXT NOT NULL DEFAULT 'legacy'"],
  ["job_match_score", "INTEGER"],
  ["ats_readability_score", "INTEGER"],
]) {
  if (!analysisColumns.some((column) => column.name === name)) {
    db.exec(`ALTER TABLE analyses ADD COLUMN ${name} ${definition}`);
  }
}
db.exec("CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON analyses(user_id)");
db.exec("CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id,created_at DESC,id DESC)");
db.exec("CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications(user_id,is_read,created_at DESC)");
db.exec("CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)");
db.exec("CREATE INDEX IF NOT EXISTS users_last_active_idx ON users(last_active_at)");
db.exec("CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id,expires_at)");
db.exec("CREATE INDEX IF NOT EXISTS password_reset_events_ip_idx ON password_reset_events(ip_hash,event_type,created_at)");
db.exec("CREATE INDEX IF NOT EXISTS password_reset_events_identifier_idx ON password_reset_events(identifier_hash,event_type,created_at)");

export default db;
