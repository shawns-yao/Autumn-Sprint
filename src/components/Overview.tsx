import { useState, type ReactNode } from 'react'
import { BarChart3, CalendarDays, ChevronRight, ClipboardList, Filter, Send, TrendingUp, Trophy, CircleX } from 'lucide-react'
import { eventsFor, isClosed, localDate, normalizedStatus, recruitmentFunnel, timeRange, workflowFor, type Application, type View } from '../model'
import { Heading } from './Shared'
import './overview.css'

type Props = {
  apps: Application[]
  onOpen: (app: Application) => void
  onView: (view: View) => void
  action?: ReactNode
}

const colors = ['#3e78d8', '#61a5dd', '#3da58c', '#68a8a0', '#d99a3c', '#df7668', '#b87943', '#cb637f']

export default function Overview({ apps, onOpen, onView, action }: Props) {
  const [company, setCompany] = useState('')
  const now = new Date()
  const today = localDate(now)
  const active = apps.filter(app => !isClosed(app) && app.status !== 'Offer')
  const offers = apps.filter(app => !isClosed(app) && app.status === 'Offer')
  const stageNames = ['已投递', ...new Set(active.flatMap(app => workflowFor(app).map(stage => stage.label)))]
  const distribution = stageNames.map(stage => ({
    stage,
    count: active.filter(app => normalizedStatus(app) === stage).length,
  }))
  const maxCount = Math.max(1, ...distribution.map(item => item.count))
  const scoped = company ? apps.filter(app => app.company === company) : apps
  const funnel = recruitmentFunnel(scoped)
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + index)
    const key = localDate(date)
    return { date: key, count: apps.filter(app => app.applied === key).length }
  })
  const chartMax = Math.max(4, Math.ceil(Math.max(...days.map(day => day.count)) / 4) * 4)
  const monthCount = apps.filter(app => app.applied.startsWith(today.slice(0, 7)) && app.applied <= today).length
  const upcoming = eventsFor(active).filter(event => !event.done
    && `${event.date}T${event.time || '23:59'}` >= `${today}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`).slice(0, 4)
  const metrics = [
    { label: '进行中', value: active.length, note: '当前活跃流程', icon: Send, tone: 'green' },
    { label: '总投递', value: apps.length, note: '秋招累计投递', icon: ClipboardList, tone: 'blue' },
    { label: '已结束', value: apps.filter(isClosed).length, note: '不合适 / 已淘汰', icon: CircleX, tone: 'coral' },
    { label: 'Offer', value: offers.length, note: '当前已获得', icon: Trophy, tone: 'amber' },
  ]
  return <section className="home-dashboard">
    <Heading className="home-heading" title="秋招总览" eyebrow={`${now.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase()} / ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`} meta="这里汇总了你秋招的整体进展，保持专注，继续加油！" action={action} />
    <div className="home-metrics">
      {metrics.map(({ label, value, note, icon: Icon, tone }) => <button key={label} className="home-metric" onClick={() => onView('applications')}>
        <span className={`home-metric-icon ${tone}`}><Icon size={29} strokeWidth={1.8} /></span>
        <span className="home-metric-text"><span>{label}</span><strong>{value}</strong><small>{note}</small></span>
        <ChevronRight size={18} />
      </button>)}
    </div>
    <div className="home-grid">
      <section className="home-section">
        <header className="home-section-heading"><BarChart3 /><div><h2>当前流程分布</h2><p>在进行中的 {active.length} 个流程中，各阶段的分布情况</p></div><button className="home-link" onClick={() => onView('applications')}>查看全部<ChevronRight size={15} /></button></header>
        <div className="home-distribution">
          {distribution.map(({ stage, count }, index) => <div className="home-stage" key={stage}>
            <span title={stage}>{stage}</span><div className="home-stage-track" role="meter" aria-label={stage} aria-valuemin={0} aria-valuemax={maxCount} aria-valuenow={count}><span style={{ width: `${count / maxCount * 100}%`, background: colors[index % colors.length] }} /></div><strong>{count}</strong>
          </div>)}
        </div>
      </section>
      <section className="home-section">
        <header className="home-section-heading"><Filter /><div><h2>招聘漏斗</h2><p>已记录岗位 · 共 {scoped.length} 个</p></div><select aria-label="流程统计公司" value={company} onChange={event => setCompany(event.target.value)}><option value="">全部岗位</option>{[...new Set(apps.map(app => app.company))].map(name => <option key={name} value={name}>{name}</option>)}</select></header>
        <div className="home-funnel" aria-label="四阶段招聘记录漏斗">
          {funnel.map((item, index) => <div className="home-funnel-row" key={item.label}>
            <div className="home-funnel-shape" style={{ width: `${100 - index * 16}%`, background: item.color, color: index === 0 ? '#fff' : '#173454' }}>
              <span>{item.label}</span><strong>{item.count}</strong>
            </div>
            <div className="home-funnel-stat"><strong>{scoped.length ? `${Math.round(item.count / scoped.length * 100)}%` : '—'}</strong><span>占全部投递</span></div>
          </div>)}
        </div>
      </section>
      <section className="home-section home-lower">
        <header className="home-section-heading"><TrendingUp /><div><h2>投递趋势</h2><p>近 30 天的投递数量变化{apps.some(app => !app.applied) && ` · ${apps.filter(app => !app.applied).length} 条日期待补充`}</p></div><span className="home-month-total">本月共投递 <b>{monthCount}</b> 个岗位</span></header>
        <div className="home-chart" role="img" aria-label={`近30天投递趋势，共${days.reduce((sum, day) => sum + day.count, 0)}个岗位`}>
          <div className="home-chart-axis">{[4, 3, 2, 1, 0].map(value => <span key={value}>{chartMax * value / 4}</span>)}</div>
          <div className="home-chart-plot"><div className="home-chart-lines">{[0, 1, 2, 3, 4].map(value => <i key={value} />)}</div><div className="home-chart-bars">{days.map((day, index) => <div className="home-chart-column" key={day.date} title={`${day.date}：${day.count} 个投递`}><span style={{ height: `${day.count / chartMax * 100}%` }} />{(index % 3 === 0 || index === 29) && <small>{day.date.slice(5).replace('-', '/')}</small>}</div>)}</div></div>
        </div>
      </section>
      <section className="home-section home-lower">
        <header className="home-section-heading"><CalendarDays /><div><h2>即将到来的节点</h2><p>下一个重要的面试或考试安排</p></div><button className="home-link" onClick={() => onView('applications')}>查看岗位<ChevronRight size={15} /></button></header>
        <div className="home-events">{upcoming.length ? upcoming.map(event => <button className="home-event" key={event.id} onClick={() => onOpen(event.app)}>
          <strong>{event.date.slice(5).replace('-', ' / ')}</strong><span className="home-weekday">{new Date(`${event.date}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</span><i style={{ background: colors[Math.max(0, stageNames.indexOf(event.label)) % colors.length] }} /><span className="home-event-title"><b>{event.app.company} · {event.label}</b>{(event.time || event.endTime || event.stage.location) && <small>{[timeRange(event.stage), event.stage.location].filter(Boolean).join(' · ')}</small>}</span><ChevronRight size={17} />
        </button>) : <div className="home-no-events"><CalendarDays size={28} /><span>暂无即将到来的安排</span></div>}</div>
      </section>
    </div>
  </section>
}
