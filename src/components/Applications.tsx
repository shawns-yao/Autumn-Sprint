import { useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, LayoutGrid, List, MapPin } from 'lucide-react'
import { currentWorkflowStage, lifecycle, nextEvent, normalizedStatus, primaryApplications, relativeDate, stageFields, stageProgressLabel, timeRange, workflowFor, type Application } from '../model'
import { Button, CompanyMark, Empty, Heading, IconButton, Pagination, SearchField } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import './applications.css'

type Props = {
  apps: Application[]; query: string; setQuery: (value: string) => void; selectedId?: string | number
  onOpen: (app: Application) => void; onCreate: () => void
  action?: ReactNode
}
const citiesFor = (app: Application) => app.city.split(/[/、,，]/).map(value => value.trim()).filter(Boolean)

export default function Applications({ apps, query, setQuery, selectedId, onOpen, action }: Props) {
  const [status, setStatus] = useState('')
  const [stage, setStage] = useState('')
  const [city, setCity] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(9)
  const [mode, setMode] = useState<'list' | 'grid'>('list')
  const isRefined = Boolean(query.trim() || status || stage || city)
  const filtered = useMemo(() => (isRefined ? apps : primaryApplications(apps)).filter(app =>
    `${app.company} ${app.title} ${app.source} ${app.status}`.toLowerCase().includes(query.trim().toLowerCase())
    && (!status || lifecycle(app) === status)
    && (!stage || normalizedStatus(app) === stage)
    && (!city || citiesFor(app).includes(city)),
  ).sort((a, b) => {
    if (!a.applied || !b.applied) return Number(!a.applied) - Number(!b.applied)
    return sort === 'oldest' ? a.applied.localeCompare(b.applied) : b.applied.localeCompare(a.applied)
  }), [apps, query, status, stage, city, sort, isRefined])
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / size)))
  const visible = filtered.slice((safePage - 1) * size, safePage * size)
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }
  const identity = (app: Application) => <div className="job-identity"><CompanyMark name={app.company} /><div><strong>{app.company}</strong><span title={app.title}>{app.title || '岗位名称待补充'}</span></div></div>

  return <section className="jobs-page">
    <Heading className="jobs-heading" title="岗位" meta="记录每一个机会，走好秋招的每一步。" action={action} />
    <div className="jobs-toolbar">
      <SearchField className="jobs-search" label="搜索岗位" placeholder="搜索公司、岗位、来源…" value={query} onChange={event => change(setQuery, event.target.value)} />
      <select aria-label="岗位状态筛选" value={status} onChange={event => change(setStatus, event.target.value)}><option value="">全部状态</option>{['进行中', '已终止', '已结束', 'Offer'].map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="招聘阶段筛选" value={stage} onChange={event => change(setStage, event.target.value)}><option value="">全部阶段</option>{[...new Set([...stageFields.map(([, label]) => label), ...apps.flatMap(app => workflowFor(app).map(stage => stage.label))])].map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="城市筛选" value={city} onChange={event => change(setCity, event.target.value)}><option value="">全部城市</option>{[...new Set(apps.flatMap(citiesFor))].sort().map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="岗位排序" value={sort} onChange={event => change(setSort, event.target.value)}><option value="newest">投递时间：最新</option><option value="oldest">投递时间：最早</option></select>
      <span className="jobs-count">共 {filtered.length} {isRefined ? '个岗位' : '家公司'}</span>
      <div className="jobs-view-switch" role="group" aria-label="岗位展示方式">{([['list', List, '列表视图'], ['grid', LayoutGrid, '网格视图']] as const).map(([value, Icon, label]) => <IconButton key={value} label={label} icon={Icon} variant={mode === value ? 'selected' : 'secondary'} aria-pressed={mode === value} onClick={() => setMode(value)} />)}</div>
    </div>
    {mode === 'list' ? <div className="jobs-table-scroll"><table className="jobs-table">
      <colgroup><col className="job-col-company" /><col className="job-col-city" /><col className="job-col-status" /><col className="job-col-progress" /><col className="job-col-date" /><col className="job-col-next" /><col className="job-col-actions" /></colgroup>
      <thead><tr>{['公司 / 岗位', '地点', '状态', '流程进度', '投递时间', '下一步安排', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{visible.map(app => <tr key={app.id} className={app.id === selectedId ? 'selected' : ''}>
        <td>{identity(app)}</td><td><span className="job-city"><MapPin size={14} />{app.city || '待补充'}</span></td>
        <td><ApplicationState app={app} /></td><td><ApplicationProgress app={app} compact /></td><td><TimeLabel app={app} /></td><td><NextStep app={app} /></td>
        <td><Button size="small" className="job-detail-button" aria-label={`查看${app.company}详情`} onClick={() => onOpen(app)}>查看详情</Button></td>
      </tr>)}</tbody>
    </table>{!visible.length && <Empty>没有符合条件的岗位</Empty>}</div> : <div className="jobs-grid">
      {visible.map(app => <article className="job-grid-item" key={app.id}>
        <header className="job-grid-heading">{identity(app)}<div className="job-grid-applied"><span><CalendarDays size={13} aria-hidden="true" />投递时间</span>{app.applied ? <time dateTime={app.applied}>{app.applied}</time> : <span className="job-grid-date-empty">待填写</span>}</div></header>
        <div className="job-grid-meta"><span className="job-city"><MapPin size={14} />{app.city || '待补充'}</span><ApplicationState app={app} /></div><ApplicationProgress app={app} compact /><KeyDate app={app} /><Button size="small" className="job-detail-button" aria-label={`查看${app.company}详情`} onClick={() => onOpen(app)}>查看详情</Button>
      </article>)}
      {!visible.length && <Empty>没有符合条件的岗位</Empty>}
    </div>}
    <Pagination page={safePage} size={size} total={filtered.length} onPage={setPage} onSize={value => { setSize(value); setPage(1) }} />
  </section>
}

function KeyDate({ app }: { app: Application }) {
  const event = nextEvent(app)
  const stage = currentWorkflowStage(app)
  const state = lifecycle(app)
  const ended = ['已终止', '已结束', 'Offer'].includes(state)
  return <div className="job-key-date"><div><CalendarDays size={14} /><span>{ended ? '无后续安排' : event ? `${event.date} ${timeRange(event.stage)}` : stage ? stage.label : '暂无安排'}</span></div><small>{ended ? state === 'Offer' ? '已获得 Offer' : '已结束流程' : event ? `${stageProgressLabel({ label: event.label, status: event.stage.status })}${event.stage.location ? ` · ${event.stage.location}` : ''}` : stage ? stageProgressLabel(stage) : '等待通知'}</small>{event && !ended && <em>{relativeDate(event.date)}</em>}</div>
}

function TimeLabel({ app }: { app: Application }) {
  return <div className="job-time-label"><span>{app.applied || '—'}</span><small>{app.applied ? relativeDate(app.applied) : '时间待定'}</small></div>
}

function NextStep({ app }: { app: Application }) {
  const event = nextEvent(app)
  const stage = currentWorkflowStage(app)
  const state = lifecycle(app)
  const ended = ['已终止', '已结束', 'Offer'].includes(state)
  if (ended) return <div className="job-next-step"><strong>{state === 'Offer' ? '已获得 Offer' : '流程已结束'}</strong><small>{state}</small></div>
  if (!event && stage) return <div className="job-next-step"><strong>{stageProgressLabel(stage)}</strong><small>{stage.status === '进行中' ? '待处理' : '待安排'}</small></div>
  if (!event) return <div className="job-next-step"><strong>暂无安排</strong><small>等待通知</small></div>
  return <div className="job-next-step"><strong>{stageProgressLabel({ label: event.label, status: event.stage.status })}</strong><small>{[[event.date, timeRange(event.stage)].filter(Boolean).join(' '), event.stage.location].filter(Boolean).join(' · ') || '待补充安排'}</small></div>
}
