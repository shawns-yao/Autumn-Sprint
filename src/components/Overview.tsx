import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, CalendarDays, ChevronRight, ClipboardList, Filter, Send, TrendingUp, Trophy, CircleX } from 'lucide-react'
import { isClosed, localDate, normalizedStatus, recruitmentFunnel, scheduleDate, scheduleLabel, timeRange, workflowFor, type Application, type View, type WorkflowStage } from '../model'
import { Heading, SelectField, Tooltip } from './Shared'
import './overview.css'

type Props = {
  apps: Application[]
  onOpen: (app: Application) => void
  onView: (view: View) => void
  onViewApplications?: (status?: string) => void
  action?: ReactNode
}

const colors = ['#3e78d8', '#61a5dd', '#3da58c', '#68a8a0', '#d99a3c', '#df7668', '#b87943', '#cb637f']

type TooltipStage = Pick<WorkflowStage, 'label' | 'status' | 'scheduleMode' | 'date' | 'dateEnd' | 'relativeDays' | 'scheduleText' | 'time' | 'endTime'>
type CompanyDetail = { id: string | number; company: string; status: string; tone: 'active' | 'danger' | 'muted' | 'success'; time: string }

const recordedStageStatuses = new Set(['进行中', '已完成', '未通过', 'Offer', '已取消', '跳过'])
const detailStageRank: Record<string, number> = { 进行中: 0, 未通过: 1, Offer: 1, 已取消: 2, 已完成: 3, 跳过: 4 }
const detailToneRank: Record<CompanyDetail['tone'], number> = { active: 0, success: 1, danger: 2, muted: 3 }

function formatTimestamp(value?: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
  return `${date} ${time}`
}

