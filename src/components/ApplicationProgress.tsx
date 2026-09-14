import { Check, Plus, X } from 'lucide-react'
import { isClosed, lifecycle, normalizedStatus, workflowFor, type Application, type StageKey } from '../model'
import { Badge } from './Shared'

export function ApplicationState({ app }: { app: Application }) {
  const label = lifecycle(app)
  const tone = label === '已取消' ? 'muted' : label === '未通过' ? 'red' : label === 'Offer' ? 'green' : 'blue'
  return <Badge tone={tone === 'muted' ? 'gray' : tone} className="job-state">{label}</Badge>
}

type ProgressProps = { app: Application; compact?: boolean; selectedStage?: StageKey; onSelectStage?: (key: StageKey) => void; onInsertAfter?: (key: StageKey) => void }
type ProgressStep = { key?: StageKey; label: string; date: string; state: string }

export function ApplicationProgress({ app, compact = false, selectedStage, onSelectStage, onInsertAfter }: ProgressProps) {
  const status = normalizedStatus(app)
  const fields = workflowFor(app).filter(stage => !compact || !['AI 面试', '三面'].includes(stage.label) || stage.status !== '未开始' || status === stage.label)
  const steps: ProgressStep[] = [
    ...fields.map(stage => ({ key: stage.id, label: stage.label, date: stage.date, state: stage.status })),
    { label: 'Offer', date: '', state: status === 'Offer' ? 'Offer' : '未开始' },
  ]
  return <ol className={`job-progress ${compact ? 'compact' : ''} ${onInsertAfter ? 'editable' : ''}`} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(${compact ? '46px' : '100px'}, 1fr))` }} aria-label="招聘流程进度">
    {steps.map(step => {
      const failed = step.state === '未通过'
      const cancelled = ['已取消', '跳过'].includes(step.state)
      const complete = ['已完成', 'Offer'].includes(step.state)
      const current = (step.key ? step.key === app.currentStageId || step.label === status : step.label === status) && !isClosed(app) && !complete
      const content = <><span className="job-step-dot">{failed || cancelled ? <X size={10} /> : complete ? <Check size={11} /> : current ? <i /> : null}</span><span className="job-step-label">{step.label}</span><time>{step.date ? step.date.slice(5) : '—'}</time></>
      const key = step.key
      return <li key={key || step.label} className={`${complete ? 'complete' : ''} ${current ? 'current' : ''} ${failed ? 'failed' : ''} ${cancelled ? 'cancelled' : ''} ${key === selectedStage ? 'selected' : ''}`} title={`${step.label}：${current ? '当前阶段' : step.state}${step.date ? ` · ${step.date}` : ''}`}>
        {key && onSelectStage ? <button type="button" className="job-step-button" aria-pressed={key === selectedStage} onClick={() => onSelectStage(key)}>{content}</button> : content}
        {onInsertAfter && step.label !== 'Offer' && <button type="button" className="job-step-insert" aria-label={`在${step.label}后添加阶段`} title={`在${step.label}后添加阶段`} onClick={() => onInsertAfter(key || '')}><Plus size={13} aria-hidden="true" /></button>}
      </li>
    })}
  </ol>
}
