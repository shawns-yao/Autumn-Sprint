import http from 'node:http'
import path from 'node:path'
import { openDatabase } from './server/database.mjs'
import { createStore } from './server/store.mjs'
import { HttpError, requireValue, integer, identifier } from './server/validation.mjs'
import { listAiModels, testAiProvider } from './server/ai.mjs'

const port = Number(process.env.API_PORT || 8787)
const listenHost = process.env.API_HOST || '127.0.0.1'
let publicOrigin
if (process.env.APP_ORIGIN?.trim()) {
  try {
    publicOrigin = new URL(process.env.APP_ORIGIN.trim())
    if (!['http:', 'https:'].includes(publicOrigin.protocol) || publicOrigin.username || publicOrigin.password || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash) throw new Error()
  } catch {
    throw new Error('APP_ORIGIN 必须是 HTTP 或 HTTPS 站点地址，不能包含账号、路径或查询参数')
  }
}
const allowedHosts = new Set(['localhost', '127.0.0.1', ...(publicOrigin ? [publicOrigin.hostname] : [])])
const db = openDatabase(path.resolve(process.env.DB_PATH || 'data/autumn-sprint.sqlite'))
const store = createStore(db)

async function readBody(req, max = 2 * 1024 * 1024) {
  requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', '请求必须使用 application/json', 415)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let exceeded = false
    req.on('data', chunk => {
      size += chunk.length
      if (exceeded) return
      if (size > max) { exceeded = true; chunks.length = 0; reject(new HttpError(413, '请求内容过大')); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (exceeded) return
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { reject(new HttpError(400, 'JSON 格式无效')) }
    })
    req.on('error', () => reject(new HttpError(400, '请求传输中断')))
    req.on('aborted', () => reject(new HttpError(400, '请求传输中断')))
  })
}
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  })
  res.end(JSON.stringify(data))
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (process.env.NODE_ENV === 'production' && publicOrigin?.protocol === 'https:') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  try {
    const host = new URL(`http://${req.headers.host}`).hostname
    requireValue(allowedHosts.has(host), '无效主机', 403)
    const origin = req.headers.origin
    requireValue(!origin || (publicOrigin ? origin === publicOrigin.origin : /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)), '不允许的来源', 403)
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
    const route = new URL(req.url, `http://127.0.0.1:${port}`)
    const pathname = route.pathname
    if (req.method === 'GET') {
      if (pathname === '/api/health') return json(res, { ok: db.prepare('SELECT 1 value').get().value === 1 })
      if (pathname === '/api/workspace') return json(res, db.transaction(() => ({ applications: store.readApplications({ summary: true }).items }))())
      if (pathname === '/api/applications') return json(res, store.readApplications({
        page: integer(Number(route.searchParams.get('page') || 1), '页码', 1, 1000000),
        pageSize: integer(Number(route.searchParams.get('pageSize') || 20), '每页条数', 1, 200),
        query: (route.searchParams.get('q') || '').trim().slice(0, 200),
      }))
      if (pathname === '/api/notes') return json(res, store.readNotes())
      const applicationMatch = pathname.match(/^\/api\/applications\/([\w-]+)$/)
      if (applicationMatch) {
        const app = store.getApplication(applicationMatch[1])
        requireValue(app, '岗位不存在', 404)
        return json(res, app)
      }
      if (pathname === '/api/resources') return json(res, store.readResources())
      if (pathname === '/api/settings') return json(res, store.settings())
      if (pathname === '/api/ai/settings') return json(res, store.aiSettings())
      if (pathname === '/api/reminders') return json(res, store.reminders())
      if (pathname === '/api/export') return json(res, db.transaction(() => ({ version: 1, exportedAt: new Date().toISOString(), applications: store.readApplications().items, notes: store.readNotes(), resources: store.readResources(), settings: store.settings() }))())
      const fileMatch = pathname.match(/^\/api\/attachments\/([\w-]+)$/)
      if (fileMatch) {
        const file = store.attachment(fileMatch[1])
        res.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': file.bytes, 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `${file.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name).replaceAll("'", '%27')}` })
        return res.end(file.content)
      }
    }
    if (req.method === 'POST') {
      if (pathname === '/api/applications') return json(res, store.saveApplication(await readBody(req)))
      if (pathname === '/api/notes') return json(res, store.saveNote(await readBody(req)))
      if (pathname === '/api/notes/import') {
        return json(res, store.importLegacy('notes', await readBody(req, 16 * 1024 * 1024)))
      }
      if (pathname === '/api/resources/import') return json(res, store.importLegacy('resources', await readBody(req)))
      if (pathname === '/api/resources') return json(res, store.saveResource(await readBody(req)))
      if (pathname === '/api/settings') return json(res, store.saveSettings(await readBody(req)))
      if (pathname === '/api/ai/settings') return json(res, store.saveAiSettings(await readBody(req)))
      if (pathname === '/api/ai/test') return json(res, await testAiProvider(store.resolveAiSettings(await readBody(req))))
      if (pathname === '/api/ai/models') return json(res, await listAiModels(store.resolveAiSettings(await readBody(req), false)))
      const match = pathname.match(/^\/api\/applications\/([\w-]+)\/attachments$/)
      if (match) return json(res, store.saveAttachment(match[1], await readBody(req, 14 * 1024 * 1024)), 201)
    }
    if (req.method === 'DELETE') {
      if (pathname === '/api/companies') return json(res, store.deleteCompany(await readBody(req)))
      const match = pathname.match(/^\/api\/(applications|notes|resources|attachments)\/([\w-]+)$/)
      if (match) {
        const id = identifier(match[2])
        if (match[1] === 'applications') store.deleteApplication(id, await readBody(req))
        if (match[1] === 'notes') store.deleteNote(id, await readBody(req))
        if (match[1] === 'resources') store.deleteResource(id, await readBody(req))
        if (match[1] === 'attachments') store.deleteAttachment(id)
        return json(res, { ok: true })
      }
    }
    json(res, { error: '接口不存在' }, 404)
  } catch (error) {
    if (!(error instanceof HttpError) && process.env.NODE_ENV === 'test') console.error(error)
    if (!res.destroyed && !res.headersSent) json(res, { error: error instanceof HttpError ? error.message : '服务内部错误，原有数据未被覆盖' }, error instanceof HttpError ? error.status : 500)
  }
})
server.requestTimeout = 30000
server.listen(port, listenHost, () => console.log(`API ready: http://${listenHost}:${server.address().port}`))
function shutdown() { server.close(() => { db.close(); process.exit(0) }); server.closeIdleConnections() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
