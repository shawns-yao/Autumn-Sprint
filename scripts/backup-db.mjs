import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const source = path.resolve(process.argv[2] || 'data/autumn-sprint.sqlite')
const target = path.resolve(process.argv[3] || `data/backups/before-repair-${new Date().toISOString().replaceAll(':', '-')}.sqlite`)
if (source === target || fs.existsSync(target)) throw new Error('备份目标必须是不存在的新文件')
fs.mkdirSync(path.dirname(target), { recursive: true })
const db = new Database(source, { readonly: true })
await db.backup(target)
db.close()
const backup = new Database(target, { readonly: true })
if (backup.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('备份完整性检查失败')
console.log(JSON.stringify({ backup: target, integrity: 'ok', applications: backup.prepare('SELECT count(*) count FROM applications').get().count }))
backup.close()
