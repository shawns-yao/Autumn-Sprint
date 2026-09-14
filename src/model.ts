export const statuses = ['未开始', '进行中', '已完成', '未通过', 'Offer', '已取消', '跳过'] as const
export type Status = string
export type StageReview = { html?: string; tags: string[] }
export type Stage = { status: string; date: string; time: string; endTime: string; location: string; link: string; requirements: string; notes: string; review?: StageReview }
export const stageResultOptions = ['未开始', '进行中', '已完成', '未通过', 'Offer', '已取消', '跳过'] as const
export const stageKinds = [['screening', '初筛'], ['exam', '测评 / 笔试'], ['interview', '面试'], ['other', '其他']] as const
export type StageKind = typeof stageKinds[number][0]
export type WorkflowStage = Stage & { id: string; label: string; kind: StageKind }
export type Application = {
  id: string | number; company: string; title: string; city: string; status: Status;
  applied: string; source: string; website: string; priority: string; jd: string;
  volunteerOrder?: number;
  jdImage?: string; resumeText?: string; evaluation?: Stage; written?: Stage;
  aiInterview?: Stage; terminated: boolean; resume: string;
  firstInterview?: Stage; secondInterview?: Stage; thirdInterview?: Stage; hrInterview?: Stage;
  revision?: number; updatedAt?: string; attachments?: Attachment[];
  initialScreening?: Stage; workflow?: WorkflowStage[]; currentStageId?: string;
}
export type Attachment = { id: string; name: string; mime: string; bytes: number; url: string }
export type View = 'home' | 'overview' | 'applications' | 'notes' | 'documents' | 'settings'
export const normalizedCompany = (value: string) => value.trim().toLocaleLowerCase()
export const stageFields = [['initialScreening', '初筛'], ['evaluation', '测评'], ['written', '笔试'], ['firstInterview', '一面'], ['secondInterview', '二面'], ['thirdInterview', '三面']] as const
const legacyStageFields = [['initialScreening', '初筛'], ['evaluation', '测评'], ['written', '笔试'], ['aiInterview', 'AI 面试'], ['firstInterview', '一面'], ['secondInterview', '二面'], ['thirdInterview', '三面'], ['hrInterview', 'HR 面']] as const
const stageKindFor = (id: string): StageKind => id === 'initialScreening' ? 'screening' : ['evaluation', 'written'].includes(id) ? 'exam' : 'interview'
const stagesFromFields = (fields: readonly (readonly [string, string])[]): WorkflowStage[] => fields.map(([id, label]) => ({ ...emptyStage(), id, label, kind: stageKindFor(id) }))
export type StageKey = string
const legacyStageStatusAliases: Record<string, string> = { '已安排': '进行中', '已终止': '已取消', '已获 Offer': 'Offer' }
export const normalizeStageStatus = (status: string) => legacyStageStatusAliases[status] || status
export const stageProgressLabel = (stage?: Pick<WorkflowStage, 'label' | 'status'>) => stage?.status === '进行中' ? `${stage.label}中` : stage?.label || ''
export const workflowFor = (app: Application): WorkflowStage[] => (app.workflow ?? stagesFromFields(legacyStageFields).map(stage => ({ ...stage, ...((app as unknown as Record<string, Stage | undefined>)[stage.id] || {}) }))).map(stage => ({ ...stage, status: normalizeStageStatus(stage.status || '未开始') }))
const normalizeSearchText = (value: string) => value.toLocaleLowerCase().normalize('NFKC').replace(/[\s\-_/、,，|;；·]+/g, '')
export const matchesApplicationQuery = (app: Application, query: string) => {
  const terms = query.split(/[\s\-_/、,，|;；·]+/).map(normalizeSearchText).filter(Boolean)
  if (!terms.length) return true
  const searchable = normalizeSearchText([app.company, app.title, app.city, app.source, app.status, ...workflowFor(app).flatMap(stage => [stage.label, stage.status])].join(' '))
  return terms.every(term => searchable.includes(term))
}
export const getStage = (app: Application, key: StageKey): Stage => workflowFor(app).find(stage => stage.id === key) || emptyStage()
export const normalizedStatus = (app: Application) => {
  const workflow = workflowFor(app)
  const active = workflow.find(stage => stage.status === '进行中')
  if (active) return active.label
  const status = app.status === '已投递' ? '初筛' : app.status
  return status === '技术面' && !workflow.some(stage => stage.label === '技术面') ? '一面' : status
}
export const lifecycle = (app: Application) => app.terminated || ['终止', '已取消'].includes(app.status) ? '已取消' : app.status === '拒绝' ? '未通过' : app.status === 'Offer' ? 'Offer' : '进行中'
export const priorityLabel = (value: string) => value === '高' ? '核心目标' : value === '低' ? '低优先级' : '中优先级'
export const emptyStage = (): Stage => ({ status: '未开始', date: '', time: '', endTime: '', location: '', link: '', requirements: '', notes: '' })
export const timeRange = (value: { time: string; endTime?: string }) => value.endTime ? `${value.time} - ${value.endTime}` : value.time
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const completedBeforeAutoStart = new Set(['已完成', '跳过', '已取消'])
export function advanceWorkflow(workflow: WorkflowStage[]) {
  const next = workflow.map(stage => ({ ...stage, status: normalizeStageStatus(stage.status || '未开始') }))
  for (const stage of next) if (stage.status === '进行中' && !stage.date) stage.date = localDate()
  if (next.some(stage => stage.status === '进行中')) return next
  const nextIndex = next.findIndex((stage, index) => stage.status === '未开始' && next.slice(0, index).every(previous => completedBeforeAutoStart.has(previous.status)))
  if (nextIndex >= 0) next[nextIndex] = { ...next[nextIndex], status: '进行中', date: next[nextIndex].date || localDate() }
  return next
}
export function currentWorkflowStage(app: Application) {
  const stages = workflowFor(app)
  const active = stages.find(stage => stage.status === '进行中')
  if (active) return active
  const currentIndex = stages.findIndex(stage => stage.id === app.currentStageId || stage.label === normalizedStatus(app))
  const current = currentIndex >= 0 ? stages[currentIndex] : undefined
  if (current?.status === '未开始') return current
  if (currentIndex >= 0) return stages.slice(currentIndex + 1).find(stage => stage.status === '未开始')
  return undefined
}
export function withWorkflow(app: Application, workflow: WorkflowStage[]): Application {
  const nextWorkflow = advanceWorkflow(workflow)
  const outcome = nextWorkflow.find(stage => stage.status === '未通过') || nextWorkflow.find(stage => stage.status === 'Offer')
  const active = outcome || nextWorkflow.find(stage => stage.status === '进行中') || [...nextWorkflow].reverse().find(stage => stage.status === '已完成')
  const status = outcome ? outcome.status === '未通过' ? '拒绝' : 'Offer' : app.terminated && !active ? '终止' : active?.label || nextWorkflow[0]?.label || '初筛'
  return { ...app, workflow: nextWorkflow, status, currentStageId: active?.id || '', terminated: status === '终止' }
}
export const isClosed = (app: Application) => app.terminated || ['拒绝', '终止', '已取消'].includes(app.status)
export function makeApplication(): Application {
  const workflow = stagesFromFields(stageFields).map((stage, index) => index === 0 ? { ...stage, status: '进行中', date: localDate() } : stage)
  return { id: crypto.randomUUID(), company: '', title: '', city: '', status: '初筛', applied: localDate(), source: '官网', website: '', priority: '中', jd: '', resume: '', terminated: false, workflow, currentStageId: 'initialScreening' }
}
export const volunteerOrderOf = (app: Application) => Number.isInteger(app.volunteerOrder) && (app.volunteerOrder as number) >= 0 ? app.volunteerOrder as number : Number.MAX_SAFE_INTEGER
export const compareVolunteers = (a: Application, b: Application) => volunteerOrderOf(a) - volunteerOrderOf(b) || (b.applied || '').localeCompare(a.applied || '') || String(a.id).localeCompare(String(b.id))
export const isVolunteerFinished = (app: Application) => app.terminated || ['终止', '拒绝', '已取消'].includes(app.status)
export function companyApplications(apps: Application[], company: string) {
  return apps.filter(app => normalizedCompany(app.company) === normalizedCompany(company)).sort(compareVolunteers)
}
export function primaryApplications(apps: Application[]) {
  const groups = new Map<string, Application[]>()
  for (const app of apps) {
    const key = normalizedCompany(app.company)
    const group = groups.get(key) || []
    group.push(app)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => {
    const ordered = group.sort(compareVolunteers)
    return ordered.find(app => !isVolunteerFinished(app)) || ordered[ordered.length - 1]
  }).filter((app): app is Application => Boolean(app))
}
export type Event = { id: string; app: Application; label: string; date: string; time: string; endTime: string; stage: Stage; done: boolean }
export function eventsFor(apps: Application[]): Event[] {
  return apps.flatMap(app => [
    ...(app.applied ? [{ id: `${app.id}-applied`, app, label: '投递', date: app.applied, time: '', endTime: '', stage: emptyStage(), done: true }] : []),
    ...workflowFor(app).filter(stage => stage.date && stage.status !== '未开始').map(stage => ({
      id: `${app.id}-${stage.id}`, app, label: stage.label, date: stage.date, time: stage.time, endTime: stage.endTime,
      stage, done: ['已完成', '未通过', 'Offer', '跳过', '已取消'].includes(stage.status),
    })),
  ]).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}
