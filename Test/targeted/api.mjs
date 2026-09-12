import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const root = path.resolve('.')
const output = path.resolve('Test/output', `api-${Date.now()}`)
fs.mkdirSync(output, { recursive: true })
const db = path.join(output, 'isolated.sqlite')
let child
let base
let log = ''
const results = []
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, DB_PATH: db, API_PORT: '0', NODE_ENV: 'test' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let startup = ''
  child.stdout.on('data', data => { startup += data })
  child.stderr.on('data', data => { log += data })
  for (let attempt = 0; attempt < 100; attempt++) {
    const match = startup.match(/API ready: (http:\/\/127\.0\.0\.1:\d+)/)
    if (match) { base = match[1]; return }
    if (child.exitCode !== null) throw new Error(`Server startup failed: ${log}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Server startup timeout')
}
async function stop() {
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done }
}
async function call(route, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}\n${log}`)
  return data
}
async function check(name, action) {
  const start = performance.now()
  await action()
  results.push({ name, passed: true, ms: Math.round(performance.now() - start) })
  console.log(`PASS ${name}`)
}
const blank = () => ({ status: '未开始', date: '', time: '', location: '', link: '', requirements: '', notes: '' })
const app = id => ({ id, company: `定向样本-${id}`, title: '', city: '', status: '已投递', applied: '2026-09-01', source: '定向测试', website: '', priority: '中', resume: '', jd: '', terminated: false,
  evaluation: blank(), written: blank(), aiInterview: blank(), firstInterview: blank(), secondInterview: blank(), thirdInterview: blank(), hrInterview: blank() })
