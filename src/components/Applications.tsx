import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List, MapPin, X } from 'lucide-react'
import { currentWorkflowStage, lifecycle, localDate, matchesApplicationQuery, nextEvent, normalizedStatus, primaryApplications, relativeDate, scheduleLabel, stageFields, stageProgressLabel, workflowFor, type Application } from '../model'
import { Button, CompanyMark, Empty, Heading, IconButton, Pagination, SearchField } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import './applications.css'

type Props = {
  apps: Application[]; query: string; setQuery: (value: string) => void; selectedId?: string | number
  onOpen: (app: Application) => void; onCreate: () => void
  action?: ReactNode; initialStatus?: string
}
const citySeparators = /[/、,，|;；\s]+/
const normalizeCity = (value: string) => value.trim().replace(/\s+/g, '').replace(/(?:特别行政区|自治州|自治县|地区|盟|市)$/, '')
const citiesFor = (app: Application) => app.city.split(citySeparators).map(value => value.trim()).filter(Boolean)
const cityMatches = (app: Application, value: string) => {
  const query = normalizeCity(value)
  if (!query) return true
  return citiesFor(app).some(cityValue => {
    const city = normalizeCity(cityValue)
    return city === query || city.includes(query) || query.includes(city)
  })
}
type DateFilterValue = '' | 'today' | 'week' | 'month' | 'custom'
type DateRange = { start: string; end: string }
const dateFilterOptions: { value: DateFilterValue; label: string }[] = [
  { value: '', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '一周内' },
  { value: 'month', label: '一个月内' },
  { value: 'custom', label: '自定义时间' },
]
const emptyDateRange = (): DateRange => ({ start: '', end: '' })
const dateFromValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const shiftDate = (value: string, amount: number) => {
  const date = dateFromValue(value)
  date.setDate(date.getDate() + amount)
  return localDate(date)
}
const monthStartFor = (value: string) => {
  const date = dateFromValue(value || localDate())
  return new Date(date.getFullYear(), date.getMonth(), 1)
}
const calendarDays = (month: Date) => {
  const offset = (month.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index - offset + 1)
    return { value: localDate(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() }
  })
}
const matchesDateFilter = (value: string, filter: DateFilterValue, range: DateRange) => {
  if (!filter) return true
  if (!value) return false
  const today = localDate()
  if (filter === 'today') return value === today
  const start = filter === 'week' ? shiftDate(today, -6) : filter === 'month' ? shiftDate(today, -29) : range.start
  const end = filter === 'custom' ? range.end : today
  return Boolean(start && end) && value >= start && value <= end
}

