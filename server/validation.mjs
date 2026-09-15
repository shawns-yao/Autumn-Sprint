export const stageMap = { initialScreening: '初筛', evaluation: '测评', written: '笔试', aiInterview: 'AI 面试', firstInterview: '一面', secondInterview: '二面', thirdInterview: '三面', hrInterview: 'HR 面' }
export const stageKind = key => key === 'initialScreening' ? 'screening' : ['evaluation', 'written'].includes(key) ? 'exam' : 'interview'
export const statuses = ['已投递', ...Object.values(stageMap), 'Offer', '拒绝', '终止']
export const stageStatuses = ['未开始', '进行中', '已完成', '未通过', 'Offer', '已取消', '跳过']
const legacyStageStatusAliases = { '已安排': '进行中', '已终止': '已取消', '已获 Offer': 'Offer' }
export const normalizeStageStatus = value => legacyStageStatusAliases[value] || value
const localDate = () => {
  const current = new Date()
  return new Date(current.getTime() - current.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const completedBeforeAutoStart = new Set(['已完成', '跳过', '已取消'])
function startStage(stage) {
  if (stage.status === '进行中' && !stage.date && ['exact', 'relative'].includes(stage.scheduleMode || 'exact')) stage.date = localDate()
}
const shiftDate = (value, days) => {
  const dateValue = new Date(`${value}T00:00:00Z`)
  dateValue.setUTCDate(dateValue.getUTCDate() + days)
  return dateValue.toISOString().slice(0, 10)
}
const scheduleDueDate = stage => stage.scheduleMode === 'range' ? stage.dateEnd : stage.scheduleMode === 'relative' && stage.date && stage.relativeDays ? shiftDate(stage.date, stage.relativeDays) : stage.scheduleMode === 'text' ? '' : stage.date
function advanceStages(stages) {
  stages.forEach(startStage)
  if (stages.some(stage => stage.status === '进行中')) return
  const nextIndex = stages.findIndex((stage, index) => stage.status === '未开始' && stages.slice(0, index).every(previous => completedBeforeAutoStart.has(previous.status)))
  if (nextIndex >= 0) {
    stages[nextIndex].status = '进行中'
    startStage(stages[nextIndex])
  }
}
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status } }
export function requireValue(condition, message, status = 400) { if (!condition) throw new HttpError(status, message) }
export function object(value) { requireValue(value && typeof value === 'object' && !Array.isArray(value), '请求内容必须为对象'); return value }
export function text(value, field, max = 500, required = false, preserveWhitespace = false) {
  requireValue(value === undefined || value === null || typeof value === 'string', `${field}必须是文本`)
  const raw = value || ''
  const result = preserveWhitespace ? raw : raw.trim()
  requireValue(raw.length <= max && (!required || result.length > 0), `${field}为空或超过长度限制`)
  return result
}
export function date(value, field) {
  const result = text(value, field, 10)
  requireValue(!result || (/^\d{4}-\d{2}-\d{2}$/.test(result) && !Number.isNaN(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result), `${field}不是有效日期`)
  return result
}
export function url(value, field) {
  const result = text(value, field, 4000)
  if (result) {
    let parsed
    try { parsed = new URL(result) } catch { throw new HttpError(400, `${field}不是有效网址`) }
    requireValue(['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password, `${field}只支持不含凭据的 HTTP / HTTPS 网址`)
  }
  return result
}
export function identifier(value) { const id = text(value, '标识', 150, true); requireValue(/^[\w-]+$/.test(id), '无效标识'); return id }
export function integer(value, field, min, max) { requireValue(Number.isInteger(value) && value >= min && value <= max, `${field}必须是 ${min} 到 ${max} 之间的整数`); return value }
export function stringArray(value, field, max = 100) {
  requireValue(Array.isArray(value) && value.length <= max, `${field}不是有效列表`)
  return [...new Set(value.map(item => text(item, field, 150, true)))]
}
export function applicationOrder(value) {
  requireValue(Array.isArray(value) && value.length <= 500, '志愿顺序不是有效列表')
  const ids = value.map(identifier)
  requireValue(new Set(ids).size === ids.length, '志愿顺序存在重复岗位')
  return ids
}
export function application(input) {
  object(input)
  const result = {
    id: identifier(input.id), company: text(input.company, '公司', 200, true),
    title: text(input.title, '岗位', 300), city: text(input.city, '城市', 200),
    status: input.status === '技术面' && input.workflow === undefined ? '一面' : input.status === '已投递' ? '初筛' : input.status, applied: date(input.applied, '投递日期'),
    source: text(input.source, '来源', 100), website: url(input.website, '岗位网址'), priority: input.priority || '中',
    jd: text(input.jd, '岗位描述', 500000, false, true), resume: text(input.resume, '简历名称', 300),
    revision: input.revision, volunteerOrder: input.volunteerOrder === undefined ? undefined : integer(input.volunteerOrder, '志愿顺序', 0, 1000000),
  }
  requireValue(['高', '中', '低'].includes(result.priority), '无效的优先级')
  const custom = input.workflow !== undefined
  if (custom) requireValue(Array.isArray(input.workflow) && input.workflow.length <= 40, '招聘流程最多包含 40 个阶段')
  const rawNodes = custom ? input.workflow : Object.entries(stageMap).map(([id, label]) => ({ ...object(input[id] || {}), id, label, kind: stageKind(id) }))
  const legacyStageTerminated = rawNodes.some(node => node?.status === '已终止')
  const nodes = rawNodes.map(node => {
    const stage = object(node)
    return { ...stage, status: normalizeStageStatus(stage.status || '未开始') }
  })
  const hasOutcome = legacyStageTerminated || nodes.some(stage => ['Offer', '未通过'].includes(stage.status))
  const manuallyPausedStage = custom && nodes.find(stage => stage.id === input.currentStageId && stage.status === '未开始' && stage.label === result.status)
  if (!hasOutcome && !manuallyPausedStage) advanceStages(nodes)
  const ids = new Set()
  const labels = new Set()
  const stages = nodes.map(node => {
    const stage = object(node)
    const id = identifier(stage.id)
    const label = text(stage.label, '阶段名称', 80, true)
    requireValue(!ids.has(id) && !labels.has(label), '阶段标识和名称不能重复')
    requireValue(!['已投递', '投递', 'Offer', '拒绝', '终止'].includes(label), '阶段名称不能使用岗位整体状态')
    requireValue(['screening', 'exam', 'interview', 'other'].includes(stage.kind), `${label}类型无效`)
    ids.add(id); labels.add(label)
    const status = stage.status
    requireValue(stageStatuses.includes(status), `${label}结果无效`)
    const scheduleMode = text(stage.scheduleMode || 'exact', `${label}安排方式`, 20, true)
    requireValue(['exact', 'range', 'relative', 'text'].includes(scheduleMode), `${label}安排方式无效`)
    const value = { id, label, kind: stage.kind, status, scheduleMode, date: date(stage.date, `${label}日期`), dateEnd: date(stage.dateEnd, `${label}结束日期`),
      relativeDays: stage.relativeDays === undefined || stage.relativeDays === null ? undefined : integer(stage.relativeDays, `${label}完成期限`, 1, 365), scheduleText: text(stage.scheduleText, `${label}时间说明`, 200),
      time: text(stage.time, `${label}开始时间`, 5), endTime: text(stage.endTime, `${label}结束时间`, 5),
      location: text(stage.location, `${label}地点`, 500), link: url(stage.link, `${label}链接`),
      requirements: text(stage.requirements, `${label}要求`, 500000, false, true), notes: text(stage.notes, `${label}备注`, 500000, false, true) }
    if (stage.review !== undefined) {
      const review = object(stage.review)
      value.review = { tags: stringArray(review.tags || [], `${label}复盘标签`, 20) }
      if (review.html !== undefined) value.review.html = text(review.html, `${label}复盘正文`, 500000, false, true)
    }
    requireValue(!value.time || (/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) && value.date), `${label}时间或日期无效`)
    requireValue(!value.endTime || (/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) && value.date && value.time && value.endTime > value.time), `${label}结束时间必须晚于开始时间，并填写日期`)
    requireValue(scheduleMode === 'exact' || (!value.time && !value.endTime), `${label}只有具体日期可以填写时刻`)
    requireValue(scheduleMode !== 'range' || (value.date && value.dateEnd && value.dateEnd >= value.date), `${label}日期范围必须完整，且结束日期不能早于开始日期`)
    requireValue(scheduleMode !== 'relative' || (value.date && value.relativeDays), `${label}相对期限必须填写起算日期和完成天数`)
    requireValue(scheduleMode !== 'text' || value.scheduleText, `${label}请填写时间说明`)
    requireValue(scheduleMode === 'range' || !value.dateEnd, `${label}结束日期与安排方式不一致`)
    requireValue(scheduleMode === 'relative' || value.relativeDays === undefined, `${label}完成期限与安排方式不一致`)
    requireValue(scheduleMode === 'text' || !value.scheduleText, `${label}时间说明与安排方式不一致`)
    requireValue(!value.date || !result.applied || value.date >= result.applied, `${label}日期不能早于投递日期`)
    return value
  })
  requireValue(custom ? [...statuses, ...labels].includes(result.status) : statuses.includes(result.status), '无效的岗位状态')
  const stageOffered = stages.some(stage => stage.status === 'Offer')
  const stageFailed = stages.some(stage => stage.status === '未通过')
  const activeStage = stages.find(stage => stage.status === '进行中') || (manuallyPausedStage && stages.find(stage => stage.id === manuallyPausedStage.id)) || [...stages].reverse().find(stage => stage.status === '已完成') || stages.find(stage => stage.id === input.currentStageId && stage.label === result.status && stage.status === '未开始')
  requireValue(!(stageOffered && (legacyStageTerminated || stageFailed)), '岗位不能同时标记为结束和 Offer')
  const inferredTermination = legacyStageTerminated && result.status !== '终止'
  if (legacyStageTerminated) {
    result.status = '终止'
  } else if (stageOffered) {
    result.status = 'Offer'
  } else if (custom) {
    result.status = stageFailed ? '拒绝' : activeStage?.label || '初筛'
  }
  requireValue(typeof input.terminated === 'boolean' && (custom || inferredTermination || input.terminated === (result.status === '终止')), '终止标记与岗位状态不一致')
  result.terminated = result.status === '终止'
  const closed = ['Offer', '拒绝', '终止'].includes(result.status)
  requireValue(result.status !== 'Offer' || !stages.some(item => item.status === '未通过'), '存在未通过阶段，不能同时标记为 Offer')
  if (closed) {
    // Closing a process cancels pending appointments, while preserving their dates and history.
    for (const item of stages) if (item.status === '进行中') item.status = '已取消'
  } else {
    requireValue(!stages.some(item => item.status === '未通过'), '存在未通过阶段，请将岗位设为拒绝或终止，或修正阶段结果')
    const current = stages.findIndex(item => item.label === result.status)
    const scheduled = stages.filter(item => item.status === '进行中')
    requireValue(scheduled.length <= 1, '同一岗位只能有一个进行中的阶段')
    requireValue(!scheduled.length || scheduled[0].label === result.status, '待进行的安排必须对应当前阶段')
  }
  const dated = stages.map(item => ({ item, dueDate: scheduleDueDate(item) })).filter(({ item, dueDate }) => dueDate && !['未开始', '已取消', '跳过'].includes(item.status))
  requireValue(dated.every(({ item, dueDate }, index) => !index || `${dueDate} ${item.time}` >= `${dated[index - 1].dueDate} ${dated[index - 1].item.time}`), '阶段日期与自定义招聘顺序不一致')
  for (const id of Object.keys(stageMap)) result[id] = stages.find(stage => stage.id === id) || { status: '未开始', date: '', time: '', endTime: '', location: '', link: '', requirements: '', notes: '' }
  if (custom) {
    result.workflow = stages
    result.currentStageId = (stages.find(stage => stage.status === '未通过') || stages.find(stage => stage.status === 'Offer') || activeStage)?.id || ''
  }
  return result
}
