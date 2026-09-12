import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { openDatabase } from '../server/database.mjs'
import { application, stageMap } from '../server/validation.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const sourceRoot = fs.realpathSync(option('--source', 'C:\\Document\\Obsidian-Repository\\Learn\\秋招-面试\\投递文档\\投递公司+时间+进度'))
const dbPath = path.resolve(option('--db', 'data/autumn-sprint.sqlite'))
const apply = args.includes('--apply')
const manifestPath = path.resolve(option('--manifest', `data/manifest/obsidian-${apply ? 'import' : 'preview'}-2026-09-12.json`))
const digest = text => createHash('sha256').update(text).digest('hex')
const emptyStage = () => ({ status: '未开始', date: '', time: '', location: '', link: '', requirements: '', notes: '' })
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isSymbolicLink() ? [] : entry.isDirectory()
    ? (entry.name === '.obsidian' || entry.name === 'assets' ? [] : walk(path.join(dir, entry.name)))
    : entry.name.endsWith('.md') ? [path.join(dir, entry.name)] : [])
}
function fullDate(value, year) {
  const full = value.match(/(20\d{2})[-_/年](\d{1,2})[-_/月](\d{1,2})/)
  const short = value.match(/(?:^|[-_\s])(\d{1,2})[-_/月](\d{1,2})(?:日|$|[-_\s])/)
  const parts = full ? full.slice(1) : short && year ? [year, ...short.slice(1)] : null
  if (!parts) return ''
  const result = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
  return !Number.isNaN(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result ? result : ''
}
function stripNavigation(text) { return text.replace(/^>\s*返回导航：.*$/gm, '').replace(/^\s*---\s*$/gm, '').trim() }
const files = walk(sourceRoot).sort()
const groups = new Map()
for (const file of files) {
  const relative = path.relative(sourceRoot, file).replaceAll('\\', '/')
  const key = relative.includes('/') ? relative.split('/')[0] : relative.replace(/\.md$/, '')
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push({ file, relative, text: fs.readFileSync(file, 'utf8') })
}
const readDb = fs.existsSync(dbPath) ? new Database(dbPath, { readonly: true }) : null
const previousRows = readDb ? readDb.prepare(`SELECT a.*,c.name company,b.imported_at batch_time FROM applications a
  JOIN companies c ON c.id=a.company_id LEFT JOIN import_batches b ON b.id=a.import_batch_id`).all() : []
const hasSources = readDb?.prepare("SELECT 1 FROM sqlite_master WHERE name='import_sources'").get()
const previousSources = new Map(hasSources ? readDb.prepare('SELECT * FROM import_sources').all().map(item => [item.source_key, item]) : [])
const previousStages = readDb ? readDb.prepare('SELECT * FROM application_stages').all() : []
readDb?.close()
const records = []
const notes = []
const images = []
const report = { mode: apply ? 'apply' : 'preview', markdownFiles: files.length, groups: groups.size, inserted: 0, updated: 0, unchanged: 0, conflicts: 0, unknownDates: 0, attachmentFiles: 0, skippedAttachments: 0, notes: 0, review: [] }
for (const [group, documents] of groups) {
  const company = group.replace(/[-_](终止|拒绝|挂起|offer)$/i, '').replace(/[-_](?:20\d{2}[-_])?\d{1,2}[-_]\d{1,2}$/, '').trim()
  const combined = documents.map(item => item.text).join('\n')
  const years = [...new Set([...combined.matchAll(/(?:file-|图片|^|\D)(20\d{2})(?=\d{4}|[-/年])/gm)].map(match => match[1]))]
  const year = years.length === 1 ? years[0] : undefined
  const main = documents.filter(item => !/^(?:\d{2}[-_])?(?:笔试|算法|测评|AI\s*面试|[一二三]面|HR)\.md$/i.test(path.basename(item.file)))
  const dates = [...new Set(main.map(item => fullDate(path.basename(item.file, '.md'), year)).filter(Boolean))]
  const applied = dates.length === 1 ? dates[0] : ''
  if (!applied) report.unknownDates++
  const companyMatches = previousRows.filter(item => item.company === company && item.source === 'Obsidian 导入')
  const old = companyMatches.length === 1 ? companyMatches[0] : companyMatches.find(item => applied && item.applied_date === applied)
  const sourceKey = digest(group)
  const fingerprint = digest(documents.map(item => `${item.relative}\n${item.text}`).join('\n'))
  const tracked = previousSources.get(sourceKey)
  if (tracked?.fingerprint === fingerprint) { report.unchanged++; continue }
  const legacyUntouched = old && Number(old.revision || 0) === 0 && old.batch_time &&
    Math.abs(Date.parse(old.updated_at.replace(' ', 'T') + (old.updated_at.includes('T') ? '' : 'Z')) - Date.parse(old.batch_time)) < 3000
  if ((old && !legacyUntouched) || (!old && companyMatches.length > 0) || tracked) {
    report.conflicts++; report.review.push({ source: group, reason: '已有记录可能经过修改，未覆盖；请人工合并' }); continue
  }
  const app = { id: old?.id || `obsidian-${sourceKey.slice(0, 24)}`, company,
    title: old?.title || '', city: old?.city || '', source: 'Obsidian 导入', priority: old?.priority || '中',
    applied, website: '', resume: old?.resume_name || '', jd: main.map(item => stripNavigation(item.text)).join('\n\n'),
    status: '已投递', terminated: false, ...Object.fromEntries(Object.keys(stageMap).map(key => [key, emptyStage()])) }
  const mainText = main.map(item => item.text).join('\n')
  const links = [...mainText.matchAll(/(?<!!)\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g)]
  app.website = links.map(match => match[1]).find(value => { try { const link = new URL(value); return !link.username && !link.password } catch { return false } }) || ''
  const explicitTitle = mainText.match(/^(?:岗位名称|投递岗位|职位名称)\s*[:：]\s*(.+)$/m)
  const explicitCity = mainText.match(/^(?:工作城市|工作地点|城市)\s*[:：]\s*(.+)$/m)
  if (explicitTitle) app.title = explicitTitle[1].trim()
  if (explicitCity) app.city = explicitCity[1].trim()
  // Only structured progress rows carry outcomes. Empty templates and exercise text do not.
  for (const document of documents) {
    const lines = document.text.split(/\r?\n/)
    let progress = false
    let columns = null
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) { progress = /进度|投递记录|招聘流程/.test(line); columns = null }
      if (!progress || !line.trim().startsWith('|')) continue
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(value => value.trim())
      if (cells.includes('日期') && cells.includes('类型')) { columns = cells; continue }
      if (!columns || cells.every(value => !value || /^[-:]+$/.test(value))) continue
      const row = Object.fromEntries(columns.map((name, index) => [name, cells[index] || '']))
      if (/^(?:流程)?终止$/.test(row.结果)) { app.status = '终止'; continue }
      const label = row.类型.replace(/\s/g, '')
      const key = Object.entries(stageMap).find(([, name]) => name.replace(/\s/g, '') === label)?.[0]
      if (!key) { report.review.push({ source: document.relative, reason: '存在无法映射的流程类型，保留在原文笔记中' }); continue }
      const day = fullDate(row.日期, year)
      const outcome = /未通过|淘汰|失败/.test(row.结果) ? '未通过' : /通过|完成/.test(row.结果) ? '已完成' : /安排|待参加|待开始/.test(row.结果) ? '已安排' : '未开始'
      if (outcome === '未开始' || !day) { report.review.push({ source: document.relative, reason: '流程结果或完整日期不明确，未创建推测安排' }); continue }
      app[key] = { ...emptyStage(), status: outcome, date: day, time: /^\d{2}:\d{2}$/.test(row.时间) ? row.时间 : '', notes: row.结果 }
      app.status = outcome === '未通过' ? '拒绝' : stageMap[key]
    }
  }
  if (documents.some(item => /(?:^|[-_/])终止(?:[/.]|$)/.test(item.relative)) || /[-_]终止$/.test(group)) app.status = '终止'
  else if (/[-_]拒绝$/.test(group)) app.status = '拒绝'
  else if (/[-_]offer$/i.test(group)) app.status = 'Offer'
  app.terminated = app.status === '终止'
  let normalized
  try { normalized = application(app) } catch {
    report.review.push({ source: group, reason: '结构化流程存在日期或状态冲突，未导入该组，以免覆盖已有数据' })
    report.conflicts++; continue
  }
  records.push({ ...normalized, sourceKey, fingerprint, old: old ? { ...old, stages: previousStages.filter(stage => stage.application_id === old.id) } : null })
  if (old) report.updated++; else report.inserted++
  for (const document of documents) {
    const body = stripNavigation(document.text)
    if (body) notes.push({ id: `obsidian-note-${digest(document.relative).slice(0, 24)}`, title: `${company} · ${path.basename(document.file, '.md')}`, body, applicationId: app.id })
    for (const match of document.text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      let imagePath
      try {
        const value = decodeURIComponent(match[1].replace(/^<|>$/g, ''))
        if (/^[a-z]+:/i.test(value)) throw new Error()
        imagePath = fs.realpathSync(path.resolve(path.dirname(document.file), value))
        const relative = path.relative(sourceRoot, imagePath)
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error()
        const bytes = fs.statSync(imagePath).size
        if (!bytes || bytes > 10 * 1024 * 1024) throw new Error()
        const content = fs.readFileSync(imagePath)
        const extension = path.extname(imagePath).toLowerCase()
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[extension]
        if (!mime) throw new Error()
        const sha = digest(content)
        if (!images.some(item => item.applicationId === app.id && item.sha === sha)) images.push({ id: `obsidian-file-${digest(`${app.id}:${sha}`).slice(0, 24)}`, applicationId: app.id, name: path.basename(imagePath), mime, content: content.toString('base64'), bytes, sha })
      } catch { report.skippedAttachments++; report.review.push({ source: document.relative, reason: '附件路径不可读取、超出授权目录或格式大小不支持；未修改原文件' }) }
    }
  }
}
report.attachmentFiles = images.length
report.notes = notes.length
if (apply && records.length) {
  if (fs.existsSync(dbPath)) {
    const backupPath = path.join(path.dirname(dbPath), 'backups', `before-obsidian-${Date.now()}.sqlite`)
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    const backupDb = new Database(dbPath, { readonly: true })
    await backupDb.backup(backupPath)
    backupDb.close()
    const verification = new Database(backupPath, { readonly: true })
    if (verification.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('导入前备份校验失败')
    verification.close()
    report.backup = backupPath
  }
  const db = openDatabase(dbPath)
  db.function('decode_base64', { deterministic: true }, value => Buffer.from(value, 'base64'))
  const time = new Date().toISOString()
  const payload = JSON.stringify(records)
  db.transaction(() => {
    const live = new Map(db.prepare('SELECT id,revision,updated_at FROM applications WHERE id IN (SELECT json_extract(value,\'$.id\') FROM json_each(?))').all(payload).map(item => [item.id, item]))
    if (records.some(record => {
      const current = live.get(record.id)
      return record.old ? !current || current.updated_at !== record.old.updated_at || current.revision !== (record.old.revision || 0) : Boolean(current)
    })) throw new Error('预览后岗位发生变化，导入已取消，请重新预览')
    db.prepare(`INSERT INTO companies(name) SELECT DISTINCT json_extract(value,'$.company') FROM json_each(?) WHERE true ON CONFLICT(name) DO NOTHING`).run(payload)
    db.prepare(`INSERT INTO applications(id,company_id,title,city,status,applied_date,source,official_url,priority,jd_text,terminated,resume_name,updated_at,revision)
      SELECT json_extract(j.value,'$.id'),c.id,json_extract(j.value,'$.title'),json_extract(j.value,'$.city'),json_extract(j.value,'$.status'),
      json_extract(j.value,'$.applied'),json_extract(j.value,'$.source'),json_extract(j.value,'$.website'),json_extract(j.value,'$.priority'),
      json_extract(j.value,'$.jd'),json_extract(j.value,'$.terminated'),json_extract(j.value,'$.resume'),@time,0
      FROM json_each(@data) j JOIN companies c ON c.name=json_extract(j.value,'$.company') WHERE true
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,city=excluded.city,status=excluded.status,applied_date=excluded.applied_date,
      official_url=excluded.official_url,jd_text=excluded.jd_text,terminated=excluded.terminated,updated_at=excluded.updated_at`).run({ data: payload, time })
    const stages = records.flatMap(record => Object.entries(stageMap).map(([key, name]) => ({ applicationId: record.id, name, ...record[key] })))
    db.prepare(`INSERT INTO application_stages(application_id,stage_name,status,date,time,location,link,requirements,notes)
      SELECT json_extract(value,'$.applicationId'),json_extract(value,'$.name'),json_extract(value,'$.status'),json_extract(value,'$.date'),
      json_extract(value,'$.time'),json_extract(value,'$.location'),json_extract(value,'$.link'),json_extract(value,'$.requirements'),json_extract(value,'$.notes')
      FROM json_each(?) WHERE true ON CONFLICT(application_id,stage_name) DO UPDATE SET status=excluded.status,date=excluded.date,time=excluded.time,
      location=excluded.location,link=excluded.link,requirements=excluded.requirements,notes=excluded.notes`).run(JSON.stringify(stages))
    db.prepare(`INSERT INTO application_events(application_id,event_type,payload_json,created_at)
      SELECT json_extract(value,'$.id'),'obsidian_import',value,@time FROM json_each(@data)`).run({ data: payload, time })
    db.prepare(`INSERT INTO import_sources(source_key,application_id,fingerprint,imported_at,snapshot_json)
      SELECT json_extract(value,'$.sourceKey'),json_extract(value,'$.id'),json_extract(value,'$.fingerprint'),@time,value FROM json_each(@data)`).run({ data: payload, time })
    const noteData = JSON.stringify(notes)
    db.prepare(`INSERT INTO notes(id,title,category,body,tags_json,created_at,updated_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),'投递原文',json_extract(value,'$.body'),'[]',@time,@time FROM json_each(@data)
      WHERE true ON CONFLICT(id) DO NOTHING`).run({ data: noteData, time })
    db.prepare(`INSERT OR IGNORE INTO note_applications(note_id,application_id)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.applicationId') FROM json_each(?)`).run(noteData)
    db.prepare(`INSERT INTO stored_attachments(id,application_id,name,mime,content,bytes,sha256,created_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.applicationId'),json_extract(value,'$.name'),json_extract(value,'$.mime'),
      decode_base64(json_extract(value,'$.content')),json_extract(value,'$.bytes'),json_extract(value,'$.sha'),@time FROM json_each(@data)
      WHERE true ON CONFLICT DO NOTHING`).run({ data: JSON.stringify(images), time })
    if (db.pragma('foreign_key_check').length) throw new Error('导入外键检查失败，已回滚')
  })()
  if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('数据库完整性检查失败')
  db.close()
}
fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, JSON.stringify({ ...report, generatedAt: new Date().toISOString(), sourceRoot, records: records.map(item => ({ id: item.id, company: item.company, sourceKey: item.sourceKey, fingerprint: item.fingerprint, dateKnown: Boolean(item.applied) })) }, null, 2))
console.log(JSON.stringify({ ...report, review: report.review.length, manifest: manifestPath }, null, 2))
