import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, ExternalLink, Eye, FileText, MapPin, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { companyApplications, compareVolunteers, emptyStage, normalizedCompany, normalizedStatus, safeUrl, stageFields, stageKinds, stageResultOptions, withWorkflow, workflowFor, type Application, type Stage, type StageKey, type StageKind, type WorkflowStage } from '../model'
import { Button, CompanyMark, IconButton } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import ReviewEditor from './ReviewEditor'
import StageReview from './StageReview'
import './applications.css'

const tabs = [['basic', '基本信息'], ['stages', '招聘流程'], ['interviews', '面试记录'], ['review', '复盘']] as const
type Tab = typeof tabs[number][0]
type Props = { app: Application; apps: Application[]; initialTab?: Tab; onSelectJob: (app: Application) => void; onCreateJob: (company?: string, initialTab?: Tab) => void; onDelete: (app: Application) => Promise<void>; onDeleteCompany: (company: string) => Promise<void>; onClose: () => void; onSave: (app: Application, companyOrder?: string[]) => Promise<Application> }
type DiscardAction = { kind: 'close' } | { kind: 'select'; app: Application } | { kind: 'create'; company: string; initialTab: Tab } | { kind: 'delete'; app: Application } | { kind: 'delete-company'; company: string }

export default function ApplicationDialog({ app, apps, initialTab = 'basic', onSelectJob, onCreateJob, onDelete, onDeleteCompany, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Application>(() => ({ ...app, workflow: workflowFor(app) }))
  const [baseline, setBaseline] = useState(() => JSON.stringify({ ...app, workflow: workflowFor(app) }))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [editingWorkflow, setEditingWorkflow] = useState(false)
  const [stageKey, setStageKey] = useState<StageKey>(() => workflowFor(app).find(stage => ['已终止', '未通过', '已获 Offer'].includes(stage.status))?.id || workflowFor(app).find(stage => stage.label === normalizedStatus(app))?.id || workflowFor(app)[0]?.id || 'initialScreening')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [discard, setDiscard] = useState(false)
  const [discardAction, setDiscardAction] = useState<DiscardAction | null>(null)
  const [stageTemplate, setStageTemplate] = useState('initialScreening')
  const [insertAfter, setInsertAfter] = useState('')
  const [customStageName, setCustomStageName] = useState('')
  const stageTemplateRef = useRef<HTMLSelectElement>(null)
  const initialJobs = companyApplications(apps, app.company)
  if (!initialJobs.some(job => String(job.id) === String(app.id))) initialJobs.push(app)
  const initialOrder = initialJobs.sort(compareVolunteers).map(job => String(job.id))
  const [jobOrder, setJobOrder] = useState<string[]>(() => initialOrder)
  const baselineJobOrder = useRef(initialOrder)
  const previousCompany = useRef(normalizedCompany(app.company))
  const companyKey = normalizedCompany(draft.company)
  const companyJobs = useMemo(() => {
    const jobs = companyApplications(apps, draft.company).map(job => String(job.id) === String(draft.id) ? draft : job)
    if (!jobs.some(job => String(job.id) === String(draft.id))) jobs.push(draft)
    return jobs
  }, [apps, draft])
  useEffect(() => {
    const ids = companyJobs.map(job => String(job.id))
    setJobOrder(current => {
      const known = new Set(ids)
      const next = [...current.filter(id => known.has(id)), ...ids.filter(id => !current.includes(id))]
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next
    })
    if (previousCompany.current !== companyKey) {
      baselineJobOrder.current = ids
      previousCompany.current = companyKey
    }
  }, [companyJobs, companyKey])
  const orderedCompanyJobs = useMemo(() => {
    const byId = new Map(companyJobs.map(job => [String(job.id), job]))
    const ordered = jobOrder.map(id => byId.get(id)).filter((job): job is Application => Boolean(job))
    return [...ordered, ...companyJobs.filter(job => !jobOrder.includes(String(job.id))).sort(compareVolunteers)]
  }, [companyJobs, jobOrder])
  const orderDirty = baselineJobOrder.current.length !== jobOrder.length || baselineJobOrder.current.some((id, index) => id !== jobOrder[index])
  const dirty = JSON.stringify(draft) !== baseline || orderDirty
  const patch = (value: Partial<Application>) => { setDraft(current => ({ ...current, ...value })); setMessage(''); setError('') }
  const patchStage = (key: StageKey, value: Partial<Stage>) => {
    setDraft(current => {
      const workflow = (current.workflow || []).map(stage => stage.id === key ? { ...stage, ...value } : stage)
      return value.status ? withWorkflow(current, workflow) : { ...current, workflow }
    })
    setMessage(''); setError('')
  }
  const requestClose = () => { if (!saving) { if (dirty) { setDiscardAction({ kind: 'close' }); setDiscard(true) } else onClose() } }
  const selectJob = (next: Application) => {
    if (next.id === app.id) return
    if (dirty) { setDiscardAction({ kind: 'select', app: next }); setDiscard(true) } else onSelectJob(next)
  }
  const createJob = () => {
    const company = draft.company.trim() || app.company.trim()
    if (dirty) { setDiscardAction({ kind: 'create', company, initialTab: 'stages' }); setDiscard(true) } else onCreateJob(company, 'stages')
  }
  const deleteJob = async (target = draft) => {
    if (!target.updatedAt) { onClose(); return }
    if (!window.confirm(`删除岗位“${target.title || '岗位名称待填写'}”？只删除当前岗位，不删除公司和其他岗位。`)) return
    setSaving(true); setError(''); setMessage('')
    try { await onDelete(target) }
    catch (error) { setError(error instanceof Error ? error.message : '删除失败，请重试。'); setSaving(false) }
  }
  const deleteCompany = async (company = app.company) => {
    if (!draft.updatedAt) { onClose(); return }
    if (!window.confirm(`删除公司“${company}”？该公司的全部岗位都会删除，历史记录仍保留。`)) return
    setSaving(true); setError(''); setMessage('')
    try { await onDeleteCompany(company) }
    catch (error) { setError(error instanceof Error ? error.message : '删除公司失败，请重试。'); setSaving(false) }
  }
  const requestDelete = () => {
    if (dirty) { setDiscardAction({ kind: 'delete', app: draft }); setDiscard(true) }
    else void deleteJob()
  }
  const requestDeleteCompany = () => {
    const company = app.company.trim()
    if (dirty) { setDiscardAction({ kind: 'delete-company', company }); setDiscard(true) }
    else void deleteCompany(company)
  }
  const abandonChanges = () => {
    const action = discardAction
    setDiscard(false); setDiscardAction(null)
    if (!action || action.kind === 'close') onClose()
    else if (action.kind === 'select') onSelectJob(action.app)
    else if (action.kind === 'create') onCreateJob(action.company, action.initialTab)
    else if (action.kind === 'delete-company') void deleteCompany(action.company)
    else void deleteJob(action.app)
  }
  const website = safeUrl(draft.website)
  const moveJob = (sourceId: string | number, targetId: string | number, before: boolean) => {
    setJobOrder(current => {
      const source = String(sourceId); const target = String(targetId)
      const sourceIndex = current.indexOf(source); const targetIndex = current.indexOf(target)
      if (sourceIndex < 0 || targetIndex < 0 || source === target) return current
      const next = [...current]; next.splice(sourceIndex, 1)
      const insertAt = next.indexOf(target) + (before ? 0 : 1)
      next.splice(insertAt, 0, source)
      return next
    })
    setMessage(''); setError('')
  }
  const sidebar = <JobSidebar jobs={orderedCompanyJobs} currentId={draft.id} company={draft.company} onCompanyChange={company => patch({ company })} onSelect={selectJob} onCreate={createJob} onMove={moveJob} onDelete={requestDelete} canDelete={Boolean(draft.updatedAt)} disabled={saving} />

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
      const saved = await onSave(draft, orderDirty ? orderedCompanyJobs.map(job => String(job.id)) : undefined)
      setDraft(saved); setBaseline(JSON.stringify(saved)); baselineJobOrder.current = orderedCompanyJobs.map(job => String(job.id)); setMessage('已保存'); setEditingWorkflow(false); setDiscardAction(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试。')
    } finally { setSaving(false) }
  }
  const workflowStages = (draft.workflow || []).filter(stage => stage.status !== '跳过')
  const selectedWorkflowStage = (draft.workflow || []).find(stage => stage.id === stageKey) || draft.workflow?.[0]
  const reviewStage = workflowStages.find(stage => stage.id === stageKey) || workflowStages[0]
  const interviewStages = workflowStages.filter(stage => stage.kind === 'interview')
  const interviewStageKey = interviewStages.find(stage => stage.id === stageKey)?.id || interviewStages[0]?.id
  const interviewStagePicker = interviewStageKey ? <label className="job-stage-picker">面试阶段<select aria-label="面试阶段" value={interviewStageKey} onChange={event => setStageKey(event.target.value)}>{interviewStages.map(stage => <option value={stage.id} key={stage.id}>{stage.label}</option>)}</select></label> : null
  const addStage = () => {
    if ((draft.workflow || []).length >= 40) return
    const id = crypto.randomUUID()
    const template = stageFields.find(([key]) => key === stageTemplate)
    const name = template?.[1] || customStageName.trim()
    if (!name) { setError('请填写自定义阶段名称。'); return }
    if (['建立档案', '已投递', '投递', 'Offer', '拒绝', '终止'].includes(name)) { setError('投递是默认起点，请填写实际的招聘阶段名称。'); return }
    const workflow = draft.workflow || []
    let label: string = name; let suffix = 2
    while (workflow.some(stage => stage.label === label)) {
      const ending = ` ${suffix++}`
      label = `${name.slice(0, 80 - ending.length)}${ending}`
    }
    const stage = { ...emptyStage(), id, label, kind: stageTemplate === 'initialScreening' ? 'screening' : ['evaluation', 'written'].includes(stageTemplate) ? 'exam' : template ? 'interview' : 'other' as StageKind }
    const index = insertAfter ? workflow.findIndex(item => item.id === insertAfter) + 1 : 0
    const nextWorkflow = [...workflow.slice(0, index), stage, ...workflow.slice(index)]
    setDraft(current => ({ ...current, workflow: nextWorkflow }))
    setStageKey(id); setInsertAfter(id); setCustomStageName(''); setTab('stages'); setMessage(''); setError('')
  }
  const beginInsert = (id: string) => { setInsertAfter(id); stageTemplateRef.current?.focus() }
  const updateStageMeta = (id: string, value: Partial<Pick<WorkflowStage, 'label' | 'kind'>>) => {
    setDraft(current => ({ ...current, status: value.label && current.currentStageId === id && !['Offer', '拒绝', '终止'].includes(current.status) ? value.label : current.status, workflow: (current.workflow || []).map(stage => stage.id === id ? { ...stage, ...value } : stage) }))
    setMessage(''); setError('')
  }
  const moveStage = (id: string, offset: number) => { setMessage(''); setError(''); setDraft(current => {
    const workflow = [...(current.workflow || [])]
    const index = workflow.findIndex(stage => stage.id === id); const nextIndex = index + offset
    if (index < 0 || nextIndex < 0 || nextIndex >= workflow.length) return current
    ;[workflow[index], workflow[nextIndex]] = [workflow[nextIndex], workflow[index]]
    return { ...current, workflow }
  }) }
  const removeStage = (id: string) => {
    const index = (draft.workflow || []).findIndex(stage => stage.id === id)
    const workflow = (draft.workflow || []).filter(stage => stage.id !== id)
    const next = workflow.find(stage => stage.id === stageKey) || workflow[Math.min(index, workflow.length - 1)]
    if (insertAfter === id) setInsertAfter(workflow[index - 1]?.id || '')
    setStageKey(next?.id || ''); setDraft(withWorkflow(draft, workflow)); setMessage(''); setError('')
  }

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
        {tab === 'basic' && <div className="job-tab-layout">
          {sidebar}
          <section className="job-basic-section">
            <div className="job-section-title"><h3>基本信息</h3></div>
            <div className="job-form-grid">
              <label>公司名称<input value={draft.company} onChange={event => patch({ company: event.target.value })} /></label>
              <label>岗位名称<input value={draft.title} onChange={event => patch({ title: event.target.value })} /></label>
              <label>工作城市<input value={draft.city} onChange={event => patch({ city: event.target.value })} /></label>
              <label>投递渠道<input value={draft.source} onChange={event => patch({ source: event.target.value })} /></label>
              <label>投递时间<input type="date" value={draft.applied} onChange={event => patch({ applied: event.target.value })} /></label>
              <label className="job-field-wide">岗位链接<div className="job-link-field"><input value={draft.website} onChange={event => patch({ website: event.target.value })} />{website && <a href={website} target="_blank" rel="noreferrer" title="打开岗位链接" aria-label="打开岗位链接"><ExternalLink size={15} /></a>}</div></label>
            </div>
          </section>
        </div>}
        {tab === 'stages' && <div className="job-tab-layout">
          {sidebar}
          <section className="job-tab-content job-workflow-main">
              <div className="job-section-title"><h3>{editingWorkflow ? '招聘流程编辑' : '招聘流程'}</h3><Button icon={editingWorkflow ? Eye : Pencil} aria-controls="job-workflow-details" onClick={() => setEditingWorkflow(current => !current)}>{editingWorkflow ? '返回查看' : '修改流程'}</Button></div>
              <ApplicationProgress app={draft} selectedStage={selectedWorkflowStage?.id} onSelectStage={setStageKey} onInsertAfter={editingWorkflow && (draft.workflow || []).length < 40 ? beginInsert : undefined} />
              {editingWorkflow && <div className="job-stage-add">
                <label>新增阶段<select ref={stageTemplateRef} aria-label="新增阶段类型" value={stageTemplate} onChange={event => setStageTemplate(event.target.value)}>{stageFields.map(([id, label]) => <option value={id} key={id}>{label}</option>)}<option value="custom">自定义阶段</option></select></label>
                {stageTemplate === 'custom' && <label>阶段名称<input aria-label="自定义阶段名称" maxLength={80} value={customStageName} onChange={event => setCustomStageName(event.target.value)} /></label>}
                <label>插入位置<select aria-label="阶段插入位置" value={insertAfter} onChange={event => setInsertAfter(event.target.value)}><option value="">投递之后</option>{(draft.workflow || []).map(stage => <option key={stage.id} value={stage.id}>{stage.label}之后</option>)}</select></label>
                <Button icon={Plus} disabled={(draft.workflow || []).length >= 40 || (stageTemplate === 'custom' && !customStageName.trim())} onClick={addStage}>添加阶段</Button>
              </div>}
              <div id="job-workflow-details">
                {selectedWorkflowStage ? editingWorkflow
                  ? <StageForm key={selectedWorkflowStage.id} stage={selectedWorkflowStage} index={(draft.workflow || []).findIndex(item => item.id === selectedWorkflowStage.id)} total={(draft.workflow || []).length} onMetaChange={value => updateStageMeta(selectedWorkflowStage.id, value)} onMove={offset => moveStage(selectedWorkflowStage.id, offset)} onRemove={() => removeStage(selectedWorkflowStage.id)} onChange={value => patchStage(selectedWorkflowStage.id, value)} showRecord={false} />
                  : null
                  : <p className="job-muted-empty">暂无招聘阶段</p>}
              </div>
              {!editingWorkflow && <section className="job-jd-panel" aria-labelledby="job-jd-title"><div className="job-section-title"><h4 id="job-jd-title"><FileText size={16} aria-hidden="true" />岗位 JD</h4></div><textarea className="job-jd" aria-label="岗位 JD" value={draft.jd} onChange={event => patch({ jd: event.target.value })} placeholder="暂无岗位描述" /></section>}
          </section>
        </div>}
        {tab === 'interviews' && <div className="job-tab-layout">{sidebar}<section className="job-records-tab"><div className="job-section-title"><h3>面试记录</h3>{interviewStagePicker}</div>{interviewStageKey ? <StageForm key={interviewStageKey} stage={interviewStages.find(stage => stage.id === interviewStageKey)!} index={-1} total={0} onMetaChange={() => undefined} onMove={() => undefined} onRemove={() => undefined} onChange={value => patchStage(interviewStageKey, value)} editableStatus={false} /> : <p className="job-muted-empty">招聘流程中暂无面试阶段</p>}</section></div>}
        {tab === 'review' && <div className="job-tab-layout">{sidebar}<section className="job-notes-tab job-review-tab">{reviewStage ? <StageReview key={reviewStage.id} stage={reviewStage} stages={workflowStages} onSelect={setStageKey} onChange={value => patchStage(reviewStage.id, value)} /> : <p className="job-muted-empty">招聘流程中暂无可复盘阶段</p>}</section></div>}
      </div>
      <footer className="job-dialog-footer">
        {discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => { setDiscard(false); setDiscardAction(null) }}>继续编辑</Button><Button variant="danger" onClick={abandonChanges}>{discardAction?.kind === 'select' ? '切换岗位' : discardAction?.kind === 'create' ? '新增岗位' : discardAction?.kind === 'delete' ? '放弃修改并删除' : discardAction?.kind === 'delete-company' ? '放弃修改并删除公司' : '放弃更改'}</Button></> : <><Button icon={Trash2} variant="danger" disabled={saving || !draft.updatedAt} onClick={requestDeleteCompany}>删除公司</Button><span role={error ? 'alert' : 'status'} className={error ? 'job-save-error' : 'job-save-status'}>{error || message || (dirty ? '有未保存的修改' : '')}</span><Button type="submit" variant="primary" icon={Save} disabled={saving || !dirty}>{saving ? '保存中…' : '保存更改'}</Button></>}
      </footer>
    </form>
  </dialog>
}

