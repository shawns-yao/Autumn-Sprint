import fs from 'node:fs/promises'
import path from 'node:path'

throw new Error('旧版关键词推测脚本已停用，请使用 npm run db:import 预览安全导入结果')

const sourceRoot = process.argv[2] || 'C:\\Document\\Obsidian-Repository\\Learn\\秋招-面试\\投递文档\\投递公司+时间+进度'
const outputRoot = process.argv[3] || path.resolve('data', 'processed')

const stageNames = ['测评', '笔试', '算法', 'AI面试', 'AI 面试', '一面', '二面', '三面', '终面', 'HR']
const stripStatus = (value) => value.replace(/[-_ ]?(终止|拒绝|挂起|offer)$/i, '').trim()

function normalizeDate(raw) {
  if (!raw) return null
  const match = raw.match(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})/) || raw.match(/(20\d{2})[-年/](\d{1,2})/)
  if (match && match[3]) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-01`
  const short = raw.match(/(^|[-_])(\d{1,2})[-_](\d{1,2})([-_]|$)/)
  return short ? `2026-${String(short[2]).padStart(2, '0')}-${String(short[3]).padStart(2, '0')}` : null
}

function parseName(filePath) {
  const relative = path.relative(sourceRoot, filePath).replaceAll('\\', '/')
  const parts = relative.split('/')
  const fileName = parts.at(-1).replace(/\.md$/i, '')
  const parent = parts.length > 1 ? parts.at(-2) : ''
  const marker = parent || fileName
  const terminated = /终止|拒绝/i.test(relative)
  const dateMatch = (fileName.match(/(20\d{2}[-_]\d{1,2}[-_]\d{1,2}|[-_]\d{1,2}[-_]\d{1,2})/)
    || marker.match(/(20\d{2}[-_]\d{1,2}[-_]\d{1,2}|[-_]\d{1,2}[-_]\d{1,2})/))
  const rawCompany = marker.replace(dateMatch?.[0] || '', '').replace(/[-_]+$/, '').trim()
  const company = stripStatus(rawCompany || fileName)
  return { relative, fileName, parent, company, appliedDate: normalizeDate(dateMatch?.[0]), terminated }
}

function statusFrom(entry, text) {
  if (entry.terminated || /终止|拒绝|流程结束|未通过|挂起/.test(text)) return '终止'
  if (/offer/i.test(text)) return 'Offer'
  if (/AI\s*面试|人工智能面试/.test(text)) return 'AI 面试'
  if (/终面/.test(text)) return '终面'
  if (/三面/.test(text)) return '三面'
  if (/二面/.test(text)) return '二面'
  if (/一面|面试邀请/.test(text)) return '面试'
  if (/笔试|算法/.test(text)) return '笔试'
  if (/测评/.test(text)) return '测评'
  return '已投递'
}

function firstUrl(text) {
  return text.match(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/)?.[1]
    || text.match(/https?:\/\/[^\s)]+/)?.[0]
    || null
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const next = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== '.obsidian') files.push(...await walk(next))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(next)
  }
  return files
}

const markdownFiles = await walk(sourceRoot)
const grouped = new Map()
const manifest = []

for (const filePath of markdownFiles) {
  const text = await fs.readFile(filePath, 'utf8')
  const entry = parseName(filePath)
  const key = entry.company.toLowerCase()
  const images = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => path.resolve(path.dirname(filePath), match[1].replaceAll('%20', ' ')))
  const stage = stageNames.find(name => entry.fileName.includes(name) || entry.parent.includes(name)) || null
  const record = grouped.get(key) || {
    company: entry.company,
    appliedDate: entry.appliedDate,
    status: statusFrom(entry, text),
    officialUrl: firstUrl(text),
    sourceFiles: [],
    attachments: [],
    stages: {},
    notes: [],
  }
  record.appliedDate ||= entry.appliedDate
  record.officialUrl ||= firstUrl(text)
  if (entry.terminated) record.status = '终止'
  record.status = record.status === '终止' ? '终止' : statusFrom(entry, text)
  record.sourceFiles.push(path.resolve(filePath))
  record.attachments.push(...images)
  const stageKey = stage?.replaceAll(' ', '')
  if (stageKey) record.stages[stageKey] = { sourceFile: path.resolve(filePath), text, attachments: images }
  else if (text.trim()) record.notes.push(text)
  grouped.set(key, record)
  manifest.push({ sourceFile: path.resolve(filePath), company: entry.company, stage: stageKey, appliedDate: entry.appliedDate, images: images.length, bytes: Buffer.byteLength(text) })
}

const applications = [...grouped.values()].map((record, index) => ({
  id: `obsidian-${String(index + 1).padStart(3, '0')}`,
  company: record.company,
  title: null,
  city: null,
  status: record.status,
  appliedDate: record.appliedDate,
  officialUrl: record.officialUrl,
  source: 'Obsidian 导入',
  priority: null,
  jdText: record.notes.join('\n\n').trim() || null,
  jdImages: [...new Set(record.attachments)],
  sourceFiles: [...new Set(record.sourceFiles)],
  stages: record.stages,
}))

await fs.mkdir(outputRoot, { recursive: true })
await fs.writeFile(path.join(outputRoot, 'applications.cleaned.json'), JSON.stringify({ sourceRoot: path.resolve(sourceRoot), generatedAt: new Date().toISOString(), count: applications.length, applications }, null, 2), 'utf8')
await fs.writeFile(path.join(outputRoot, 'applications.manifest.json'), JSON.stringify({ sourceRoot: path.resolve(sourceRoot), markdownCount: markdownFiles.length, recordCount: applications.length, files: manifest }, null, 2), 'utf8')
console.log(JSON.stringify({ sourceRoot: path.resolve(sourceRoot), markdownCount: markdownFiles.length, recordCount: applications.length, outputRoot: path.resolve(outputRoot) }, null, 2))
