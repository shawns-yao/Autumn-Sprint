import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

throw new Error('旧版覆盖式导入已停用，请使用 npm run db:import 预览，再追加 -- --apply 导入')

const dbPath = process.argv[2] || path.resolve('data', 'autumn-sprint.sqlite')
const jsonPath = process.argv[3] || path.resolve('data', 'processed', 'applications.cleaned.json')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_root TEXT NOT NULL,
    source_file TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    record_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    title TEXT,
    city TEXT,
    status TEXT NOT NULL,
    applied_date TEXT,
    source TEXT,
    official_url TEXT,
    priority TEXT,
    jd_text TEXT,
    terminated INTEGER NOT NULL DEFAULT 0,
    resume_name TEXT,
    import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS application_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    status TEXT,
    date TEXT,
    time TEXT,
    location TEXT,
    link TEXT,
    requirements TEXT,
    notes TEXT,
    source_file TEXT,
    UNIQUE(application_id, stage_name)
  );
  CREATE TABLE IF NOT EXISTS application_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'jd_image',
    UNIQUE(application_id, file_path)
  );
  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company_id);
  CREATE INDEX IF NOT EXISTS idx_stages_application ON application_stages(application_id);
`)

const batch = db.prepare('INSERT INTO import_batches (source_root, source_file, imported_at, record_count) VALUES (?, ?, ?, ?)')
const batchId = batch.run(data.sourceRoot, path.resolve(jsonPath), new Date().toISOString(), data.count).lastInsertRowid
const upsertCompany = db.prepare('INSERT INTO companies (name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id')
const upsertApplication = db.prepare(`
  INSERT INTO applications (id, company_id, title, city, status, applied_date, source, official_url, priority, jd_text, terminated, resume_name, import_batch_id, updated_at)
  VALUES (@id, @companyId, @title, @city, @status, @appliedDate, @source, @officialUrl, @priority, @jdText, @terminated, @resume, @batchId, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id, title=excluded.title, city=excluded.city, status=excluded.status,
    applied_date=excluded.applied_date, source=excluded.source, official_url=excluded.official_url, priority=excluded.priority,
    jd_text=excluded.jd_text, terminated=excluded.terminated, resume_name=excluded.resume_name, import_batch_id=excluded.import_batch_id, updated_at=CURRENT_TIMESTAMP
`)
const upsertStage = db.prepare(`
  INSERT INTO application_stages (application_id, stage_name, status, date, time, location, link, requirements, notes, source_file)
  VALUES (@applicationId, @stageName, @status, @date, @time, @location, @link, @requirements, @notes, @sourceFile)
  ON CONFLICT(application_id, stage_name) DO UPDATE SET status=excluded.status, date=excluded.date, time=excluded.time, location=excluded.location, link=excluded.link, requirements=excluded.requirements, notes=excluded.notes, source_file=excluded.source_file
`)
const insertAttachment = db.prepare('INSERT OR IGNORE INTO application_attachments (application_id, file_path, kind) VALUES (?, ?, ?)')

const importAll = db.transaction(() => {
  for (const record of data.applications) {
    const companyId = upsertCompany.get(record.company).id
    upsertApplication.run({
      id: record.id,
      companyId,
      title: record.title,
      city: record.city,
      status: record.status,
      appliedDate: record.appliedDate,
      source: record.source,
      officialUrl: record.officialUrl,
      priority: record.priority,
      jdText: record.jdText,
      terminated: record.status === '终止' ? 1 : 0,
      resume: null,
      batchId,
    })
    for (const [stageName, stage] of Object.entries(record.stages)) {
      upsertStage.run({
        applicationId: record.id,
        stageName,
        status: null,
        date: null,
        time: null,
        location: null,
        link: null,
        requirements: stage.text,
        notes: null,
        sourceFile: stage.sourceFile,
      })
    }
    for (const image of record.jdImages) insertAttachment.run(record.id, image, 'jd_image')
  }
})
importAll()
const counts = {
  applications: db.prepare('SELECT COUNT(*) AS count FROM applications').get().count,
  companies: db.prepare('SELECT COUNT(*) AS count FROM companies').get().count,
  stages: db.prepare('SELECT COUNT(*) AS count FROM application_stages').get().count,
  attachments: db.prepare('SELECT COUNT(*) AS count FROM application_attachments').get().count,
}
db.close()
console.log(JSON.stringify({ dbPath: path.resolve(dbPath), batchId: Number(batchId), ...counts }, null, 2))
