import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const db = path.resolve(process.argv[2])
assert.ok(db.includes(`${path.sep}Test${path.sep}output${path.sep}`), '此定向测试仅允许使用 Test/output 下的隔离数据库')
const child = spawn(process.execPath, ['server.mjs'], { windowsHide: true, env: { ...process.env, DB_PATH: db, API_PORT: '0', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', data => { output += data })
child.stderr.on('data', data => { output += data })
try {
  let base
  for (let attempt = 0; attempt < 100; attempt++) {
    base = output.match(/API ready: (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
    if (base) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.ok(base, output)
  const get = async route => { const response = await fetch(base + route); assert.equal(response.status, 200); return response.json() }
  const workspace = await get('/api/workspace')
  assert.equal(workspace.applications.length, 52)
  assert.equal(workspace.applications.filter(item => !item.applied).length, 7)
  assert.equal(workspace.applications.filter(item => item.resume).length, 0)
  const notes = await get('/api/notes')
  assert.equal(notes.length, 57)
  const files = workspace.applications.flatMap(item => item.attachments)
  assert.equal(files.length, 76)
  let totalBytes = 0
  for (const file of files) {
    const response = await fetch(base + file.url)
    assert.equal(response.status, 200)
    const content = new Uint8Array(await response.arrayBuffer())
    assert.equal(content.length, file.bytes)
    assert.ok(content.length > 0)
    totalBytes += content.length
  }
  const result = { type: '定向测试', applications: 52, notes: 57, readableAttachments: 76, totalBytes, unknownDates: 7, generatedFakeResumeNames: 0, passed: true }
  fs.writeFileSync(path.resolve('Test/output/import-api-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done }
}
