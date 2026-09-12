import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CalendarDays, ExternalLink, FileText, MapPin, Save, X } from 'lucide-react'
import { getStage, normalizedStatus, safeUrl, stageFields, type Application, type Stage, type StageKey, type Status } from '../model'
import { Button, CompanyMark, IconButton } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import Attachments from './Attachments'
import './applications.css'

const tabs = [['basic', '基本信息'], ['stages', '招聘流程'], ['materials', '资料附件'], ['interviews', '面试记录'], ['notes', '备注 / 复盘']] as const
const stageResultOptions = ['未开始', '已安排', '已完成', '未通过', '已终止', '已获 Offer', '跳过', '已取消']
type Tab = typeof tabs[number][0]
type Props = { app: Application; onClose: () => void; onSave: (app: Application) => Promise<Application> }

export default function ApplicationDialog({ app, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(app)
  const [baseline, setBaseline] = useState(JSON.stringify(app))
  const [tab, setTab] = useState<Tab>('basic')
  const [stageKey, setStageKey] = useState<StageKey>(() => stageFields.find(([key]) => ['已终止', '未通过', '已获 Offer'].includes(getStage(app, key).status))?.[0] || stageFields.find(([, label]) => label === normalizedStatus(app))?.[0] || 'evaluation')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [discard, setDiscard] = useState(false)
  const dirty = JSON.stringify(draft) !== baseline
  const patch = (value: Partial<Application>) => { setDraft(current => ({ ...current, ...value })); setMessage(''); setError('') }
  const patchStage = (key: StageKey, value: Partial<Stage>) => {
    setDraft(current => {
      const previous = getStage(current, key)
      const next = { ...previous, ...value }
      const updated = { ...current, [key]: next }
      const label = stageFields.find(([field]) => field === key)![1]
      if (value.status === '已安排') return { ...updated, status: label, terminated: false }
      if (value.status === '未通过') return { ...updated, status: '拒绝' as Status, terminated: false }
      if (value.status === '已终止') return { ...updated, status: '终止' as Status, terminated: true }
      if (value.status === '已获 Offer') return { ...updated, status: 'Offer' as Status, terminated: false }
      const clearedOutcome = value.status && ['未通过', '已终止', '已获 Offer'].includes(previous.status)
      const removedCurrentStage = value.status && normalizedStatus(current) === label && ['未开始', '跳过', '已取消'].includes(value.status)
      if (clearedOutcome || removedCurrentStage) {
        const stages = stageFields.map(([field, stageLabel]) => ({ label: stageLabel, value: getStage(updated, field) }))
        const outcome = stages.find(item => item.value.status === '已终止')
          ? { status: '终止' as Status, terminated: true }
          : stages.find(item => item.value.status === '未通过')
            ? { status: '拒绝' as Status, terminated: false }
            : stages.find(item => item.value.status === '已获 Offer')
              ? { status: 'Offer' as Status, terminated: false }
              : null
        if (outcome) return { ...updated, ...outcome }
        const active = stages.find(item => item.value.status === '已安排') || [...stages].reverse().find(item => item.value.status === '已完成')
        return { ...updated, status: (active?.label || '已投递') as Status, terminated: false }
      }
      return updated
    })
    setMessage(''); setError('')
  }
  const requestClose = () => { if (!saving) { if (dirty) setDiscard(true); else onClose() } }
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
    if (!draft.company.trim()) { setError('请填写公司名称。'); setTab('basic'); return }
    if (draft.website && !safeUrl(draft.website)) { setError('岗位链接需要使用有效的 http 或 https 地址。'); setTab('basic'); return }
    setSaving(true); setError(''); setMessage('')
    try {
      const saved = await onSave(draft)
      setDraft(saved); setBaseline(JSON.stringify(saved)); setMessage('已保存')
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试。')
    } finally { setSaving(false) }
  }
  const editStage = (key: StageKey) => { setStageKey(key); setTab('stages') }
  const workflowStages = stageFields.filter(([key]) => getStage(draft, key).status !== '跳过')
  const reviewStageKey = workflowStages.find(([key]) => key === stageKey)?.[0] || workflowStages[0]?.[0]
  const reviewStagePicker = reviewStageKey ? <label className="job-stage-picker">招聘阶段<select aria-label="招聘阶段" value={reviewStageKey} onChange={event => setStageKey(event.target.value as StageKey)}>{workflowStages.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label> : null
  const interviewStages = workflowStages.filter(([, label]) => ['AI 面试', '一面', '二面', '三面', 'HR 面'].includes(label))
  const interviewStageKey = interviewStages.find(([key]) => key === stageKey)?.[0] || interviewStages[0]?.[0]
  const interviewStagePicker = interviewStageKey ? <label className="job-stage-picker">面试阶段<select aria-label="面试阶段" value={interviewStageKey} onChange={event => setStageKey(event.target.value as StageKey)}>{interviewStages.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label> : null

  return <dialog ref={dialog} className="job-dialog" aria-labelledby="job-dialog-title" onCancel={event => { event.preventDefault(); requestClose() }} onClick={event => { if (event.target === event.currentTarget) requestClose() }}>
    <form className="job-dialog-shell" onSubmit={submit} aria-busy={saving}>
      <header className="job-dialog-header">
        <CompanyMark name={draft.company || '新岗位'} />
        <div className="job-dialog-identity"><div className="job-dialog-title-line"><h2 id="job-dialog-title">{draft.company || '新建岗位'}</h2><ApplicationState app={draft} /></div>
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
        {tab === 'basic' && <div className="job-dialog-single">
          <section className="job-basic-section">
            <div className="job-section-title"><h3>基本信息</h3></div>
            <div className="job-form-grid">
              <label>公司名称<input value={draft.company} onChange={event => patch({ company: event.target.value })} /></label>
              <label>岗位名称<input value={draft.title} onChange={event => patch({ title: event.target.value })} /></label>
              <label>工作城市<input value={draft.city} onChange={event => patch({ city: event.target.value })} /></label>
              <label>投递渠道<input value={draft.source} onChange={event => patch({ source: event.target.value })} /></label>
              <label>投递时间<input type="date" value={draft.applied} onChange={event => patch({ applied: event.target.value })} /></label>
              <label>岗位状态<input value={normalizedStatus(draft)} readOnly aria-readonly="true" /></label>
              <label className="job-field-wide">岗位链接<div className="job-link-field"><input value={draft.website} onChange={event => patch({ website: event.target.value })} />{website && <a href={website} target="_blank" rel="noreferrer" title="打开岗位链接" aria-label="打开岗位链接"><ExternalLink size={15} /></a>}</div></label>
            </div>
            <h3 className="job-jd-heading">岗位 JD</h3><textarea className="job-jd" aria-label="岗位 JD" value={draft.jd} onChange={event => patch({ jd: event.target.value })} placeholder="暂无岗位描述" />
          </section>
        </div>}
        {tab === 'stages' && <section className="job-stages-tab"><div className="job-section-title"><h3>招聘流程</h3></div><ApplicationProgress app={draft} selectedStage={stageKey} onSelectStage={setStageKey} /><StageForm title={stageFields.find(([key]) => key === stageKey)![1]} value={getStage(draft, stageKey)} onChange={value => patchStage(stageKey, value)} /></section>}
        {tab === 'materials' && <Attachments app={draft} />}
        {tab === 'interviews' && <section className="job-records-tab"><div className="job-section-title"><h3>面试记录</h3>{interviewStagePicker}</div>{interviewStageKey ? <StageForm title={stageFields.find(([key]) => key === interviewStageKey)![1]} value={getStage(draft, interviewStageKey)} onChange={value => patchStage(interviewStageKey, value)} editableStatus={false} /> : <p className="job-muted-empty">招聘流程中暂无面试阶段</p>}</section>}
        {tab === 'notes' && <section className="job-notes-tab job-review-tab"><div className="job-section-title"><h3>备注 / 复盘</h3>{reviewStagePicker}</div>{reviewStageKey ? <StageRecordField title={stageFields.find(([key]) => key === reviewStageKey)![1]} value={getStage(draft, reviewStageKey)} onChange={value => patchStage(reviewStageKey, value)} review /> : <p className="job-muted-empty">招聘流程中暂无可复盘阶段</p>}</section>}
      </div>
      <footer className="job-dialog-footer">
        {discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃更改</Button></> : <><span role={error ? 'alert' : 'status'} className={error ? 'job-save-error' : 'job-save-status'}>{error || message || (dirty ? '有未保存的修改' : '')}</span><Button disabled={saving} onClick={requestClose}>关闭</Button><Button type="submit" variant="primary" icon={Save} disabled={saving || !dirty}>{saving ? '保存中…' : '保存更改'}</Button></>}
      </footer>
    </form>
  </dialog>
}

function StageForm({ title, value, onChange, editableStatus = true }: { title: string; value: Stage; onChange: (value: Partial<Stage>) => void; editableStatus?: boolean }) {
  return <div className="job-stage-form"><div className="job-section-title"><h4>{title}</h4>{editableStatus && <select aria-label={`${title}状态`} value={value.status} onChange={event => onChange({ status: event.target.value })}>{stageResultOptions.map(status => <option key={status}>{status}</option>)}</select>}</div><div className="job-form-grid">
    <label>日期<input type="date" value={value.date} onChange={event => onChange({ date: event.target.value })} /></label>
    <label>时间<input type="time" value={value.time} onChange={event => onChange({ time: event.target.value })} /></label>
    <label>形式 / 地点<input value={value.location} onChange={event => onChange({ location: event.target.value })} /></label>
    <label>地址 / 链接<input value={value.link} onChange={event => onChange({ link: event.target.value })} /></label>
    <StageRecordField title="阶段记录" value={value} onChange={onChange} />
  </div></div>
}

function StageRecordField({ title, value, onChange, review = false }: { title: string; value: Stage; onChange: (value: Partial<Stage>) => void; review?: boolean }) {
  const content = [value.requirements, value.notes].filter(Boolean).join(value.requirements && value.notes ? '\n\n' : '')
  return <label className={`${review ? 'job-review-editor' : 'job-field-wide job-stage-record'}`}>{title}<textarea value={content} onChange={event => onChange({ requirements: '', notes: event.target.value })} placeholder="记录安排要求、阶段结果、问题和后续准备" /></label>
}
