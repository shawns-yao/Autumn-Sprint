import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

// Existing application tables are retained. New business records use soft deletion.
export function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_root TEXT NOT NULL, source_file TEXT NOT NULL,
        imported_at TEXT NOT NULL, record_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
        title TEXT, city TEXT, status TEXT NOT NULL, applied_date TEXT, source TEXT, official_url TEXT,
        priority TEXT, jd_text TEXT, terminated INTEGER NOT NULL DEFAULT 0, resume_name TEXT,
        import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS application_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        stage_name TEXT NOT NULL, status TEXT, date TEXT, time TEXT, location TEXT, link TEXT,
        requirements TEXT, notes TEXT, source_file TEXT, UNIQUE(application_id, stage_name)
      );
      CREATE TABLE IF NOT EXISTS application_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        file_path TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'jd_image', UNIQUE(application_id, file_path)
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL,
        tags_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS note_applications (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE RESTRICT,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        PRIMARY KEY(note_id, application_id)
      );
      CREATE TABLE IF NOT EXISTS resource_links (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, note TEXT NOT NULL,
        updated_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS stored_attachments (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL, bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT,
        UNIQUE(application_id, sha256, name)
      );
      CREATE TABLE IF NOT EXISTS application_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK(id = 1), value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS import_sources (
        source_key TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
        fingerprint TEXT NOT NULL, imported_at TEXT NOT NULL, snapshot_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_id);
      CREATE INDEX IF NOT EXISTS idx_stages_application ON application_stages(application_id);
      CREATE INDEX IF NOT EXISTS idx_files_application ON stored_attachments(application_id);
      CREATE INDEX IF NOT EXISTS idx_events_application ON application_events(application_id);
    `)
    if (!db.prepare('PRAGMA table_info(applications)').all().some(column => column.name === 'revision')) {
      db.exec('ALTER TABLE applications ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
    }
    if (!db.prepare('PRAGMA table_info(applications)').all().some(column => column.name === 'workflow_json')) {
      db.exec('ALTER TABLE applications ADD COLUMN workflow_json TEXT')
    }
    if (!db.prepare('PRAGMA table_info(application_stages)').all().some(column => column.name === 'end_time')) {
      db.exec('ALTER TABLE application_stages ADD COLUMN end_time TEXT')
    }
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (2, ?)').run(new Date().toISOString())
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=1').get()) {
      db.prepare('INSERT OR IGNORE INTO resource_links(id,name,url,note,updated_at) VALUES (?,?,?,?,?)').run('campus-wiki', '校招投递文档', 'https://campus.sma-wiki.cn/campus/campus_recruit.html?channel=sqtz_20', '', new Date().toISOString())
      db.prepare('INSERT INTO schema_migrations VALUES (1, ?)').run(new Date().toISOString())
    }
  })()
  return db
}