export default function Applications({ apps, query, setQuery, selectedId, onOpen, action, initialStatus = '' }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [stage, setStage] = useState('')
  const [city, setCity] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('')
  const [customDateRange, setCustomDateRange] = useState<DateRange>(emptyDateRange)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(9)
  const [mode, setMode] = useState<'list' | 'grid'>('list')
  useEffect(() => { setStatus(initialStatus); setPage(1) }, [initialStatus])
  const cityOptions = useMemo(() => [...new Set(apps.flatMap(citiesFor).map(normalizeCity).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [apps])
  const dateFilterActive = dateFilter !== 'custom' || Boolean(customDateRange.start && customDateRange.end)
  const isRefined = Boolean(query.trim() || status || stage || city || (dateFilter && dateFilterActive))
  const filtered = useMemo(() => (isRefined ? apps : primaryApplications(apps)).filter(app =>
    matchesApplicationQuery(app, query)
    && (!status || (status === '已结束' ? lifecycle(app) !== '进行中' && lifecycle(app) !== 'Offer' : lifecycle(app) === status))
    && (!stage || normalizedStatus(app) === stage)
    && cityMatches(app, city)
    && (!dateFilter || !dateFilterActive || matchesDateFilter(app.applied, dateFilter, customDateRange)),
  ).sort((a, b) => {
    if (!a.applied || !b.applied) return Number(!a.applied) - Number(!b.applied)
    return b.applied.localeCompare(a.applied)
  }), [apps, query, status, stage, city, dateFilter, dateFilterActive, customDateRange, isRefined])
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / size)))
  const visible = filtered.slice((safePage - 1) * size, safePage * size)
  const change = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }
  const changeDateFilter = (value: DateFilterValue) => { setDateFilter(value); setPage(1) }
  const changeCustomDateRange = (range: DateRange) => { setCustomDateRange(range); setDateFilter('custom'); setPage(1) }
  const identity = (app: Application) => <div className="job-identity"><CompanyMark name={app.company} /><div><strong>{app.company}</strong><span title={app.title}>{app.title || '岗位名称待补充'}</span></div></div>

  return <section className="jobs-page">
    <Heading className="jobs-heading" title="岗位" meta="记录每一个机会，走好秋招的每一步。" action={action} />
    <div className="jobs-toolbar">
      <SearchField className="jobs-search" label="搜索岗位" placeholder="搜索公司、岗位、来源…" value={query} onChange={event => change(setQuery, event.target.value)} />
      <select aria-label="岗位状态筛选" value={status} onChange={event => change(setStatus, event.target.value)}><option value="">全部状态</option>{['进行中', '未通过', 'Offer', '已取消', '已结束'].map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="招聘阶段筛选" value={stage} onChange={event => change(setStage, event.target.value)}><option value="">全部阶段</option>{[...new Set([...stageFields.map(([, label]) => label), ...apps.flatMap(app => workflowFor(app).map(stage => stage.label))])].map(value => <option key={value}>{value}</option>)}</select>
      <CityFilter value={city} options={cityOptions} onChange={value => change(setCity, value)} />
      <DateFilter value={dateFilter} range={customDateRange} onChange={changeDateFilter} onRangeChange={changeCustomDateRange} />
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

function DateFilter({ value, range, onChange, onRangeChange }: { value: DateFilterValue; range: DateRange; onChange: (value: DateFilterValue) => void; onRangeChange: (range: DateRange) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const today = localDate()
  const [open, setOpen] = useState(false)
  const [draftRange, setDraftRange] = useState(range)
  const [viewMonth, setViewMonth] = useState(() => monthStartFor(range.start || today))
  const hasCompleteRange = Boolean(range.start && range.end)
  const triggerLabel = value === 'custom' ? '自定义时间' : dateFilterOptions.find(option => option.value === value)?.label || '投递时间'
  const triggerTitle = value === 'custom' && hasCompleteRange ? `${range.start} 至 ${range.end}` : triggerLabel

  useEffect(() => setDraftRange(range), [range.start, range.end])
  useEffect(() => {
    if (!open) return
    const handleOutsidePointer = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open])

  const openFilter = () => {
    if (value === 'custom') setViewMonth(monthStartFor(range.start || today))
    setOpen(true)
  }
  const selectPreset = (next: DateFilterValue) => {
    if (next === 'custom') {
      setViewMonth(monthStartFor(range.start || today))
      onChange(next)
      setOpen(true)
      return
    }
    onChange(next)
    setOpen(false)
  }
  const selectDate = (date: string) => {
    const next = !draftRange.start || draftRange.end
      ? { start: date, end: '' }
      : date < draftRange.start ? { start: date, end: draftRange.start } : { start: draftRange.start, end: date }
    setDraftRange(next)
    onRangeChange(next)
    if (next.start && next.end) setOpen(false)
  }
  const clear = () => {
    const next = emptyDateRange()
    setDraftRange(next)
    onRangeChange(next)
    onChange('')
    setOpen(false)
  }
  const selectToday = () => {
    onChange('today')
    setOpen(false)
  }
  const days = calendarDays(viewMonth)

  return <div ref={root} className={`jobs-date-filter ${open ? 'is-open' : ''}`}>
    <button type="button" className="jobs-date-filter-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label="投递时间筛选" title={triggerTitle} onClick={() => open ? setOpen(false) : openFilter()}><CalendarDays size={14} aria-hidden="true" /><span>{triggerLabel}</span><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <div className="jobs-date-filter-menu" role="dialog" aria-label="投递时间筛选">
      <div className="jobs-date-filter-presets">{dateFilterOptions.map(option => <button type="button" className={value === option.value ? 'selected' : ''} aria-pressed={value === option.value} key={option.value || 'all'} onClick={() => selectPreset(option.value)}>{option.label}</button>)}</div>
      {value === 'custom' && <div className="jobs-date-picker">
        <div className="jobs-date-picker-heading"><button type="button" aria-label="上个月" title="上个月" onClick={() => setViewMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} aria-hidden="true" /></button><strong>{viewMonth.getFullYear()}年{String(viewMonth.getMonth() + 1).padStart(2, '0')}月</strong><button type="button" aria-label="下个月" title="下个月" onClick={() => setViewMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} aria-hidden="true" /></button></div>
        <div className="jobs-date-picker-weekdays" aria-hidden="true">{['一', '二', '三', '四', '五', '六', '日'].map(label => <span key={label}>{label}</span>)}</div>
        <div className="jobs-date-picker-grid" role="grid" aria-label="选择投递日期">{days.map(day => {
          const selected = day.value === draftRange.start || day.value === draftRange.end
          const inRange = Boolean(draftRange.start && draftRange.end && day.value > draftRange.start && day.value < draftRange.end)
          return <button type="button" role="gridcell" className={`jobs-date-picker-day${day.inMonth ? '' : ' is-outside'}${selected ? ' is-selected' : ''}${inRange ? ' is-range' : ''}${day.value === today ? ' is-today' : ''}`} aria-label={day.value} aria-pressed={selected} key={day.value} onClick={() => selectDate(day.value)}>{day.day}</button>
        })}</div>
        <div className="jobs-date-picker-footer"><button type="button" onClick={clear}>清除</button><button type="button" onClick={selectToday}>今天</button></div>
      </div>}
    </div>}
  </div>
}

function CityFilter({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [activeIndex, setActiveIndex] = useState(0)
  const query = normalizeCity(inputValue)
  const filteredOptions = options.filter(option => !query || normalizeCity(option).includes(query))
  const menuOptions = query ? filteredOptions : ['', ...filteredOptions]

  useEffect(() => setInputValue(value), [value])
  useEffect(() => {
    if (!open) return
    const handleOutsidePointer = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open])
  useEffect(() => setActiveIndex(index => Math.min(index, Math.max(0, menuOptions.length - 1))), [menuOptions.length])

  const selectCity = (next: string) => { setInputValue(next); onChange(next); setOpen(false); setActiveIndex(0) }
  const openFilter = () => { setOpen(true); setActiveIndex(0) }
  const closeFilter = () => { setInputValue(value); setOpen(false) }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(index + 1, Math.max(0, menuOptions.length - 1))) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex(index => Math.max(0, index - 1)) }
    else if (event.key === 'Enter' && open && menuOptions[activeIndex] !== undefined) { event.preventDefault(); selectCity(menuOptions[activeIndex]) }
    else if (event.key === 'Escape') closeFilter()
  }

  return <div ref={root} className={`jobs-city-filter ${open ? 'is-open' : ''}`}>
    <input role="combobox" aria-label="城市筛选" aria-autocomplete="list" aria-expanded={open} aria-controls="jobs-city-options" aria-activedescendant={open && menuOptions[activeIndex] !== undefined ? `jobs-city-option-${activeIndex}` : undefined} placeholder="全部城市" value={inputValue} onFocus={() => { if (!open) openFilter() }} onClick={() => { if (!open) openFilter() }} onChange={event => { setInputValue(event.target.value); setOpen(true); setActiveIndex(0); onChange(event.target.value) }} onKeyDown={handleKeyDown} />
    {inputValue && <button type="button" className="jobs-city-filter-clear" aria-label="清除城市筛选" title="清除城市筛选" onMouseDown={event => event.preventDefault()} onClick={() => selectCity('')}><X size={14} aria-hidden="true" /></button>}
    <button type="button" className="jobs-city-filter-toggle" aria-label={open ? '收起城市筛选' : '展开城市筛选'} title={open ? '收起城市筛选' : '展开城市筛选'} onMouseDown={event => event.preventDefault()} onClick={() => open ? closeFilter() : openFilter()}><ChevronDown size={15} aria-hidden="true" /></button>
    {open && <div id="jobs-city-options" className="jobs-city-filter-options" role="listbox">
      {menuOptions.length ? menuOptions.map((option, index) => <div id={`jobs-city-option-${index}`} className="jobs-city-filter-option" role="option" aria-selected={option ? normalizeCity(value) === normalizeCity(option) : !value} data-active={index === activeIndex} key={option || 'all'} onMouseEnter={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => selectCity(option)}>{option || '全部城市'}</div>) : <p className="jobs-city-filter-empty">没有匹配城市</p>}
    </div>}
  </div>
}

