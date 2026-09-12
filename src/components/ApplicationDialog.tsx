import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, Check, ChevronRight, Clock3, ExternalLink, FileText, MapPin, Pencil, Plus, Save, X } from 'lucide-react'
import { eventsFor, getStage, isClosed, nextEvent, normalizedStatus, priorityLabel, safeUrl, stageFields, statuses, type Application, type Stage, type StageKey, type Status } from '../model'
import { Button, CompanyMark, IconButton } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import Attachments from './Attachments'
import './applications.css'

const tabs = [['basic', '基本信息'], ['stages', '招聘流程'], ['materials', '资料附件'], ['interviews', '面试记录'], ['notes', '备注 / 复盘']] as const
type Tab = typeof tabs[number][0]
type Props = { app: Application; onClose: () => void; onSave: (app: Application) => Promise<Application> }

export default function ApplicationDialog({ app, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(app)
  const [baseline, setBaseline] = useState(JSON.stringify(app))
  const [tab, setTab] = useState<Tab>('basic')
  const [editing, setEditing] = useState(!app.company)
  const [stageKey, setStageKey] = useState<StageKey>(() => stageFields.find(([, label]) => label === normalizedStatus(app))?.[0] || 'evaluation')
  const [descending, setDescending] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [discard, setDiscard] = useState(false)
  const dirty = JSON.stringify(draft) !== baseline
  const patch = (value: Partial<Application>) => { setDraft(current => ({ ...current, ...value })); setMessage(''); setError('') }
  const patchStage = (key: StageKey, value: Partial<Stage>) => {
    setDraft(current => ({ ...current, [key]: { ...getStage(current, key), ...value },
      ...(value.status === '已安排' ? { status: stageFields.find(([field]) => field === key)![1], terminated: false } : {}),
      ...(value.status === '未通过' ? { status: '拒绝' as Status, terminated: false } : {}),
    }))
    setMessage(''); setError('')
  }
  const requestClose = () => { if (!saving) { if (dirty) setDiscard(true); else onClose() } }
  const event = nextEvent(draft)
  const history = eventsFor([draft]).filter(item => item.done).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) * (descending ? -1 : 1))
  const currentKey = stageFields.find(([, label]) => label === normalizedStatus(draft))?.[0]
  const spotlightKey = currentKey || (event ? stageFields.find(([, label]) => label === event.label)?.[0] : undefined)
  const spotlight = spotlightKey ? getStage(draft, spotlightKey) : undefined
  const website = safeUrl(draft.website)

  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => { element?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !dirty) return
    if (!draft.company.trim()) { setError('请填写公司名称。'); setTab('basic'); setEditing(true); return }
    if (draft.website && !safeUrl(draft.website)) { setError('岗位链接需要使用有效的 http 或 https 地址。'); setTab('basic'); setEditing(true); return }
    setSaving(true); setError(''); setMessage('')
    try {
      const saved = await onSave(draft)
      setDraft(saved); setBaseline(JSON.stringify(saved)); setMessage('已保存'); setEditing(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试。')
    } finally { setSaving(false) }
  }
  const editStage = (key: StageKey) => { setStageKey(key); setTab('stages') }
  const recordedInterviews = stageFields.filter(([key], index) => index >= 2 && (getStage(draft, key).status !== '未开始' || getStage(draft, key).notes || getStage(draft, key).date))

  return <dialog ref={dialog} className="job-dialog" aria-labelledby="job-dialog-title" onCancel={event => { event.preventDefault(); requestClose() }} onClick={event => { if (event.target === event.currentTarget) requestClose() }}>
    <form className="job-dialog-shell" onSubmit={submit} aria-busy={saving}>
      <header className="job-dialog-header">
        <CompanyMark name={draft.company || '新岗位'} />
        <div className="job-dialog-identity"><div className="job-dialog-title-line"><h2 id="job-dialog-title">{draft.company || '新建岗位'}</h2><span className="job-source-tag">{draft.source || '来源待补充'}</span><span className="job-priority-tag">{priorityLabel(draft.priority)}</span><ApplicationState app={draft} /></div>
          <h3>{draft.title || '岗位名称待填写'}</h3><div className="job-dialog-meta"><span><MapPin size={14} />{draft.city || '城市待补充'}</span><span><FileText size={14} />{draft.source || '投递来源待补充'}</span><span><CalendarDays size={14} />{draft.applied || '日期待补充'}</span>{website && <a href={website} target="_blank" rel="noreferrer">{website}<ExternalLink size={13} /></a>}</div>
        </div>
        <IconButton icon={X} label="关闭岗位详情" variant="ghost" className="job-dialog-close" onClick={requestClose} disabled={saving} />
      </header>
      <div className="job-dialog-tabs" role="tablist" aria-label="岗位详情分类">{tabs.map(([key, label], index) => <button type="button" key={key} id={`job-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="job-tab-panel" tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          setTab(tabs[next][0]); document.getElementById(`job-tab-${tabs[next][0]}`)?.focus()
        }
      }}>{label}</button>)}</div>
      <div className="job-dialog-body" id="job-tab-panel" role="tabpanel" aria-labelledby={`job-tab-${tab}`} inert={saving}>
        {tab === 'basic' && <div className="job-dialog-columns">
          <section className="job-basic-section">
            <div className="job-section-title"><h3>基本信息</h3><Button size="small" icon={Pencil} onClick={() => setEditing(!editing)}>{editing ? '结束编辑' : '编辑'}</Button></div>
            <div className="job-form-grid">
              <label>公司名称<input value={draft.company} readOnly={!editing} onChange={event => patch({ company: event.target.value })} /></label>
              <label>岗位名称<input value={draft.title} readOnly={!editing} onChange={event => patch({ title: event.target.value })} /></label>
              <label>简历版本<input value={draft.resume} readOnly={!editing} onChange={event => patch({ resume: event.target.value })} placeholder="未关联简历" /></label>
              <label>工作城市<input value={draft.city} readOnly={!editing} onChange={event => patch({ city: event.target.value })} /></label>
              <label>投递渠道<select value={draft.source} disabled={!editing} onChange={event => patch({ source: event.target.value })}>{[...new Set([draft.source, '官网', '校招', '内推', '直招', '其他'])].map(value => <option key={value} value={value}>{value || '请选择'}</option>)}</select></label>
              <label>投递时间<input type="date" value={draft.applied} readOnly={!editing} onChange={event => patch({ applied: event.target.value })} /></label>
              <label>当前阶段<select value={draft.status} disabled={!editing} onChange={event => patch({ status: event.target.value as Status, terminated: event.target.value === '终止' })}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
              <label>优先级<select value={draft.priority} disabled={!editing} onChange={event => patch({ priority: event.target.value })}>{['高', '中', '低'].map(value => <option value={value} key={value}>{priorityLabel(value)}</option>)}</select></label>
              <div className="job-field-wide"><span className="job-field-label">标签</span><div className="job-tags"><span>{draft.source || '来源待补充'}</span><span className="priority-high">{priorityLabel(draft.priority)}</span></div></div>
              <label className="job-field-wide">岗位链接<div className="job-link-field"><input value={draft.website} readOnly={!editing} onChange={event => patch({ website: event.target.value })} />{website && <a href={website} target="_blank" rel="noreferrer" title="打开岗位链接" aria-label="打开岗位链接"><ExternalLink size={15} /></a>}</div></label>
            </div>
            <h3 className="job-jd-heading">岗位 JD</h3><textarea className="job-jd" aria-label="岗位 JD" value={draft.jd} readOnly={!editing} onChange={event => patch({ jd: event.target.value })} placeholder="暂无岗位描述" />
          </section>
          <div className="job-process-column">
            <section className="job-process-section"><div className="job-section-title"><h3>流程进度</h3><button type="button" className="job-outline" onClick={() => editStage(currentKey || 'firstInterview')}><Plus size={14} />添加流程</button></div><ApplicationProgress app={draft} />
              {spotlight && spotlightKey ? <div className="job-current-stage"><div className="job-section-title"><h4><i />{stageFields.find(([key]) => key === spotlightKey)?.[1]}</h4><span className="job-source-tag">{spotlight.status}</span></div><div className="job-stage-meta"><span><CalendarDays size={13} />{spotlight.date || '日期待安排'}</span><span><Clock3 size={13} />{spotlight.time || '时间待定'}</span><span><MapPin size={13} />{spotlight.location || '地点待定'}</span></div><div className="job-note-label"><span>要求 / 注意事项</span><button type="button" onClick={() => editStage(spotlightKey)}>编辑</button></div><p>{spotlight.requirements || '暂无注意事项'}</p></div> : <p className="job-muted-empty">{isClosed(draft) ? '该岗位流程已结束' : '暂无已安排的流程'}</p>}
            </section>
            <section className="job-history-section"><div className="job-section-title"><h3>历史流程</h3><label className="job-sort-history"><input type="checkbox" checked={descending} onChange={event => setDescending(event.target.checked)} />按时间倒序</label></div><div className="job-history-list">{history.map(item => <button type="button" key={item.id} onClick={() => {
              const key = stageFields.find(([, label]) => label === item.label)?.[0]
              if (key) editStage(key); else { setEditing(true); setTab('basic') }
            }}><span className={`job-history-icon ${item.stage.status === '未通过' ? 'failed' : ''}`}>{item.stage.status === '未通过' ? <X size={11} /> : <Check size={11} />}</span><strong>{item.label}</strong><span>{item.date} {item.time}</span><ChevronRight size={15} /></button>)}{!history.length && <p className="job-muted-empty">暂无历史流程</p>}</div></section>
            <section className="job-quick-section"><h3>快速操作</h3><div><button type="button" className="job-outline" onClick={() => editStage('firstInterview')}><CalendarDays size={14} />添加面试</button><button type="button" className="job-outline" onClick={() => setTab('materials')}><FileText size={14} />查看资料</button><button type="button" className="job-end-button" disabled={isClosed(draft)} onClick={() => patch({ terminated: true, status: '终止' })}>结束该岗位</button></div></section>
          </div>
        </div>}
        {tab === 'stages' && <section className="job-stages-tab"><div className="job-section-title"><h3>招聘流程</h3><label className="job-stage-picker">编辑阶段<select aria-label="编辑招聘阶段" value={stageKey} onChange={event => setStageKey(event.target.value as StageKey)}>{stageFields.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div><ApplicationProgress app={draft} /><StageForm title={stageFields.find(([key]) => key === stageKey)![1]} value={getStage(draft, stageKey)} onChange={value => patchStage(stageKey, value)} /><button type="button" className="job-outline" disabled={isClosed(draft)} onClick={() => patch({ status: stageFields.find(([key]) => key === stageKey)![1] })}>设为当前阶段</button></section>}
        {tab === 'materials' && <Attachments app={draft} />}
        {tab === 'interviews' && <section className="job-records-tab"><div className="job-section-title"><h3>面试记录</h3><button type="button" className="job-outline" onClick={() => editStage('firstInterview')}><Plus size={14} />添加面试</button></div>{recordedInterviews.length ? recordedInterviews.map(([key, label]) => { const value = getStage(draft, key); return <article className="job-interview-record" key={key}><div className="job-section-title"><h4>{label}</h4><span>{value.status}</span><button type="button" className="job-outline" onClick={() => editStage(key)}><Pencil size={13} />编辑</button></div><p className="job-stage-meta">{[value.date, value.time, value.location].filter(Boolean).join(' · ') || '时间地点待补充'}</p><p className="job-record-notes">{value.notes || '暂无面试记录'}</p></article> }) : <p className="job-muted-empty">暂无面试记录</p>}</section>}
        {tab === 'notes' && <section className="job-notes-tab"><h3>备注 / 复盘</h3>{stageFields.map(([key, label]) => <label key={key}>{label}<textarea value={getStage(draft, key).notes} onChange={event => patchStage(key, { notes: event.target.value })} placeholder="记录结果、问题和后续准备" /></label>)}</section>}
      </div>
      <footer className="job-dialog-footer">
        {discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃更改</Button></> : <><span role={error ? 'alert' : 'status'} className={error ? 'job-save-error' : 'job-save-status'}>{error || message || (dirty ? '有未保存的修改' : '')}</span><Button disabled={saving} onClick={requestClose}>关闭</Button><Button type="submit" variant="primary" icon={Save} disabled={saving || !dirty}>{saving ? '保存中…' : '保存更改'}</Button></>}
      </footer>
    </form>
  </dialog>
}

function StageForm({ title, value, onChange }: { title: string; value: Stage; onChange: (value: Partial<Stage>) => void }) {
  return <div className="job-stage-form"><div className="job-section-title"><h4>{title}</h4><select aria-label={`${title}状态`} value={value.status} onChange={event => onChange({ status: event.target.value })}>{['未开始', '已安排', '已完成', '未通过', '跳过', '已取消'].map(status => <option key={status}>{status}</option>)}</select></div><div className="job-form-grid">
    <label>日期<input type="date" value={value.date} onChange={event => onChange({ date: event.target.value })} /></label>
    <label>时间<input type="time" value={value.time} onChange={event => onChange({ time: event.target.value })} /></label>
    <label>形式 / 地点<input value={value.location} onChange={event => onChange({ location: event.target.value })} /></label>
    <label>地址 / 链接<input value={value.link} onChange={event => onChange({ link: event.target.value })} /></label>
    <label className="job-field-wide">要求 / 注意事项<textarea value={value.requirements} onChange={event => onChange({ requirements: event.target.value })} /></label>
    <label className="job-field-wide">结果 / 备注<textarea value={value.notes} onChange={event => onChange({ notes: event.target.value })} /></label>
  </div></div>
}
