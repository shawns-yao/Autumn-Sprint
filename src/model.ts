export const statuses = ['已投递', '初筛', '测评', '笔试', 'AI 面试', '一面', '二面', '三面', 'HR 面', 'Offer', '拒绝', '终止'] as const
export type Status = string
export type StageReview = { html?: string; tags: string[] }
export type Stage = { status: string; date: string; time: string; endTime: string; location: string; link: string; requirements: string; notes: string; review?: StageReview }
export const stageResultOptions = ['未开始', '进行中', '已安排', '已完成', '未通过', '已终止', '已获 Offer', '跳过', '已取消']
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
export const workflowFor = (app: Application): WorkflowStage[] => app.workflow ?? stagesFromFields(legacyStageFields).map(stage => ({ ...stage, ...((app as unknown as Record<string, Stage | undefined>)[stage.id] || {}) }))
export const getStage = (app: Application, key: StageKey): Stage => workflowFor(app).find(stage => stage.id === key) || emptyStage()
export const normalizedStatus = (app: Application) => app.status === '技术面' && !workflowFor(app).some(stage => stage.label === '技术面') ? '一面' : app.status
export const lifecycle = (app: Application) => app.terminated || app.status === '终止' ? '已终止' : app.status === '拒绝' ? '已结束' : app.status === 'Offer' ? 'Offer' : '进行中'
export const priorityLabel = (value: string) => value === '高' ? '核心目标' : value === '低' ? '低优先级' : '中优先级'
export const emptyStage = (): Stage => ({ status: '未开始', date: '', time: '', endTime: '', location: '', link: '', requirements: '', notes: '' })
export const timeRange = (value: { time: string; endTime?: string }) => value.endTime ? `${value.time} - ${value.endTime}` : value.time
export function withWorkflow(app: Application, workflow: WorkflowStage[]): Application {
  const outcome = workflow.find(stage => stage.status === '已终止') || workflow.find(stage => stage.status === '未通过') || workflow.find(stage => stage.status === '已获 Offer')
  const active = outcome || workflow.find(stage => ['已安排', '进行中'].includes(stage.status)) || [...workflow].reverse().find(stage => stage.status === '已完成')
  const status = outcome ? outcome.status === '已终止' ? '终止' : outcome.status === '未通过' ? '拒绝' : 'Offer' : active?.label || '已投递'
  return { ...app, workflow, status, currentStageId: active?.id || '', terminated: status === '终止' }
}
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
export const isClosed = (app: Application) => app.terminated || ['拒绝', '终止'].includes(app.status)
export function makeApplication(): Application {
  const workflow = stagesFromFields(stageFields)
  return { id: crypto.randomUUID(), company: '', title: '', city: '', status: '已投递', applied: localDate(), source: '官网', website: '', priority: '中', jd: '', resume: '', terminated: false, workflow, currentStageId: '' }
}
export const volunteerOrderOf = (app: Application) => Number.isInteger(app.volunteerOrder) && (app.volunteerOrder as number) >= 0 ? app.volunteerOrder as number : Number.MAX_SAFE_INTEGER
export const compareVolunteers = (a: Application, b: Application) => volunteerOrderOf(a) - volunteerOrderOf(b) || (b.applied || '').localeCompare(a.applied || '') || String(a.id).localeCompare(String(b.id))
export const isVolunteerFinished = (app: Application) => app.terminated || ['终止', '拒绝'].includes(app.status)
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
      stage, done: ['已完成', '未通过', '已终止', '已获 Offer', '跳过', '已取消'].includes(stage.status),
    })),
  ]).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}
export function nextEvent(app: Application) {
  return eventsFor([app]).find(event => !event.done && !isClosed(app) && app.status !== 'Offer')
}
const recordedStatuses = new Set(['进行中', '已安排', '已完成', '未通过', '已终止'])
export function recruitmentFunnel(apps: Application[]) {
  const enteredExam = apps.filter(app => workflowFor(app).some(stage => stage.kind === 'exam' && recordedStatuses.has(stage.status))).length
  const enteredInterview = apps.filter(app => workflowFor(app).some(stage => stage.kind === 'interview' && recordedStatuses.has(stage.status))).length
  const offers = apps.filter(app => app.status === 'Offer').length
  return [
    { label: '投递', count: apps.length, description: '个投递', color: '#4c92ee' },
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