let saved
let note
let resource
let file
const bytes = Buffer.from('targeted attachment roundtrip')
try {
  await start()
  await check('空数据库不产生示例岗位', async () => assert.deepEqual((await call('/api/workspace')).applications, []))
  await check('异常 JSON 返回 400，服务继续可用', async () => {
    const response = await fetch(base + '/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"invalid":' })
    assert.equal(response.status, 400); assert.equal((await call('/api/health')).ok, true)
  })
  await check('超大请求明确返回 413，服务继续可用', async () => {
    await call('/api/applications', 'POST', { ...app('oversized'), jd: 'x'.repeat(2 * 1024 * 1024) }, 413)
    assert.equal((await call('/api/health')).ok, true)
  })
  await check('分页、类型、日期、网址和路由参数校验', async () => {
    for (const route of ['/api/applications?page=NaN', '/api/applications?page=1.5', '/api/applications?pageSize=0', '/api/applications?pageSize=201']) await call(route, 'GET', undefined, 400)
    await call('/api/applications/not/a/route', 'GET', undefined, 404)
    await call('/api/applications', 'POST', null, 400)
    await call('/api/applications', 'POST', { ...app('invalid-date'), applied: '2026-02-30' }, 400)
    await call('/api/applications', 'POST', { ...app('invalid-url'), website: 'javascript:alert(1)' }, 400)
    const forbidden = await fetch(base + '/api/health', { headers: { Origin: 'https://untrusted.invalid' } })
    assert.equal(forbidden.status, 403)
  })
  await check('真实保存且不填充虚构简历', async () => {
    saved = await call('/api/applications', 'POST', app('primary'))
    assert.equal(saved.resume, ''); assert.equal(saved.title, ''); assert.equal(saved.revision, 1)
  })
  await check('岗位并发版本冲突不覆盖数据', async () => {
    const original = saved
    saved = await call('/api/applications', 'POST', { ...saved, city: '测试城市' })
    await call('/api/applications', 'POST', { ...original, city: '不应写入' }, 409)
    assert.equal((await call('/api/applications/primary')).city, '测试城市')
  })
  await check('阶段日期、失败结果、当前状态一致性', async () => {
    await call('/api/applications', 'POST', { ...saved, firstInterview: { ...blank(), status: '已安排' } }, 400)
    await call('/api/applications', 'POST', { ...saved, firstInterview: { ...blank(), status: '未通过' } }, 400)
    await call('/api/applications', 'POST', { ...saved, status: '一面', firstInterview: { ...blank(), status: '已安排', date: '2026-08-01' } }, 400)
    await call('/api/applications', 'POST', { ...saved, terminated: true }, 400)
    saved = await call('/api/applications', 'POST', { ...saved, firstInterview: { ...blank(), status: '已终止' } })
    assert.equal(saved.status, '终止')
    assert.equal(saved.terminated, true)
    assert.equal(saved.firstInterview.status, '已终止')
    saved = await call('/api/applications', 'POST', { ...saved, terminated: false, firstInterview: { ...blank(), status: '已获 Offer' } })
    assert.equal(saved.status, 'Offer')
    assert.equal(saved.terminated, false)
    assert.equal(saved.firstInterview.status, '已获 Offer')
  })
  await check('提醒配置实际生效，结束岗位取消待办', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    saved = await call('/api/applications', 'POST', { ...saved, status: '一面', terminated: false, firstInterview: { ...blank(), status: '已安排', date: tomorrow, time: '18:00' } })
    const settings = await call('/api/settings')
    await call('/api/settings', 'POST', { ...settings, interviewHours: 168 })
    assert.ok((await call('/api/reminders')).some(item => item.applicationId === saved.id))
    await call('/api/settings', 'POST', { ...settings, interviewEnabled: false })
    assert.equal((await call('/api/reminders')).some(item => item.applicationId === saved.id), false)
    await call('/api/settings', 'POST', { ...settings, interviewHours: -1 }, 400)
    saved = await call('/api/applications', 'POST', { ...saved, status: '终止', terminated: true })
    assert.equal(saved.firstInterview.status, '已取消')
    assert.equal((await call('/api/reminders')).some(item => item.applicationId === saved.id), false)
  })
  await check('超过 100 条岗位完整加载及分页', async () => {
    for (let i = 0; i < 102; i++) await call('/api/applications', 'POST', app(`page-${i}`))
    assert.equal((await call('/api/workspace')).applications.length, 103)
    const first = await call('/api/applications?pageSize=100')
    const second = await call('/api/applications?pageSize=100&page=2')
    assert.equal(first.items.length, 100); assert.equal(second.items.length, 3); assert.equal(first.total, 103)
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 103)
  })
  await check('笔记保存、关联、并发保护与幂等导入', async () => {
    note = await call('/api/notes', 'POST', { id: 'note-main', title: '定向笔记', category: '测试', body: '    缩进正文\n\n', tags: ['标签'], applicationIds: ['primary'] })
    assert.equal(note.body, '    缩进正文\n\n')
    assert.deepEqual(note.applicationIds, ['primary'])
    const original = note
    note = await call('/api/notes', 'POST', { ...note, body: '已更新', expectedUpdatedAt: note.updatedAt })
    await call('/api/notes', 'POST', { ...original, expectedUpdatedAt: original.updatedAt }, 409)
    const imported = await call('/api/notes/import', 'POST', [{ ...note, body: '不应覆盖' }, { id: 'legacy-note', title: '旧笔记', category: '测试', body: '', tags: [], applicationIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' }])
    assert.equal(imported.imported, 1); assert.equal(imported.skipped, 1)
    assert.equal((await call('/api/notes')).find(item => item.id === note.id).body, '已更新')
    assert.equal((await call('/api/notes')).find(item => item.id === 'legacy-note').createdAt, '2026-01-01T00:00:00.000Z')
    await call('/api/notes', 'POST', { id: 'bad-note', title: '无效关联', category: '测试', body: '', tags: [], applicationIds: ['does-not-exist'] }, 400)
  })
  await check('资源数据库保存、版本保护和批量迁移', async () => {
    resource = await call('/api/resources', 'POST', { id: 'resource-main', name: '测试资源', url: 'https://example.com', note: '' })
    await call('/api/resources', 'POST', { ...resource, updatedAt: 'old' }, 409)
    const imported = await call('/api/resources/import', 'POST', [resource, { id: 'resource-import', name: '导入资源', url: 'https://example.org', note: '' }])
    assert.equal(imported.imported, 1); assert.equal(imported.skipped, 1)
  })
  await check('附件上传、下载字节一致、去重与参数校验', async () => {
    file = await call('/api/applications/primary/attachments', 'POST', { name: 'sample.txt', content: bytes.toString('base64') }, 201)
    const response = await fetch(base + file.url)
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
    assert.match(response.headers.get('content-disposition'), /^attachment/)
    const duplicate = await call('/api/applications/primary/attachments', 'POST', { name: 'sample.txt', content: bytes.toString('base64') }, 201)
    assert.equal(duplicate.id, file.id)
    await call('/api/applications/primary/attachments', 'POST', { name: '../invalid.txt', content: 'YWJj' }, 400)
    await call('/api/applications/primary/attachments', 'POST', { name: 'invalid.txt', content: '!@#=' }, 400)
  })
  await check('服务重启后数据库内容仍可读取', async () => {
    await stop(); await start()
    assert.equal((await call('/api/workspace')).applications.length, 103)
    assert.equal((await call('/api/notes')).find(item => item.id === note.id).body, '已更新')
    assert.ok((await call('/api/resources')).some(item => item.id === resource.id))
    assert.equal((await call('/api/settings')).interviewEnabled, false)
    assert.deepEqual(Buffer.from(await (await fetch(base + file.url)).arrayBuffer()), bytes)
    const data = await call('/api/export')
    assert.equal(data.applications.length, 103); assert.equal(data.notes.length, 2)
  })
  await check('笔记、资源、附件软删除后不再展示', async () => {
    await call(`/api/notes/${note.id}`, 'DELETE', { expectedUpdatedAt: note.updatedAt })
    await call(`/api/resources/${resource.id}`, 'DELETE', { updatedAt: resource.updatedAt })
    await call(`/api/attachments/${file.id}`, 'DELETE')
    assert.equal((await call('/api/notes')).some(item => item.id === note.id), false)
    assert.equal((await call('/api/resources')).some(item => item.id === resource.id), false)
    await call(file.url, 'GET', undefined, 404)
    await call('/api/notes', 'POST', { ...note, expectedUpdatedAt: note.updatedAt }, 409)
  })
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ type: '定向测试', passed: results.length, results }, null, 2))
  console.log(`定向测试通过 ${results.length} 组；隔离数据库：${output}`)
} catch (error) {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ type: '定向测试', results, failed: String(error) }, null, 2))
  throw error
} finally { await stop() }
