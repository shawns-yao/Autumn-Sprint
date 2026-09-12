export const statuses = ['已投递', '测评', '笔试', 'AI 面试', '一面', '二面', '三面', 'HR 面', 'Offer', '拒绝', '终止'] as const
export type Status = typeof statuses[number] | '技术面'
export type Stage = { status: string; date: string; time: string; location: string; link: string; requirements: string; notes: string }
export type Application = {
  id: string | number; company: string; title: string; city: string; status: Status;
  applied: string; source: string; website: string; priority: string; jd: string;
  jdImage?: string; resumeText?: string; evaluation: Stage; written: Stage;
  aiInterview: Stage; terminated: boolean; resume: string;
  firstInterview?: Stage; secondInterview?: Stage; thirdInterview?: Stage; hrInterview?: Stage;
  revision?: number; updatedAt?: string; attachments?: Attachment[];
}
export type Attachment = { id: string; name: string; mime: string; bytes: number; url: string }
export type View = 'home' | 'overview' | 'applications' | 'notes' | 'documents' | 'settings'
export const stageFields = [['evaluation', '测评'], ['written', '笔试'], ['aiInterview', 'AI 面试'], ['firstInterview', '一面'], ['secondInterview', '二面'], ['thirdInterview', '三面'], ['hrInterview', 'HR 面']] as const
export type StageKey = typeof stageFields[number][0]
export const getStage = (app: Application, key: StageKey): Stage => app[key] || emptyStage()
export const normalizedStatus = (app: Application) => app.status === '技术面' ? '一面' : app.status
export const lifecycle = (app: Application) => app.terminated || app.status === '终止' ? '已终止' : app.status === '拒绝' ? '已结束' : app.status === 'Offer' ? 'Offer' : '进行中'
export const priorityLabel = (value: string) => value === '高' ? '核心目标' : value === '低' ? '低优先级' : '中优先级'
export const emptyStage = (): Stage => ({ status: '未开始', date: '', time: '', location: '', link: '', requirements: '', notes: '' })
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
export const isClosed = (app: Application) => app.terminated || ['拒绝', '终止'].includes(app.status)
export function makeApplication(): Application {
  return { id: crypto.randomUUID(), company: '', title: '', city: '', status: '已投递', applied: localDate(), source: '官网', website: '', priority: '中', jd: '', resume: '', terminated: false, evaluation: emptyStage(), written: emptyStage(), aiInterview: emptyStage() }
}
export type Event = { id: string; app: Application; label: string; date: string; time: string; stage: Stage; done: boolean }
export function eventsFor(apps: Application[]): Event[] {
  return apps.flatMap(app => [
    ...(app.applied ? [{ id: `${app.id}-applied`, app, label: '投递', date: app.applied, time: '', stage: emptyStage(), done: true }] : []),
    ...stageFields.filter(([key]) => getStage(app, key).date && getStage(app, key).status !== '未开始').map(([key, label]) => ({
      id: `${app.id}-${key}`, app, label, date: getStage(app, key).date, time: getStage(app, key).time,
      stage: getStage(app, key), done: ['已完成', '未通过', '跳过', '已取消'].includes(getStage(app, key).status),
    })),
  ]).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
}
export function nextEvent(app: Application) {
  return eventsFor([app]).find(event => !event.done && !isClosed(app) && app.status !== 'Offer')
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
