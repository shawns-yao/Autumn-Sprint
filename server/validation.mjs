export const stageMap = { evaluation: '测评', written: '笔试', aiInterview: 'AI 面试', firstInterview: '一面', secondInterview: '二面', thirdInterview: '三面', hrInterview: 'HR 面' }
export const statuses = ['已投递', ...Object.values(stageMap), 'Offer', '拒绝', '终止']
export const stageStatuses = ['未开始', '已安排', '已完成', '未通过', '跳过', '已取消']
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
export function application(input) {
  object(input)
  const result = {
    id: identifier(input.id), company: text(input.company, '公司', 200, true),
    title: text(input.title, '岗位', 300), city: text(input.city, '城市', 200),
    status: input.status === '技术面' ? '一面' : input.status, applied: date(input.applied, '投递日期'),
    source: text(input.source, '来源', 100), website: url(input.website, '岗位网址'), priority: input.priority || '中',
    jd: text(input.jd, '岗位描述', 500000, false, true), resume: text(input.resume, '简历名称', 300),
    revision: input.revision,
  }
  requireValue(statuses.includes(result.status), '无效的岗位状态')
  requireValue(['高', '中', '低'].includes(result.priority), '无效的优先级')
  requireValue(typeof input.terminated === 'boolean' && input.terminated === (result.status === '终止'), '终止标记与岗位状态不一致')
  result.terminated = input.terminated
  for (const [key, label] of Object.entries(stageMap)) {
    const stage = object(input[key] || {})
    const status = stage.status || '未开始'
    requireValue(stageStatuses.includes(status), `${label}结果无效`)
    const value = { status, date: date(stage.date, `${label}日期`), time: text(stage.time, `${label}时间`, 5),
      location: text(stage.location, `${label}地点`, 500), link: url(stage.link, `${label}链接`),
      requirements: text(stage.requirements, `${label}要求`, 500000, false, true), notes: text(stage.notes, `${label}备注`, 500000, false, true) }
    requireValue(!value.time || (/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) && value.date), `${label}时间或日期无效`)
    requireValue(status !== '已安排' || Boolean(value.date), `${label}已安排时必须填写日期`)
    requireValue(!value.date || !result.applied || value.date >= result.applied, `${label}日期不能早于投递日期`)
    result[key] = value
  }
  const closed = ['Offer', '拒绝', '终止'].includes(result.status)
  const stages = Object.entries(stageMap).map(([key, label]) => ({ key, label, ...result[key] }))
  requireValue(result.status !== 'Offer' || !stages.some(item => item.status === '未通过'), '存在未通过阶段，不能同时标记为 Offer')
  if (closed) {
    // Closing a process cancels pending appointments, while preserving their dates and history.
    for (const item of stages) if (item.status === '已安排') result[item.key].status = '已取消'
  } else {
    requireValue(!stages.some(item => item.status === '未通过'), '存在未通过阶段，请将岗位设为拒绝或终止，或修正阶段结果')
    const current = stages.findIndex(item => item.label === result.status)
    requireValue(!stages.some((item, index) => item.status === '已安排' && index < current), '进入后续阶段前，请完成或取消此前的安排')
    requireValue(!stages.some(item => item.status === '已安排' && result.status === '已投递'), '已安排流程后，请设置对应的当前阶段')
    const scheduled = stages.filter(item => item.status === '已安排')
    requireValue(scheduled.length <= 1, '同一岗位只能有一个待进行的阶段安排')
    requireValue(!scheduled.length || scheduled[0].label === result.status, '待进行的安排必须对应当前阶段')
  }
  const dated = stages.filter(item => item.date && !['未开始', '已取消', '跳过'].includes(item.status))
  requireValue(dated.every((item, index) => !index || item.date >= dated[index - 1].date), '阶段日期与招聘顺序不一致')
  return result
}