function KeyDate({ app }: { app: Application }) {
  const event = nextEvent(app)
  const stage = currentWorkflowStage(app)
  const state = lifecycle(app)
  const ended = ['未通过', '已取消', 'Offer'].includes(state)
  const arrangement = stage ? scheduleLabel(stage) : ''
  return <div className="job-key-date"><div><CalendarDays size={14} /><span>{ended ? '无后续安排' : event ? scheduleLabel(event.stage) : arrangement || (stage ? stage.label : '暂无安排')}</span></div><small>{ended ? state === 'Offer' ? '已获得 Offer' : '已结束流程' : event ? `${stageProgressLabel({ label: event.label, status: event.stage.status })}${event.stage.location ? ` · ${event.stage.location}` : ''}` : stage ? stageProgressLabel(stage) : '等待通知'}</small>{event && !ended && <em>{relativeDate(event.date)}</em>}</div>
}

function TimeLabel({ app }: { app: Application }) {
  return <div className="job-time-label"><span>{app.applied || '—'}</span><small>{app.applied ? relativeDate(app.applied) : '时间待定'}</small></div>
}

function NextStep({ app }: { app: Application }) {
  const event = nextEvent(app)
  const stage = currentWorkflowStage(app)
  const state = lifecycle(app)
  const ended = ['未通过', '已取消', 'Offer'].includes(state)
  if (ended) return <div className="job-next-step"><strong>{state === 'Offer' ? '已获得 Offer' : '流程已结束'}</strong><small>{state}</small></div>
  if (!event && stage) return <div className="job-next-step"><strong>{stageProgressLabel(stage)}</strong><small>{scheduleLabel(stage) || (stage.status === '进行中' ? '待处理' : '待安排')}</small></div>
  if (!event) return <div className="job-next-step"><strong>暂无安排</strong><small>等待通知</small></div>
  return <div className="job-next-step"><strong>{stageProgressLabel({ label: event.label, status: event.stage.status })}</strong><small>{[scheduleLabel(event.stage), event.stage.location].filter(Boolean).join(' · ') || '待补充安排'}</small></div>
}