function chooseDetailStage(stages: WorkflowStage[]) {
  return [...stages].sort((a, b) => detailStageRank[a.status] - detailStageRank[b.status] || `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0]
}

function detailStageFor(app: Application, label: string): TooltipStage | undefined {
  const stages = workflowFor(app)
  if (label === '全部投递') {
    return stages.find(stage => stage.status === '进行中') || stages.find(stage => ['未通过', 'Offer', '已取消'].includes(stage.status))
  }
  if (label === '测评 / 笔试') {
    const exam = chooseDetailStage(stages.filter(stage => stage.kind === 'exam' && recordedStageStatuses.has(stage.status)))
    if (exam) return exam
    if (['测评', '笔试', '测评 / 笔试'].includes(app.status)) return { label: app.status, status: '进行中', date: '', time: '', endTime: '' }
    return undefined
  }
  if (label === '面试记录') {
    const interview = chooseDetailStage(stages.filter(stage => stage.kind === 'interview' && recordedStageStatuses.has(stage.status)))
    if (interview) return interview
    if (['AI 面试', '技术面', '一面', '二面', '三面', 'HR 面'].includes(app.status)) return { label: app.status, status: '进行中', date: '', time: '', endTime: '' }
    return undefined
  }
  if (label === 'Offer') return stages.find(stage => stage.status === 'Offer') || (app.status === 'Offer' ? { label: 'Offer', status: 'Offer', date: '', time: '', endTime: '' } : undefined)
  const stage = stages.find(item => item.label === label && item.status !== '未开始')
  return stage || (normalizedStatus(app) === label ? { label, status: '进行中', date: '', time: '', endTime: '' } : undefined)
}

function detailStatus(app: Application, stage: TooltipStage | undefined, label: string): Pick<CompanyDetail, 'status' | 'tone'> {
  if (!stage) {
    if (app.status === 'Offer') return { status: 'Offer', tone: 'success' }
    if (app.status === '拒绝') return { status: '未通过', tone: 'danger' }
    if (app.terminated || ['终止', '已取消'].includes(app.status)) return { status: '已终止', tone: 'danger' }
    return { status: '进行中', tone: 'active' }
  }
  if (stage.status === '进行中') return { status: '进行中', tone: 'active' }
  if (stage.status === '未通过') return { status: '未通过', tone: 'danger' }
  if (stage.status === '已完成') return { status: '已结束', tone: 'muted' }
  if (stage.status === '已取消') return { status: '已终止', tone: 'danger' }
  if (stage.status === '跳过') return { status: '已跳过', tone: 'muted' }
  if (stage.status === 'Offer') return { status: 'Offer', tone: 'success' }
  return { status: stage.status || `${label}进行中`, tone: 'muted' }
}

function detailTime(app: Application, stage?: TooltipStage) {
  if (stage && scheduleLabel(stage)) return scheduleLabel(stage)
  return formatTimestamp(app.updatedAt) || '时间待补充'
}

function companyDetails(label: string, applications: Application[]): CompanyDetail[] {
  const byCompany = new Map<string, CompanyDetail>()
  applications.forEach(app => {
    const stage = detailStageFor(app, label)
    const state = detailStatus(app, stage, label)
    const detail = { id: app.id, company: app.company?.trim() || '公司待补充', ...state, time: detailTime(app, stage) }
    const current = byCompany.get(detail.company)
    if (!current || detailToneRank[detail.tone] < detailToneRank[current.tone] || (detailToneRank[detail.tone] === detailToneRank[current.tone] && detail.time.localeCompare(current.time) > 0)) byCompany.set(detail.company, detail)
  })
  return [...byCompany.values()]
    .sort((a, b) => a.company.localeCompare(b.company, 'zh-CN'))
}

function CompaniesTooltip({ label, applications }: { label: string; applications: Application[] }) {
  const details = companyDetails(label, applications)
  const companies = [...new Set(details.map(detail => detail.company))]
  return <span className="home-data-tooltip">
    <span className="home-data-tooltip-heading"><strong>{label}</strong><small>{applications.length} 个岗位 · {companies.length} 家公司</small></span>
    <span className="home-data-tooltip-list" role="list">
      {details.length ? details.map(detail => <span className="home-data-tooltip-item" role="listitem" key={String(detail.id)}><span className="home-data-tooltip-time">{detail.time}</span><span className="home-data-tooltip-meta"><strong>{detail.company}</strong><small className={`home-data-tooltip-status ${detail.tone}`}>{detail.status}</small></span></span>) : <span className="home-data-tooltip-empty">暂无岗位</span>}
    </span>
  </span>
}

function DistributionPanel({ active, stageNames, onView }: { active: Application[]; stageNames: string[]; onView: () => void }) {
  const distribution = stageNames.map(stage => {
    const applications = active.filter(app => normalizedStatus(app) === stage)
    return { stage, applications, count: applications.length }
  })
  const maxCount = Math.max(1, ...distribution.map(item => item.count))
  return <section className="home-section">
    <header className="home-section-heading"><BarChart3 /><div><h2>当前流程分布</h2><p>未结束岗位 · 当前 {active.length} 个流程的所在阶段</p></div><button className="home-link" onClick={onView}>查看全部<ChevronRight size={15} /></button></header>
    <div className="home-distribution">{distribution.map(({ stage, applications, count }, index) => <div className="home-stage" key={stage}>
      <span className="home-stage-label" title={stage}>{stage}</span><span className="home-stage-track" role="meter" aria-label={`${stage}：${count} 个岗位`} aria-valuemin={0} aria-valuemax={maxCount} aria-valuenow={count}><span style={{ width: `${count / maxCount * 100}%`, background: colors[index % colors.length] }} /></span><strong>{count}</strong>
    </div>)}</div>
  </section>
}

function FunnelPanel({ apps, allApps, source, onSourceChange }: { apps: Application[]; allApps: Application[]; source: string; onSourceChange: (value: string) => void }) {
  const funnel = recruitmentFunnel(apps)
  const total = funnel[0]?.count || 0
  const options = [{ value: '', label: '全部渠道' }, ...[...new Set(allApps.map(app => app.source).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')).map(name => ({ value: name, label: name }))]
  return <section className="home-section">
    <header className="home-section-heading"><Filter /><div><h2>投递漏斗</h2><p>全部投递的历史流程记录 · 共 {total} 个岗位</p></div><SelectField label="投递渠道筛选" value={source} onChange={onSourceChange} options={options} /></header>
    <div className="home-funnel" aria-label="四阶段招聘记录漏斗">{funnel.map((item, index) => <div className="home-funnel-row" key={item.label}>
      {index === 0 ? <span className="home-funnel-shape" aria-label={`${item.label}：${item.count} 个岗位，${total ? `${Math.round(item.count / total * 100)}%` : '无数据'}`} style={{ width: `${100 - index * 16}%`, background: item.color, color: '#fff' }}><span>{item.label}</span><strong>{item.count}</strong></span> : <Tooltip placement="right" className="home-funnel-tooltip-anchor" contentClassName="home-data-tooltip-content" label={`${item.label}：查看公司明细`} tabIndex={0} content={<CompaniesTooltip label={item.label} applications={item.applications} />}><span className="home-funnel-shape" aria-label={`${item.label}：${item.count} 个岗位，${total ? `${Math.round(item.count / total * 100)}%` : '无数据'}`} style={{ width: `${100 - index * 16}%`, background: item.color, color: '#173454' }}><span>{item.label}</span><strong>{item.count}</strong></span></Tooltip>}
      <div className="home-funnel-stat"><strong>{total ? `${Math.round(item.count / total * 100)}%` : '—'}</strong><span>占全部投递</span></div>
    </div>)}</div>
  </section>
}

function UpcomingEvents({ apps, onOpen }: Pick<Props, 'apps' | 'onOpen'>) {
  const listRef = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  const now = new Date()
  const today = localDate(now)
  const upcoming = apps.filter(app => !isClosed(app) && app.status !== 'Offer').flatMap(app =>
    workflowFor(app).filter(stage => {
      const dueDate = scheduleDate(stage)
      return ['exam', 'interview'].includes(stage.kind)
        && ['未开始', '进行中'].includes(stage.status) && dueDate
        && `${dueDate}T${stage.endTime || stage.time || '23:59'}` >= `${today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }).map(stage => ({ app, stage, dueDate: scheduleDate(stage), id: `${app.id}-${stage.id}` }))
  ).sort((a, b) => `${a.dueDate} ${a.stage.time}`.localeCompare(`${b.dueDate} ${b.stage.time}`))
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let bottomTicks = 0
    const timer = window.setInterval(() => {
      const list = listRef.current
      if (!list || paused.current || list.contains(document.activeElement) || document.hidden || list.scrollHeight <= list.clientHeight) return
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 1) {
        if (++bottomTicks >= 40) { list.scrollTop = 0; bottomTicks = 0 }
      } else {
        bottomTicks = 0
        list.scrollTop += 1
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [])
  return <div ref={listRef} className="home-events" tabIndex={upcoming.length ? 0 : undefined} aria-label="即将到来的安排" onMouseEnter={() => { paused.current = true }} onMouseLeave={() => { paused.current = false }}>
    {upcoming.length ? upcoming.map(({ app, stage, dueDate, id }) => {
      const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
      return <button className="home-event" key={id} onClick={() => onOpen(app)}>
        <span className="home-event-company">{app.company}</span>
        <span className="home-event-stage">{stage.label}</span>
        <span className="home-event-time"><time>{scheduleLabel(stage)}</time><small>{days === 0 ? '今天截止' : `${days} 天后截止`}</small></span>
      </button>
    }) : <div className="home-no-events"><CalendarDays size={28} /><span>暂无即将到来的安排</span></div>}
  </div>
}

