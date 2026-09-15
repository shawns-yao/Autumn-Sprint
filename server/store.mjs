import { randomUUID, createHash } from 'node:crypto'
import { application, applicationOrder, normalizeStageStatus, stageMap, stageKind, object, text, url, identifier, integer, stringArray, requireValue, HttpError } from './validation.mjs'

const emptyStage = () => ({ status: '未开始', scheduleMode: 'exact', date: '', dateEnd: '', scheduleText: '', time: '', endTime: '', location: '', link: '', requirements: '', notes: '' })
const storageName = id => Object.hasOwn(stageMap, id) ? stageMap[id] : `node-${id}`
const defaultSettings = { staleEnabled: true, staleDays: 7, interviewEnabled: true, interviewHours: 24, examEnabled: true, examHours: 6 }
const defaultAiSettings = { providerName: '', note: '', website: '', baseUrl: '', model: '', protocol: 'responses', apiKey: '' }
const environmentApiKey = (process.env.AI_API_KEY || '').trim()
const now = () => new Date().toISOString()
const localDate = () => {
  const current = new Date()
  return new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const shiftDate = (value, days) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const scheduleDueDate = stage => stage.scheduleMode === 'range' ? stage.dateEnd : stage.scheduleMode === 'relative' && stage.date && stage.relativeDays ? shiftDate(stage.date, stage.relativeDays) : stage.scheduleMode === 'text' ? '' : stage.date
const scheduleLabel = stage => stage.scheduleMode === 'range' ? `${stage.date} 至 ${stage.dateEnd}` : stage.scheduleMode === 'relative' ? `${stage.relativeDays} 天内完成` : stage.scheduleMode === 'text' ? stage.scheduleText : `${stage.date}${stage.time ? ` ${stage.time}${stage.endTime ? ` - ${stage.endTime}` : ''}` : ''}`
export function createStore(db) {
  function rawSettings() {
    const value = db.prepare('SELECT value_json FROM app_settings WHERE id=1').get()?.value_json
    if (!value) return {}
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { throw new HttpError(500, '设置数据格式异常，请先备份数据库后修复') }
  }
  function writeSettings(value) {
    db.prepare('INSERT INTO app_settings VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json').run(JSON.stringify(value))
  }
  function readApplications({ page, pageSize = 100, query = '', id, summary = false } = {}) {
    const where = `WHERE a.deleted_at IS NULL AND (@query = '' OR instr(lower(c.name || ' ' || coalesce(a.title, '') || ' ' || coalesce(a.city, '') || ' ' || coalesce(a.source, '') || ' ' || a.status || ' ' || coalesce(a.workflow_json, '')), lower(@query)) > 0) AND (@id IS NULL OR a.id=@id)`
    const params = { query, id: id || null }
    const columns = summary ? `a.id,a.title,a.city,a.status,a.applied_date,a.source,a.official_url,a.priority,
      a.terminated,a.revision,a.updated_at,a.volunteer_order,
      json_set(a.workflow_json, '$.stages', json((SELECT json_group_array(json_remove(value, '$.requirements', '$.notes', '$.review'))
        FROM json_each(a.workflow_json, '$.stages')))) workflow_json` : 'a.*'
    const rows = db.prepare(`SELECT ${columns}, c.name company_name FROM applications a JOIN companies c ON c.id = a.company_id ${where}
      ORDER BY coalesce(a.applied_date, '') DESC, a.id ${page ? 'LIMIT @limit OFFSET @offset' : ''}`).all({ ...params, ...(page ? { limit: pageSize, offset: (page - 1) * pageSize } : {}) })
    const ids = JSON.stringify(rows.map(row => row.id))
    const stageColumns = summary ? 'application_id,stage_name,status,date,time,end_time,location,link' : '*'
    const stages = db.prepare(`SELECT ${stageColumns} FROM application_stages WHERE application_id IN (SELECT value FROM json_each(?))`).all(ids)
    const attachments = summary ? [] : db.prepare(`SELECT id,application_id,name,mime,bytes FROM stored_attachments
      WHERE deleted_at IS NULL AND application_id IN (SELECT value FROM json_each(?)) ORDER BY created_at,id`).all(ids)
    const stageGroups = Map.groupBy(stages, item => item.application_id)
    const fileGroups = Map.groupBy(attachments, item => item.application_id)
    const items = rows.map(row => {
      const byName = Object.fromEntries((stageGroups.get(row.id) || []).map(stage => [stage.stage_name, Object.fromEntries(Object.keys(emptyStage()).map(key => [key, key === 'status' ? normalizeStageStatus(stage.status || '未开始') : stage[key === 'endTime' ? 'end_time' : key] || '']))]))
      const legacy = Object.fromEntries(Object.entries(stageMap).map(([key, name]) => [key, byName[name] || (key === 'firstInterview' ? byName['技术面'] : key === 'aiInterview' ? byName['AI面试'] : key === 'hrInterview' ? byName.HR : undefined) || emptyStage()]))
      let metadata
      try { metadata = row.workflow_json ? JSON.parse(row.workflow_json) : null }
      catch { throw new HttpError(500, '招聘流程数据格式异常，请先备份后修复') }
      requireValue(!metadata || (Array.isArray(metadata.stages) && typeof metadata.currentStageId === 'string'), '招聘流程数据格式异常', 500)
      let workflow = metadata ? metadata.stages.map(node => ({ ...emptyStage(), ...byName[storageName(node.id)], ...node, status: normalizeStageStatus(node.status || byName[storageName(node.id)]?.status || '未开始') }))
        : Object.entries(stageMap).map(([id, label]) => ({ ...legacy[id], id, label, kind: stageKind(id) }))
      const storedStatus = row.status === '技术面' && !metadata ? '一面' : row.status === '已投递' ? '初筛' : row.status
      const hasProgress = workflow.some(stage => stage.status !== '未开始')
      const fallbackStageDate = (row.updated_at || row.applied_date || '').slice(0, 10) || localDate()
      if (row.status === '已投递' && !metadata?.currentStageId && !hasProgress && workflow[0]) workflow = workflow.map((stage, index) => index === 0 ? { ...stage, status: '进行中', date: stage.date || fallbackStageDate } : stage)
      const currentStageId = metadata?.currentStageId || (workflow.find(stage => ['未通过', 'Offer'].includes(stage.status)) || workflow.find(stage => stage.label === storedStatus || (row.status === '技术面' && stage.id === 'firstInterview')))?.id || ''
      return {
        ...(summary ? { summary: true } : {}),
        id: row.id, company: row.company_name, title: row.title || '', city: row.city || '', status: storedStatus,
        applied: row.applied_date || '', source: row.source || '', website: row.official_url || '', priority: row.priority || '中',
        jd: row.jd_text || '', resume: row.resume_name || '', terminated: Boolean(row.terminated), revision: row.revision, updatedAt: row.updated_at,
        volunteerOrder: Number.isInteger(row.volunteer_order) ? row.volunteer_order : undefined,
        ...legacy, workflow, currentStageId,
        attachments: (fileGroups.get(row.id) || []).map(({ application_id, ...file }) => ({ ...file, url: `/api/attachments/${file.id}` })),
      }
    })
    const total = page ? db.prepare(`SELECT count(*) total FROM applications a JOIN companies c ON c.id = a.company_id ${where}`).get(params).total : items.length
    return { items, total, page: page || 1, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  }
  function getApplication(id) { return readApplications({ id }).items[0] }
  const saveApplication = db.transaction(input => {
    requireValue(!input?.summary, '请先加载完整岗位详情再保存')
    const value = application(input)
    const requestedOrder = input.companyOrder === undefined ? null : applicationOrder(input.companyOrder)
    const previous = db.prepare('SELECT * FROM applications WHERE id = ?').get(value.id)
    requireValue(!previous?.deleted_at, '岗位已删除，请刷新后重试', 409)
    requireValue(!previous || value.revision === previous.revision, '岗位已被其他页面更新，请重新打开后编辑', 409)
    requireValue(!previous?.workflow_json || value.workflow, '岗位使用自定义流程，请重新加载后编辑', 409)
    const companyId = db.prepare('INSERT INTO companies(name) VALUES (?) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id').get(value.company).id
    const nextOrder = db.prepare('SELECT COALESCE(MAX(volunteer_order), -1) + 1 next FROM applications WHERE company_id=? AND deleted_at IS NULL').get(companyId).next
    const requestedPosition = requestedOrder?.indexOf(value.id) ?? -1
    const volunteerOrder = requestedPosition >= 0 ? requestedPosition : previous?.company_id === companyId ? value.volunteerOrder ?? previous.volunteer_order ?? nextOrder : nextOrder
    db.prepare(`INSERT INTO applications(id,company_id,title,city,status,applied_date,source,official_url,priority,jd_text,terminated,resume_name,updated_at,revision,volunteer_order)
      VALUES (@id,@companyId,@title,@city,@status,@applied,@source,@website,@priority,@jd,@terminated,@resume,@updatedAt,1,@volunteerOrder)
      ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,title=excluded.title,city=excluded.city,status=excluded.status,
      applied_date=excluded.applied_date,source=excluded.source,official_url=excluded.official_url,priority=excluded.priority,jd_text=excluded.jd_text,
      terminated=excluded.terminated,resume_name=excluded.resume_name,updated_at=excluded.updated_at,revision=applications.revision+1,volunteer_order=excluded.volunteer_order`).run({ ...value, companyId, terminated: Number(value.terminated), updatedAt: now(), volunteerOrder })
    if (requestedOrder) {
      const rows = db.prepare('SELECT a.id FROM applications a WHERE a.company_id=? AND a.deleted_at IS NULL').all(companyId)
      const ids = new Set(rows.map(row => row.id))
      requireValue(requestedOrder.length === ids.size && requestedOrder.every(id => ids.has(id)), '志愿顺序与公司岗位不一致')
      const updatedAt = now()
      const orderJson = JSON.stringify(requestedOrder)
      db.prepare(`UPDATE applications
        SET volunteer_order=(SELECT CAST(key AS INTEGER) FROM json_each(@orderJson) WHERE value=applications.id),
            updated_at=CASE WHEN id=@currentId THEN updated_at ELSE @updatedAt END,
            revision=CASE WHEN id=@currentId THEN revision ELSE revision+1 END
        WHERE company_id=@companyId AND deleted_at IS NULL
          AND id IN (SELECT value FROM json_each(@orderJson))`).run({ orderJson, currentId: value.id, updatedAt, companyId })
    }
    const stages = value.workflow ? value.workflow.map(node => ({ ...node, name: storageName(node.id) })) : Object.entries(stageMap)
      .filter(([key]) => key !== 'initialScreening' || Boolean(value[key] && (Object.entries(value[key]).some(([field, item]) => field !== 'status' && item) || value[key].status !== '未开始')))
      .map(([key, name]) => ({ ...value[key], name }))
    db.prepare(`INSERT INTO application_stages(application_id,stage_name,status,date,time,end_time,location,link,requirements,notes)
      SELECT @id,json_extract(value,'$.name'),json_extract(value,'$.status'),json_extract(value,'$.date'),json_extract(value,'$.time'),
        json_extract(value,'$.endTime'),json_extract(value,'$.location'),json_extract(value,'$.link'),json_extract(value,'$.requirements'),json_extract(value,'$.notes')
      FROM json_each(@stages) WHERE true
      ON CONFLICT(application_id,stage_name) DO UPDATE SET status=excluded.status,date=excluded.date,time=excluded.time,end_time=excluded.end_time,
        location=excluded.location,link=excluded.link,requirements=excluded.requirements,notes=excluded.notes`).run({ id: value.id, stages: JSON.stringify(stages) })
    // Workflow metadata is core configuration; removed stage rows and event snapshots remain historical records.
    db.prepare('UPDATE applications SET workflow_json=? WHERE id=?').run(value.workflow ? JSON.stringify({ stages: value.workflow.map(({ id, label, kind, scheduleMode, dateEnd, relativeDays, scheduleText, review }) => ({ id, label, kind, scheduleMode, ...(dateEnd ? { dateEnd } : {}), ...(relativeDays ? { relativeDays } : {}), ...(scheduleText ? { scheduleText } : {}), ...(review ? { review } : {}) })), currentStageId: value.currentStageId }) : null, value.id)
    db.prepare('INSERT INTO application_events(application_id,event_type,payload_json,created_at) VALUES (?,?,?,?)').run(value.id, previous ? 'updated' : 'created', JSON.stringify(value), now())
    return getApplication(value.id)
  })
  function deleteApplication(id, input) {
    object(input)
    const revision = integer(input.revision, '岗位版本', 0, Number.MAX_SAFE_INTEGER)
    const deletedAt = now()
    const result = db.prepare('UPDATE applications SET deleted_at=?, updated_at=?, revision=revision+1 WHERE id=? AND revision=? AND deleted_at IS NULL').run(deletedAt, deletedAt, id, revision)
    requireValue(result.changes === 1, '岗位已被修改或删除，请刷新后重试', 409)
    db.prepare('INSERT INTO application_events(application_id,event_type,payload_json,created_at) VALUES (?,?,?,?)').run(id, 'deleted', JSON.stringify({ id, revision }), deletedAt)
  }
  const deleteCompany = db.transaction(input => {
    object(input)
    const company = text(input.company, '公司', 200, true)
    const ids = db.prepare('SELECT a.id FROM applications a JOIN companies c ON c.id=a.company_id WHERE c.name=? AND a.deleted_at IS NULL').all(company).map(row => row.id)
    requireValue(ids.length > 0, '公司不存在或已删除', 404)
    const deletedAt = now()
    const idJson = JSON.stringify(ids)
    db.prepare(`INSERT INTO application_events(application_id,event_type,payload_json,created_at)
      SELECT value, 'deleted', json_object('id', value, 'revision', (SELECT revision FROM applications WHERE id=value), 'company', @company), @deletedAt
      FROM json_each(@idJson)`).run({ idJson, company, deletedAt })
    const result = db.prepare(`UPDATE applications SET deleted_at=@deletedAt,updated_at=@deletedAt,revision=revision+1
      WHERE id IN (SELECT value FROM json_each(@idJson)) AND deleted_at IS NULL`).run({ idJson, deletedAt })
    requireValue(result.changes === ids.length, '公司岗位已被修改或删除，请刷新后重试', 409)
    return { ok: true, company, deleted: result.changes }
  })
  function readNotes() {
    const rows = db.prepare('SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY updated_at DESC,id').all()
    const links = Map.groupBy(db.prepare('SELECT * FROM note_applications').all(), item => item.note_id)
    return rows.map(row => ({ id: row.id, title: row.title, category: row.category, body: row.body, tags: JSON.parse(row.tags_json),
      createdAt: row.created_at, updatedAt: row.updated_at, applicationIds: (links.get(row.id) || []).map(item => item.application_id) }))
  }
  const saveNote = db.transaction((input, importOnly = false) => {
    object(input)
    const id = identifier(input.id)
    const previous = db.prepare('SELECT * FROM notes WHERE id=?').get(id)
    if (importOnly && previous) return { skipped: true, id }
    requireValue(!previous?.deleted_at, '笔记已删除', 409)
    requireValue(!previous || input.expectedUpdatedAt === previous.updated_at, '笔记已被其他页面修改，请保留内容后重新打开', 409)
    const applicationIds = stringArray(input.applicationIds, '关联岗位', 500).map(identifier)
    const found = db.prepare('SELECT count(*) count FROM applications WHERE id IN (SELECT value FROM json_each(?))').get(JSON.stringify(applicationIds)).count
    requireValue(found === applicationIds.length, '关联岗位不存在')
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous?.updated_at || '1970-01-01') + 1)).toISOString()
    db.prepare(`INSERT INTO notes(id,title,category,body,tags_json,created_at,updated_at) VALUES (@id,@title,@category,@body,@tags,@createdAt,@updatedAt)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,body=excluded.body,tags_json=excluded.tags_json,updated_at=excluded.updated_at`)
      .run({ id, title: text(input.title, '笔记标题', 200, true), category: text(input.category, '分类', 100, true),
        body: text(input.body, '正文', 1000000, false, true), tags: JSON.stringify(stringArray(input.tags, '标签', 50)), createdAt: previous?.created_at || updatedAt, updatedAt })
    // Replaceable associations are distinct from retained core and historical records.
    db.prepare('DELETE FROM note_applications WHERE note_id=?').run(id)
    db.prepare('INSERT INTO note_applications(note_id,application_id) SELECT ?,value FROM json_each(?)').run(id, JSON.stringify(applicationIds))
    return readNotes().find(note => note.id === id)
  })
  function deleteNote(id, input) {
    object(input)
    const result = db.prepare('UPDATE notes SET deleted_at=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL').run(now(), now(), id, text(input.expectedUpdatedAt, '笔记版本', 50, true))
    requireValue(result.changes === 1, '笔记已修改或已删除，请刷新后重试', 409)
  }
  const importLegacy = db.transaction((kind, input) => {
    requireValue(Array.isArray(input) && input.length <= 500, '导入内容必须是不超过 500 条的列表')
    const existing = new Set(db.prepare(`SELECT id FROM ${kind === 'notes' ? 'notes' : 'resource_links'}`).all().map(item => item.id))
    const records = []
    const ids = new Set()
    for (const entry of input) {
      object(entry)
      const id = identifier(entry.id)
      requireValue(!ids.has(id), '导入记录存在重复标识'); ids.add(id)
      if (existing.has(id)) continue
      if (kind === 'notes') {
        const created = entry.createdAt === undefined ? now() : text(entry.createdAt, '笔记创建时间', 50, true)
        const updated = entry.updatedAt === undefined ? created : text(entry.updatedAt, '笔记更新时间', 50, true)
        requireValue(Number.isFinite(Date.parse(created)) && Number.isFinite(Date.parse(updated)) && Date.parse(updated) >= Date.parse(created), '旧笔记时间无效')
        records.push({ id, title: text(entry.title, '标题', 200, true), category: text(entry.category, '分类', 100, true),
          body: text(entry.body, '正文', 1000000, false, true), tags: stringArray(entry.tags, '标签', 50), applicationIds: stringArray(entry.applicationIds, '关联岗位', 500).map(identifier),
          createdAt: new Date(created).toISOString(), updatedAt: new Date(updated).toISOString() })
      }
      else records.push({ id, name: text(entry.name, '名称', 100, true), url: url(text(entry.url, '网址', 4000, true), '网址'), note: text(entry.note, '备注', 1000) })
    }
    const data = JSON.stringify(records)
    if (kind === 'notes') {
      const links = [...new Set(records.flatMap(item => item.applicationIds))]
      const count = db.prepare('SELECT count(*) count FROM applications WHERE id IN (SELECT value FROM json_each(?))').get(JSON.stringify(links)).count
      requireValue(count === links.length, '旧笔记包含不存在的岗位关联，导入未执行，原始副本仍保留')
      db.prepare(`INSERT INTO notes(id,title,category,body,tags_json,created_at,updated_at)
        SELECT json_extract(value,'$.id'),json_extract(value,'$.title'),json_extract(value,'$.category'),json_extract(value,'$.body'),
        json_extract(value,'$.tags'),json_extract(value,'$.createdAt'),json_extract(value,'$.updatedAt') FROM json_each(@data)`).run({ data })
      db.prepare(`INSERT INTO note_applications(note_id,application_id)
        SELECT json_extract(n.value,'$.id'),a.value FROM json_each(?) n JOIN json_each(n.value,'$.applicationIds') a`).run(data)
    } else db.prepare(`INSERT INTO resource_links(id,name,url,note,updated_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.name'),json_extract(value,'$.url'),json_extract(value,'$.note'),@time FROM json_each(@data)`).run({ data, time: now() })
    return { imported: records.length, skipped: input.length - records.length }
  })
  function readResources() { return db.prepare('SELECT id,name,url,note,updated_at updatedAt FROM resource_links WHERE deleted_at IS NULL ORDER BY name,id').all() }
  function saveResource(input) {
    object(input)
    const id = identifier(input.id)
    const previous = db.prepare('SELECT * FROM resource_links WHERE id=?').get(id)
    requireValue(!previous || (!previous.deleted_at && previous.updated_at === input.updatedAt), '资源已修改或已删除，请刷新', 409)
    db.prepare(`INSERT INTO resource_links(id,name,url,note,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,note=excluded.note,updated_at=excluded.updated_at`)
      .run(id, text(input.name, '资源名称', 100, true), url(text(input.url, '网址', 4000, true), '网址'), text(input.note, '备注', 1000), new Date(Math.max(Date.now(), Date.parse(previous?.updated_at || '1970-01-01') + 1)).toISOString())
    return readResources().find(item => item.id === id)
  }
  function deleteResource(id, input) {
    const result = db.prepare('UPDATE resource_links SET deleted_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL').run(now(), id, text(input.updatedAt, '资源版本', 50, true))
    requireValue(result.changes === 1, '资源已修改或已删除，请刷新', 409)
  }
  function settings() {
    const stored = rawSettings()
    return Object.fromEntries(Object.keys(defaultSettings).map(key => [key, stored[key] ?? defaultSettings[key]]))
  }
  function saveSettings(input) {
    object(input)
    const result = {}
    for (const name of ['staleEnabled', 'interviewEnabled', 'examEnabled']) {
      requireValue(typeof input[name] === 'boolean', '提醒开关必须是布尔值'); result[name] = input[name]
    }
    result.staleDays = integer(input.staleDays, '未更新天数', 1, 365)
    result.interviewHours = integer(input.interviewHours, '面试提前小时', 1, 168)
    result.examHours = integer(input.examHours, '考试提前小时', 1, 168)
    writeSettings({ ...rawSettings(), ...result })
    return result
  }
  function resolveAiSettings(input, requireModel = true) {
    object(input)
    const current = { ...defaultAiSettings, ...(rawSettings().ai || {}) }
    const baseUrl = url(text(input.baseUrl ?? current.baseUrl, 'API 基础地址', 4000, true), 'API 基础地址').replace(/\/$/, '')
    const protocol = text(input.protocol ?? current.protocol, '接口格式', 30, true)
    requireValue(['responses', 'chat_completions'].includes(protocol), '接口格式只支持 Responses API 或 Chat Completions')
    const apiKeyInput = input.apiKey === undefined ? '' : text(input.apiKey, 'API Key', 4000)
    requireValue(input.clearApiKey === undefined || typeof input.clearApiKey === 'boolean', '清除密钥标记必须是布尔值')
    requireValue(!environmentApiKey || (!apiKeyInput && !input.clearApiKey), 'API Key 由服务器环境变量管理，不能通过页面修改或清除')
    const result = {
      providerName: text(input.providerName ?? current.providerName, '供应商名称', 100, requireModel),
      note: text(input.note ?? current.note, '供应商备注', 300),
      website: url(text(input.website ?? current.website, '供应商官网', 4000), '供应商官网'),
      baseUrl,
      model: text(input.model ?? current.model, '默认模型', 200, requireModel),
      protocol,
      apiKey: environmentApiKey || (input.clearApiKey ? '' : apiKeyInput || current.apiKey),
    }
    return result
  }
  function publicAiSettings(value = { ...defaultAiSettings, ...(rawSettings().ai || {}) }) {
    const { apiKey, ...visible } = value
    return { ...visible, hasApiKey: Boolean(environmentApiKey || apiKey), apiKeySource: environmentApiKey ? 'environment' : apiKey ? 'stored' : 'none' }
  }
  function aiSettings() { return publicAiSettings() }
  function saveAiSettings(input) {
    const value = resolveAiSettings(input)
    const stored = rawSettings()
    // Environment secrets stay in the process, not in the persisted settings.
    const persisted = { ...value, apiKey: environmentApiKey ? stored.ai?.apiKey || '' : value.apiKey }
    writeSettings({ ...stored, ai: persisted })
    return publicAiSettings(value)
  }
  function reminders(applications = readApplications().items) {
    const config = settings()
    const result = []
    const current = Date.now()
    for (const app of applications.filter(item => !['拒绝', '终止', 'Offer'].includes(item.status))) {
      const updated = Date.parse(app.updatedAt.includes('T') ? app.updatedAt : app.updatedAt.replace(' ', 'T') + 'Z')
      if (config.staleEnabled && Number.isFinite(updated) && current - updated >= config.staleDays * 86400000) result.push({ id: `${app.id}-stale`, applicationId: app.id, company: app.company, label: `超过 ${config.staleDays} 天未更新` })
      for (const stage of app.workflow) {
        const { id: key, label } = stage
        if (!['exam', 'interview'].includes(stage.kind)) continue
        const exam = stage.kind === 'exam'
        const dueDate = scheduleDueDate(stage)
        if (stage.status !== '进行中' || !dueDate || !(exam ? config.examEnabled : config.interviewEnabled)) continue
        const dueTime = stage.scheduleMode === 'exact' ? stage.time || '23:59' : '23:59'
        const due = new Date(`${dueDate}T${dueTime}:00+08:00`).getTime()
        const ends = stage.scheduleMode === 'exact' && stage.endTime ? new Date(`${dueDate}T${stage.endTime}:00+08:00`).getTime() : due
        if (due - current <= (exam ? config.examHours : config.interviewHours) * 3600000) result.push({ id: `${app.id}-${key}`, applicationId: app.id, company: app.company, label: `${label} · ${scheduleLabel(stage)}${ends < current ? ' · 已过时间，请更新结果' : due < current ? ' · 进行中' : ''}` })
      }
    }
    return result
  }
  function saveAttachment(applicationId, input) {
    object(input)
    requireValue(db.prepare('SELECT 1 FROM applications WHERE id=?').get(applicationId), '请先保存岗位', 404)
    const name = text(input.name, '文件名称', 200, true)
    requireValue(!/[\\/\x00-\x1f]/.test(name), '文件名称无效')
    requireValue(typeof input.content === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(input.content) && input.content.length % 4 === 0, '文件编码无效')
    const content = Buffer.from(input.content, 'base64')
    requireValue(content.length > 0 && content.length <= 10 * 1024 * 1024, '文件大小须为 1 字节至 10 MB', 413)
    const signature = content.subarray(0, 12)
    const mime = signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
      : signature[0] === 255 && signature[1] === 216 && signature[2] === 255 ? 'image/jpeg'
      : signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
      : signature.toString('ascii', 0, 5) === '%PDF-' ? 'application/pdf' : 'application/octet-stream'
    const sha = createHash('sha256').update(content).digest('hex')
    const previous = db.prepare('SELECT id FROM stored_attachments WHERE application_id=? AND sha256=? AND name=?').get(applicationId, sha, name)
    const id = previous?.id || randomUUID()
    db.prepare(`INSERT INTO stored_attachments(id,application_id,name,mime,content,bytes,sha256,created_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(application_id,sha256,name) DO UPDATE SET deleted_at=NULL`).run(id, applicationId, name, mime, content, content.length, sha, now())
    return getApplication(applicationId).attachments.find(item => item.id === id)
  }
  function attachment(id) {
    const row = db.prepare('SELECT * FROM stored_attachments WHERE id=? AND deleted_at IS NULL').get(id)
    if (!row) throw new HttpError(404, '附件不存在')
    return row
  }
  function deleteAttachment(id) {
    requireValue(db.prepare('UPDATE stored_attachments SET deleted_at=? WHERE id=? AND deleted_at IS NULL').run(now(), id).changes === 1, '附件不存在', 404)
  }
  return { readApplications, getApplication, saveApplication, deleteApplication, deleteCompany, readNotes, saveNote, deleteNote, importLegacy, readResources, saveResource, deleteResource, settings, saveSettings, aiSettings, saveAiSettings, resolveAiSettings, reminders, saveAttachment, attachment, deleteAttachment }
}
