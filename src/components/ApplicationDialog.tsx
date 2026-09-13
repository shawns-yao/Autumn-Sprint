import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, ExternalLink, FileText, MapPin, Plus, Save, Trash2, X } from 'lucide-react'
import { emptyStage, normalizedStatus, safeUrl, stageFields, stageKinds, stageResultOptions, withWorkflow, workflowFor, type Application, type Stage, type StageKey, type StageKind, type WorkflowStage } from '../model'
import { Button, CompanyMark, IconButton } from './Shared'
import { ApplicationProgress, ApplicationState } from './ApplicationProgress'
import Attachments from './Attachments'
import ReviewEditor from './ReviewEditor'
import StageReview from './StageReview'
import './applications.css'

const tabs = [['basic', '基本信息'], ['stages', '招聘流程'], ['materials', '资料附件'], ['interviews', '面试记录'], ['notes', '备注 / 复盘']] as const
type Tab = typeof tabs[number][0]
type Props = { app: Application; onClose: () => void; onSave: (app: Application) => Promise<Application> }

export default function ApplicationDialog({ app, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Application>(() => ({ ...app, workflow: workflowFor(app) }))
  const [baseline, setBaseline] = useState(() => JSON.stringify({ ...app, workflow: workflowFor(app) }))
  const [tab, setTab] = useState<Tab>('basic')
  const [stageKey, setStageKey] = useState<StageKey>(() => workflowFor(app).find(stage => ['已终止', '未通过', '已获 Offer'].includes(stage.status))?.id || workflowFor(app).find(stage => stage.label === normalizedStatus(app))?.id || workflowFor(app)[0]?.id || 'initialScreening')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [discard, setDiscard] = useState(false)
  const [stageTemplate, setStageTemplate] = useState('initialScreening')
  const [insertAfter, setInsertAfter] = useState('')
  const [customStageName, setCustomStageName] = useState('')
  const stageTemplateRef = useRef<HTMLSelectElement>(null)
  const dirty = JSON.stringify(draft) !== baseline
  const patch = (value: Partial<Application>) => { setDraft(current => ({ ...current, ...value })); setMessage(''); setError('') }
  const patchStage = (key: StageKey, value: Partial<Stage>) => {
    setDraft(current => {
      const workflow = (current.workflow || []).map(stage => stage.id === key ? { ...stage, ...value } : stage)
      return value.status ? withWorkflow(current, workflow) : { ...current, workflow }
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
        {tab === 'stages' && <section className="job-stages-tab">
          <div className="job-section-title"><h3>招聘流程</h3></div>
          <div className="job-stage-add">
            <label>新增阶段<select ref={stageTemplateRef} aria-label="新增阶段类型" value={stageTemplate} onChange={event => { setStageTemplate(event.target.value); if (event.target.value === 'initialScreening') setInsertAfter('') }}>{stageFields.map(([id, label]) => <option value={id} key={id}>{label}</option>)}<option value="custom">自定义阶段</option></select></label>
            {stageTemplate === 'custom' && <label>阶段名称<input aria-label="自定义阶段名称" maxLength={80} value={customStageName} onChange={event => setCustomStageName(event.target.value)} /></label>}
            <label>插入位置<select aria-label="阶段插入位置" value={insertAfter} onChange={event => setInsertAfter(event.target.value)}><option value="">投递之后</option>{(draft.workflow || []).map(stage => <option key={stage.id} value={stage.id}>{stage.label}之后</option>)}</select></label>
            <Button icon={Plus} disabled={(draft.workflow || []).length >= 40 || (stageTemplate === 'custom' && !customStageName.trim())} onClick={addStage}>添加阶段</Button>
          </div>
          <ApplicationProgress app={draft} selectedStage={stageKey} onSelectStage={setStageKey} onInsertAfter={(draft.workflow || []).length < 40 ? beginInsert : undefined} />
          {selectedWorkflowStage ? <StageForm key={selectedWorkflowStage.id} stage={selectedWorkflowStage} index={(draft.workflow || []).findIndex(item => item.id === selectedWorkflowStage.id)} total={(draft.workflow || []).length} onMetaChange={value => updateStageMeta(selectedWorkflowStage.id, value)} onMove={offset => moveStage(selectedWorkflowStage.id, offset)} onRemove={() => removeStage(selectedWorkflowStage.id)} onChange={value => patchStage(selectedWorkflowStage.id, value)} /> : <p className="job-muted-empty">暂无招聘阶段</p>}
        </section>}
        {tab === 'materials' && <Attachments app={draft} />}
        {tab === 'interviews' && <section className="job-records-tab"><div className="job-section-title"><h3>面试记录</h3>{interviewStagePicker}</div>{interviewStageKey ? <StageForm key={interviewStageKey} stage={interviewStages.find(stage => stage.id === interviewStageKey)!} index={-1} total={0} onMetaChange={() => undefined} onMove={() => undefined} onRemove={() => undefined} onChange={value => patchStage(interviewStageKey, value)} editableStatus={false} /> : <p className="job-muted-empty">招聘流程中暂无面试阶段</p>}</section>}
        {tab === 'notes' && <section className="job-notes-tab job-review-tab">{reviewStage ? <StageReview key={reviewStage.id} stage={reviewStage} stages={workflowStages} onSelect={setStageKey} onChange={value => patchStage(reviewStage.id, value)} /> : <p className="job-muted-empty">招聘流程中暂无可复盘阶段</p>}</section>}
      </div>
      <footer className="job-dialog-footer">
        {discard ? <><span role="alert">存在未保存的修改，确定放弃？</span><Button onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="danger" onClick={onClose}>放弃更改</Button></> : <><span role={error ? 'alert' : 'status'} className={error ? 'job-save-error' : 'job-save-status'}>{error || message || (dirty ? '有未保存的修改' : '')}</span><Button disabled={saving} onClick={requestClose}>关闭</Button><Button type="submit" variant="primary" icon={Save} disabled={saving || !dirty}>{saving ? '保存中…' : '保存更改'}</Button></>}
      </footer>
    </form>
  </dialog>
}

function StageForm({ stage, index, total, onMetaChange, onMove, onRemove, onChange, editableStatus = true }: { stage: WorkflowStage; index: number; total: number; onMetaChange: (value: Partial<Pick<WorkflowStage, 'label' | 'kind'>>) => void; onMove: (offset: number) => void; onRemove: () => void; onChange: (value: Partial<Stage>) => void; editableStatus?: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const current = stage
  return <div className="job-stage-form">{editableStatus && <div className="job-stage-editor-heading"><div className="job-stage-editor-fields"><label>阶段名称<input required maxLength={80} value={stage.label} onChange={event => onMetaChange({ label: event.target.value })} /></label><label>阶段类型<select value={stage.kind} onChange={event => onMetaChange({ kind: event.target.value as StageKind })}>{stageKinds.map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label></div><div className="job-stage-editor-actions"><IconButton icon={ArrowUp} label="上移阶段" variant="ghost" disabled={index <= 0} onClick={() => onMove(-1)} /><IconButton icon={ArrowDown} label="下移阶段" variant="ghost" disabled={index < 0 || index >= total - 1} onClick={() => onMove(1)} /><IconButton icon={Trash2} label="移除阶段" variant="ghost" onClick={() => setConfirmRemove(true)} /></div></div>}{confirmRemove && <div className="job-stage-remove-confirm" role="alert"><span>移除“{stage.label}”？已保存的阶段记录仍保留在历史中</span><Button size="small" onClick={() => setConfirmRemove(false)}>取消</Button><Button size="small" variant="danger" onClick={onRemove}>确认移除</Button></div>}<div className="job-section-title"><h4>{stage.label}</h4>{editableStatus && <select aria-label={`${stage.label}状态`} value={current.status} onChange={event => onChange({ status: event.target.value })}>{stageResultOptions.map(status => <option key={status}>{status}</option>)}</select>}</div><div className="job-form-grid">
    <label>日期<input type="date" value={current.date} onChange={event => onChange({ date: event.target.value })} /></label>
    <fieldset className="job-time-range-field"><legend>时间范围</legend><div className="job-time-range"><input aria-label="开始时间" type="time" value={current.time} onChange={event => onChange({ time: event.target.value })} /><span>至</span><input aria-label="结束时间" type="time" value={current.endTime} onChange={event => onChange({ endTime: event.target.value })} /></div></fieldset>
    <label>形式 / 地点<input value={current.location} onChange={event => onChange({ location: event.target.value })} /></label>
    <label>地址 / 链接<input value={current.link} onChange={event => onChange({ link: event.target.value })} /></label>
    <StageRecordField title="阶段记录" value={current} onChange={onChange} />
  </div></div>
}

function StageRecordField({ title, value, onChange }: { title: string; value: Stage; onChange: (value: Partial<Stage>) => void }) {
  return <div className="job-field-wide job-stage-record"><div className="stage-record-label">{title}</div><ReviewEditor value={value} onChange={onChange} label={title} compact /></div>
}