export default function Overview({ apps, onOpen, onView, onViewApplications, action }: Props) {
  const [source, setSource] = useState('')
  const now = new Date()
  const today = localDate(now)
  const scoped = source ? apps.filter(app => app.source === source) : apps
  const active = scoped.filter(app => !isClosed(app) && app.status !== 'Offer')
  const offers = apps.filter(app => !isClosed(app) && app.status === 'Offer')
  const stageNames = [...new Set([
    ...active.flatMap(app => workflowFor(app).map(stage => stage.label)),
    ...active.map(app => normalizedStatus(app)),
  ])]
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + index)
    const key = localDate(date)
    return { date: key, count: apps.filter(app => app.applied === key).length }
  })
  const chartMax = Math.max(4, Math.ceil(Math.max(...days.map(day => day.count)) / 4) * 4)
  const monthCount = apps.filter(app => app.applied.startsWith(today.slice(0, 7)) && app.applied <= today).length
  const metrics = [
    { label: '进行中', value: active.length, note: '当前活跃流程', icon: Send, tone: 'green' },
    { label: '总投递', value: apps.length, note: '秋招累计投递', icon: ClipboardList, tone: 'blue' },
    { label: '已结束', value: apps.filter(isClosed).length, note: '不合适 / 已淘汰', icon: CircleX, tone: 'coral' },
    { label: 'Offer', value: offers.length, note: '当前已获得', icon: Trophy, tone: 'amber' },
  ]
  return <section className="home-dashboard">
    <Heading className="home-heading" title="秋招总览" eyebrow={`${now.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase()} / ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`} meta="这里汇总了你秋招的整体进展，保持专注，继续加油！" action={action} />
    <div className="home-metrics">
      {metrics.map(({ label, value, note, icon: Icon, tone }) => <button key={label} className="home-metric" onClick={() => { if (onViewApplications) onViewApplications(label === '进行中' || label === 'Offer' || label === '已结束' ? label : ''); else onView('applications') }}>
        <span className={`home-metric-icon ${tone}`}><Icon size={29} strokeWidth={1.8} /></span>
        <span className="home-metric-text"><span>{label}</span><strong>{value}</strong><small>{note}</small></span>
        <ChevronRight size={18} />
      </button>)}
    </div>
    <div className="home-grid">
      <DistributionPanel active={active} stageNames={stageNames} onView={() => onView('applications')} />
      <FunnelPanel apps={scoped} allApps={apps} source={source} onSourceChange={setSource} />
      <section className="home-section home-lower">
        <header className="home-section-heading"><TrendingUp /><div><h2>投递趋势</h2><p>近 30 天的投递数量变化{apps.some(app => !app.applied) && ` · ${apps.filter(app => !app.applied).length} 条日期待补充`}</p></div><span className="home-month-total">本月共投递 <b>{monthCount}</b> 个岗位</span></header>
        <div className="home-chart" role="img" aria-label={`近30天投递趋势，共${days.reduce((sum, day) => sum + day.count, 0)}个岗位`}>
          <div className="home-chart-axis">{[4, 3, 2, 1, 0].map(value => <span key={value}>{chartMax * value / 4}</span>)}</div>
          <div className="home-chart-plot"><div className="home-chart-lines">{[0, 1, 2, 3, 4].map(value => <i key={value} />)}</div><div className="home-chart-bars">{days.map((day, index) => <div className="home-chart-column" key={day.date}><Tooltip className="home-chart-tooltip-anchor" contentClassName="home-chart-tooltip-content" label={`${day.date}：${day.count} 个投递`} tabIndex={0} content={<><time>{day.date}</time><strong>{day.count} 个投递</strong></>}><span className="home-chart-bar" style={{ height: `${day.count / chartMax * 100}%` }} /></Tooltip>{(index % 3 === 0 || index === 29) && <small>{day.date.slice(5).replace('-', '/')}</small>}</div>)}</div></div>
        </div>
      </section>
      <section className="home-section home-lower">
        <header className="home-section-heading"><CalendarDays /><div><h2>即将到来的节点</h2><p>下一个重要的面试或考试安排</p></div><button className="home-link" onClick={() => onView('applications')}>查看岗位<ChevronRight size={15} /></button></header>
        <UpcomingEvents apps={apps} onOpen={onOpen} />
      </section>
    </div>
  </section>
}