function StageForm({ stage, index, total, onMetaChange, onMove, onRemove, onChange, editableStatus = true, showRecord = true }: { stage: WorkflowStage; index: number; total: number; onMetaChange: (value: Partial<Pick<WorkflowStage, 'label' | 'kind'>>) => void; onMove: (offset: number) => void; onRemove: () => void; onChange: (value: Partial<Stage>) => void; editableStatus?: boolean; showRecord?: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  return <div className="job-stage-form">
    {editableStatus ? <div className="job-stage-editor-heading">
      <div className="job-stage-editor-fields">
        <label>阶段名称<input required maxLength={80} value={stage.label} onChange={event => onMetaChange({ label: event.target.value })} /></label>
        <label>阶段类型<select value={stage.kind} onChange={event => onMetaChange({ kind: event.target.value as StageKind })}>{stageKinds.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label>
        <label>阶段状态<select aria-label={`${stage.label}状态`} value={stage.status} onChange={event => onChange({ status: event.target.value })}>{stageResultOptions.map(status => <option key={status}>{status}</option>)}</select></label>
      </div>
      <div className="job-stage-editor-actions">
        <IconButton icon={ArrowUp} label="上移阶段" variant="ghost" disabled={index <= 0} onClick={() => onMove(-1)} />
        <IconButton icon={ArrowDown} label="下移阶段" variant="ghost" disabled={index < 0 || index >= total - 1} onClick={() => onMove(1)} />
        <IconButton icon={Trash2} label="移除阶段" variant="ghost" onClick={() => setConfirmRemove(true)} />
      </div>
    </div> : <div className="job-section-title"><h4>{stage.label}</h4></div>}
    {confirmRemove && <div className="job-stage-remove-confirm" role="alert"><span>移除“{stage.label}”？已保存的阶段记录仍保留在历史中</span><Button size="small" onClick={() => setConfirmRemove(false)}>取消</Button><Button size="small" variant="danger" onClick={onRemove}>确认移除</Button></div>}
    <fieldset className="job-stage-schedule">
      {editableStatus && <legend>安排信息</legend>}
      <div className="job-form-grid">
        <label>日期<input type="date" value={stage.date} onChange={event => onChange({ date: event.target.value })} /></label>
        <fieldset className="job-time-range-field"><legend>时间范围</legend><div className="job-time-range"><input aria-label="开始时间" type="time" value={stage.time} onChange={event => onChange({ time: event.target.value })} /><span>至</span><input aria-label="结束时间" type="time" value={stage.endTime} onChange={event => onChange({ endTime: event.target.value })} /></div></fieldset>
        <label>形式 / 地点<input value={stage.location} onChange={event => onChange({ location: event.target.value })} /></label>
        <label>地址 / 链接<input value={stage.link} onChange={event => onChange({ link: event.target.value })} /></label>
      </div>
    </fieldset>
    {showRecord && <StageRecordField title="阶段记录" value={stage} onChange={onChange} />}
  </div>
}

function StageRecordField({ title, value, onChange }: { title: string; value: Stage; onChange: (value: Partial<Stage>) => void }) {
  return <div className="job-field-wide job-stage-record"><div className="stage-record-label">{title}</div><ReviewEditor value={value} onChange={onChange} label={title} compact /></div>
}

function JobSidebar({ jobs, currentId, company, onCompanyChange, onSelect, onCreate, onMove, onDelete, canDelete, disabled }: { jobs: Application[]; currentId: string | number; company: string; onCompanyChange: (value: string) => void; onSelect: (app: Application) => void; onCreate: () => void; onMove: (sourceId: string | number, targetId: string | number, before: boolean) => void; onDelete: () => void; canDelete: boolean; disabled: boolean }) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const finishDrag = () => { setDraggingId(null); setDropTarget(null) }
  return <aside className="job-workflow-sidebar" aria-label="同公司岗位">
    <header className="job-workflow-sidebar-heading"><div><span>投递岗位</span><strong>{jobs.length}</strong></div><Button icon={Plus} size="small" disabled={disabled} onClick={onCreate}>新增岗位</Button></header>
    {!canDelete && <label className="job-workflow-sidebar-company">公司名称<input value={company} onChange={event => onCompanyChange(event.target.value)} placeholder="填写公司名称" disabled={disabled} /></label>}
    <div className="job-workflow-job-list">
      {jobs.map((job, index) => <div className={`job-workflow-job-row ${job.id === currentId ? 'current' : ''} ${draggingId === String(job.id) ? 'dragging' : ''} ${dropTarget?.id === String(job.id) ? dropTarget.before ? 'drop-before' : 'drop-after' : ''}`} key={job.id}
        draggable={!disabled}
        onDragOver={event => { if (!draggingId || draggingId === String(job.id)) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setDropTarget({ id: String(job.id), before: event.clientY < rect.top + rect.height / 2 }) }}
        onDrop={event => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain') || draggingId; if (sourceId) onMove(sourceId, job.id, dropTarget?.id === String(job.id) ? dropTarget.before : event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2); finishDrag() }}
        onDragStart={event => { if (event.target instanceof Element && event.target.closest('.job-workflow-job-delete')) { event.preventDefault(); return } setDraggingId(String(job.id)); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(job.id)) }}
        onDragEnd={finishDrag}>
        <button type="button" className="job-workflow-job" aria-current={job.id === currentId ? 'page' : undefined} onClick={() => onSelect(job)} disabled={disabled}
          onKeyDown={event => { if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return; const target = jobs[index + (event.key === 'ArrowUp' ? -1 : 1)]; if (!target) return; event.preventDefault(); onMove(job.id, target.id, event.key === 'ArrowUp') }}>
          <span className="job-workflow-job-top"><strong>{job.title || '岗位名称待填写'}</strong></span>
          <small>{[job.city, job.applied].filter(Boolean).join(' · ') || '岗位信息待补充'}</small>
        </button>
        <div className="job-workflow-job-side">
          <ApplicationState app={job} />
          {job.id === currentId && <IconButton icon={X} label="删除当前岗位" variant="danger" size="small" className="job-workflow-job-delete" disabled={disabled || !canDelete} onClick={event => { event.stopPropagation(); onDelete() }} />}
        </div>
      </div>)}
    </div>
  </aside>
}