export function nextEvent(app: Application) {
  return eventsFor([app]).find(event => !event.done && !isClosed(app) && app.status !== 'Offer')
}
const recordedStatuses = new Set(['进行中', '已完成', '未通过'])
export function recruitmentFunnel(apps: Application[]) {
  const activeApps = apps.filter(app => !isClosed(app))
  const currentStage = (app: Application) => workflowFor(app).find(stage => stage.status === '进行中')
  const enteredExam = activeApps.filter(app => currentStage(app)?.kind === 'exam').length
  const enteredInterview = activeApps.filter(app => currentStage(app)?.kind === 'interview').length
  const offers = activeApps.filter(app => app.status === 'Offer').length
  return [
    { label: '初筛中', count: activeApps.length, description: '个未终止岗位', color: '#4c92ee' },
    { label: '测评 / 笔试', count: enteredExam, description: '个有考试记录', color: '#9bc5f4' },
    { label: '面试记录', count: enteredInterview, description: '个有面试记录', color: '#a9ddcc' },
    { label: 'Offer', count: offers, description: '个 Offer', color: '#f4c8cd' },
  ]
}
export function relativeDate(date: string) {
  if (!date) return '时间待定'
  const days = Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${localDate()}T00:00:00`).getTime()) / 86400000)
  return days === 0 ? '今天' : days > 0 ? `还有 ${days} 天` : `${-days} 天前`
}
export function safeUrl(value?: string) {
  if (!value) return undefined
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
